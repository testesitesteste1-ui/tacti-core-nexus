import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Shuffle, Users, Car, Trophy, Clock, CheckCircle, ArrowRight,
    RotateCcw, ParkingSquare, ListOrdered, Search, AlertTriangle, Undo2,
    FileText, FileSpreadsheet, Edit, Check, X, SkipForward, UserX, Dices
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import type { Participant, ParkingSpot, LotterySession, LotteryResult, SpotType } from '@/types/lottery';
import { savePublicResults } from '@/utils/publicResults';
import { generateLotteryPDF } from '@/utils/pdfGenerator';
import * as XLSX from 'xlsx';

// ============================================================================
// 🎲 FUNÇÃO DE EMBARALHAMENTO (Fisher-Yates)
// ============================================================================
function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const randomSeed = Math.random() + (Date.now() % 1000) / 1000000;
        const j = Math.floor(randomSeed * (i + 1)) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ============================================================================
// 🎯 TIPOS
// ============================================================================
interface DrawnParticipant extends Participant {
    drawOrder: number;
    allocatedSpots: ParkingSpot[];
    status: 'waiting' | 'choosing' | 'completed' | 'skipped';
    isAbsent?: boolean;
}

// ============================================================================
// 🎨 COMPONENTE PRINCIPAL
// ============================================================================
export default function LotteryChoiceSystem(): JSX.Element {
    // ✅ CONTEXTO REAL
    const { participants, parkingSpots, selectedBuilding } = useAppContext();
    const { toast } = useToast();

    // Filtrar por prédio selecionado
    const buildingParticipants = participants.filter((p: Participant) => p.buildingId === selectedBuilding?.id);
    const buildingSpots = parkingSpots.filter((s: ParkingSpot) =>
        s.buildingId === selectedBuilding?.id && s.status === 'available'
    );

    // Estados principais
    const [sessionFinalized, setSessionFinalized] = useState<boolean>(false);
    const [drawnOrder, setDrawnOrder] = useState<DrawnParticipant[]>([]);
    const [currentTurnIndex, setCurrentTurnIndex] = useState<number>(0);
    const [availableSpots, setAvailableSpots] = useState<ParkingSpot[]>([]);
    const [isRestored, setIsRestored] = useState<boolean>(false);

    // Estados de UI
    const [isDrawing, setIsDrawing] = useState<boolean>(false);
    const [drawProgress, setDrawProgress] = useState<number>(0);
    const [searchSpot, setSearchSpot] = useState<string>('');
    const [filterType, setFilterType] = useState<string>('all');
    const [isSelectingSpot, setIsSelectingSpot] = useState<boolean>(false);
    const [sessionStarted, setSessionStarted] = useState<boolean>(false);

    // Estado para busca de unidade
    const [searchUnitDialog, setSearchUnitDialog] = useState<boolean>(false);
    const [searchUnit, setSearchUnit] = useState<string>('');
    const [searchResults, setSearchResults] = useState<DrawnParticipant[]>([]);

    // Estado para vaga pendente de confirmação
    const [pendingSpot, setPendingSpot] = useState<ParkingSpot | null>(null);

    // Estado para alterar vaga já escolhida
    const [editingParticipantDialog, setEditingParticipantDialog] = useState<boolean>(false);
    const [selectedParticipantToEdit, setSelectedParticipantToEdit] = useState<DrawnParticipant | null>(null);
    const [spotToReplace, setSpotToReplace] = useState<ParkingSpot | null>(null);
    const [newSpotForEdit, setNewSpotForEdit] = useState<ParkingSpot | null>(null);

    // ============================================================================
    // 💾 PERSISTÊNCIA DO SORTEIO
    // ============================================================================
    const STORAGE_KEY = `lottery-choice-${selectedBuilding?.id}`;

    // Carregar dados salvos ao montar o componente
    useEffect(() => {
        if (!selectedBuilding?.id) return;

        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                setDrawnOrder(data.drawnOrder || []);
                setCurrentTurnIndex(data.currentTurnIndex || 0);
                setSessionStarted(data.sessionStarted || false);
                setSessionFinalized(data.sessionFinalized || false);

                if (data.availableSpots) {
                    setAvailableSpots(data.availableSpots);
                } else {
                    setAvailableSpots(buildingSpots);
                }

                setIsRestored(true);

                if (data.sessionStarted) {
                    toast({
                        title: "Sorteio restaurado",
                        description: "Continuando de onde você parou.",
                    });
                }
            } catch (error) {
                console.error('Erro ao restaurar sorteio:', error);
                setIsRestored(true);
            }
        } else {
            setAvailableSpots(buildingSpots);
            setIsRestored(true);
        }
    }, [selectedBuilding?.id]);

    // Salvar dados sempre que mudarem
    useEffect(() => {
        if (!selectedBuilding?.id || !sessionStarted || !isRestored) return;

        const dataToSave = {
            drawnOrder,
            currentTurnIndex,
            availableSpots,
            sessionStarted,
            sessionFinalized
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }, [drawnOrder, currentTurnIndex, availableSpots, sessionStarted, sessionFinalized, selectedBuilding?.id, isRestored]);

    // ============================================================================
    // 📤 FUNÇÃO: SALVAR RESULTADOS PÚBLICOS DO SORTEIO DE ESCOLHA
    // ============================================================================
    const saveChoiceResultsToPublic = async (completedOrder: DrawnParticipant[]): Promise<void> => {
        if (!selectedBuilding?.id) return;

        try {
            const results: LotteryResult[] = [];
            completedOrder.forEach((participant) => {
                participant.allocatedSpots.forEach((spot) => {
                    const result: LotteryResult = {
                        id: `choice-${participant.id}-${spot.id}`,
                        participantId: participant.id,
                        parkingSpotId: spot.id,
                        timestamp: new Date(),
                        priority: participant.hasSpecialNeeds ? 'special-needs' :
                                  participant.isElderly ? 'elderly' : 'normal',
                        participantSnapshot: {
                            name: participant.name,
                            block: participant.block,
                            unit: participant.unit,
                        },
                        spotSnapshot: {
                            number: spot.number,
                            floor: spot.floor,
                            type: spot.type,
                            size: spot.size,
                            isCovered: spot.isCovered,
                            isUncovered: spot.isUncovered,
                        },
                    };
                    results.push(result);
                });
            });

            const session: LotterySession = {
                id: `choice-session-${Date.now()}`,
                buildingId: selectedBuilding.id,
                name: `Sorteio de Escolha - ${new Date().toLocaleDateString('pt-BR')}`,
                date: new Date(),
                participants: completedOrder.map(p => p.id),
                availableSpots: buildingSpots.map(s => s.id),
                results: results,
                status: 'completed',
                settings: {
                    allowSharedSpots: false,
                    prioritizeElders: true,
                    prioritizeSpecialNeeds: true,
                    zoneByProximity: false,
                },
            };

            const saveResult = await savePublicResults(
                session,
                selectedBuilding.name || 'Condomínio',
                participants,
                parkingSpots,
                selectedBuilding.company
            );

            if (saveResult.success) {
                toast({
                    title: "Resultados publicados! 📱",
                    description: "Os resultados estão disponíveis no QR Code.",
                });
            }
        } catch (error) {
            console.error('Erro ao salvar resultados públicos:', error);
        }
    };

    // ============================================================================
    // 🎲 FUNÇÃO: SORTEAR ORDEM DOS PARTICIPANTES (COM PRIORIDADES)
    // ============================================================================
    const handleDrawOrder = async (): Promise<void> => {
        if (buildingParticipants.length === 0) {
            toast({
                title: "Erro",
                description: "Não há participantes cadastrados neste prédio.",
                variant: "destructive",
            });
            return;
        }

        if (buildingSpots.length === 0) {
            toast({
                title: "Erro",
                description: "Não há vagas disponíveis neste prédio.",
                variant: "destructive",
            });
            return;
        }

        setIsDrawing(true);
        setDrawProgress(0);

        // Animação de progresso
        for (let i = 0; i <= 100; i += 5) {
            setDrawProgress(i);
            await new Promise(resolve => setTimeout(resolve, 30));
        }

        // ✅ SEPARAR POR PRIORIDADE
        // 1. PcD primeiro
        const pcdParticipants = buildingParticipants.filter(p => p.hasSpecialNeeds);
        // 2. Idosos segundo
        const elderlyParticipants = buildingParticipants.filter(p => p.isElderly && !p.hasSpecialNeeds);
        // 3. Normais (não inadimplentes)
        const normalParticipants = buildingParticipants.filter(p => 
            !p.hasSpecialNeeds && !p.isElderly && p.isUpToDate !== false
        );
        // 4. Inadimplentes por último
        const delinquentParticipants = buildingParticipants.filter(p => 
            !p.hasSpecialNeeds && !p.isElderly && p.isUpToDate === false
        );

        // Embaralhar cada grupo individualmente
        const shuffledPcd = shuffleArray(pcdParticipants);
        const shuffledElderly = shuffleArray(elderlyParticipants);
        const shuffledNormal = shuffleArray(normalParticipants);
        const shuffledDelinquent = shuffleArray(delinquentParticipants);

        // Juntar na ordem correta
        const orderedParticipants = [
            ...shuffledPcd,
            ...shuffledElderly,
            ...shuffledNormal,
            ...shuffledDelinquent
        ];

        const drawn: DrawnParticipant[] = orderedParticipants.map((p, index) => ({
            ...p,
            drawOrder: index + 1,
            allocatedSpots: [],
            status: index === 0 ? 'choosing' : 'waiting',
            isAbsent: false
        }));

        setDrawnOrder(drawn);
        setCurrentTurnIndex(0);
        setAvailableSpots(buildingSpots);
        setSessionStarted(true);
        setIsDrawing(false);

        toast({
            title: "Ordem sorteada!",
            description: `${drawn.length} participantes na fila. PcD: ${pcdParticipants.length}, Idosos: ${elderlyParticipants.length}, Normais: ${normalParticipants.length}, Inadimplentes: ${delinquentParticipants.length}`,
        });
    };

    // ============================================================================
    // ✅ FUNÇÃO: SELECIONAR VAGA (PENDENTE DE CONFIRMAÇÃO)
    // ============================================================================
    const handleSelectSpot = (spot: ParkingSpot): void => {
        setPendingSpot(spot);
    };

    // ============================================================================
    // ✅ FUNÇÃO: CONFIRMAR VAGA SELECIONADA
    // ============================================================================
    const handleConfirmSpot = (): void => {
        if (!pendingSpot) return;

        const currentParticipant = drawnOrder[currentTurnIndex];
        if (!currentParticipant) return;

        // Adicionar vaga aos alocados
        const updatedParticipant: DrawnParticipant = {
            ...currentParticipant,
            allocatedSpots: [...currentParticipant.allocatedSpots, pendingSpot]
        };

        // Remover vaga dos disponíveis
        const updatedAvailable = availableSpots.filter((s: ParkingSpot) => s.id !== pendingSpot.id);
        setAvailableSpots(updatedAvailable);

        // ✅ CORRIGIDO: Verificar se participante completou TODAS suas escolhas
        const spotsNeededTotal = currentParticipant.numberOfSpots || 1;
        const spotsAllocatedNow = updatedParticipant.allocatedSpots.length;
        const needsMoreSpots = spotsAllocatedNow < spotsNeededTotal;

        if (needsMoreSpots && updatedAvailable.length > 0) {
            // Ainda precisa escolher mais vagas
            const updatedOrder = [...drawnOrder];
            updatedOrder[currentTurnIndex] = updatedParticipant;
            setDrawnOrder(updatedOrder);

            toast({
                title: `Vaga ${pendingSpot.number} alocada!`,
                description: `Escolha mais ${spotsNeededTotal - spotsAllocatedNow} vaga(s).`,
            });
        } else {
            // Completou - marcar como completo e avançar
            updatedParticipant.status = 'completed';

            const updatedOrder = [...drawnOrder];
            updatedOrder[currentTurnIndex] = updatedParticipant;

            // Encontrar próximo participante que não seja skipped/completed
            let nextIndex = currentTurnIndex + 1;
            while (nextIndex < updatedOrder.length && 
                   (updatedOrder[nextIndex].status === 'completed' || updatedOrder[nextIndex].status === 'skipped')) {
                nextIndex++;
            }

            if (nextIndex < updatedOrder.length) {
                updatedOrder[nextIndex].status = 'choosing';
                setCurrentTurnIndex(nextIndex);
            }

            setDrawnOrder(updatedOrder);

            // Verificar se todos completaram (incluindo skipped)
            const allDone = updatedOrder.every((p: DrawnParticipant) => 
                p.status === 'completed' || p.status === 'skipped'
            );

            if (allDone) {
                handleFinalizeSession(updatedOrder, updatedAvailable);
            } else {
                toast({
                    title: "Participante concluído!",
                    description: `${currentParticipant.block ? `Bloco ${currentParticipant.block} - ` : ''}Unidade ${currentParticipant.unit} escolheu ${spotsAllocatedNow} vaga(s).`,
                });
            }
        }

        setPendingSpot(null);
        setIsSelectingSpot(false);
    };

    // ============================================================================
    // ⏭️ FUNÇÃO: PULAR PARTICIPANTE AUSENTE
    // ============================================================================
    const handleSkipParticipant = (): void => {
        const currentParticipant = drawnOrder[currentTurnIndex];
        if (!currentParticipant) return;

        const updatedOrder = [...drawnOrder];
        updatedOrder[currentTurnIndex] = {
            ...currentParticipant,
            status: 'skipped',
            isAbsent: true
        };

        // Encontrar próximo participante
        let nextIndex = currentTurnIndex + 1;
        while (nextIndex < updatedOrder.length && 
               (updatedOrder[nextIndex].status === 'completed' || updatedOrder[nextIndex].status === 'skipped')) {
            nextIndex++;
        }

        if (nextIndex < updatedOrder.length) {
            updatedOrder[nextIndex].status = 'choosing';
            setCurrentTurnIndex(nextIndex);
            setDrawnOrder(updatedOrder);

            toast({
                title: "Participante pulado",
                description: `${currentParticipant.block ? `Bloco ${currentParticipant.block} - ` : ''}Unidade ${currentParticipant.unit} marcado como ausente.`,
            });
        } else {
            // Todos terminaram ou foram pulados
            setDrawnOrder(updatedOrder);
            handleFinalizeSession(updatedOrder, availableSpots);
        }
    };

    // ============================================================================
    // 🎲 FUNÇÃO: SORTEAR VAGAS PARA AUSENTES
    // ============================================================================
    const handleRandomizeAbsent = (): void => {
        const absentParticipants = drawnOrder.filter(p => p.status === 'skipped' && p.isAbsent);
        
        if (absentParticipants.length === 0) {
            toast({
                title: "Nenhum ausente",
                description: "Não há participantes ausentes para sortear.",
                variant: "destructive",
            });
            return;
        }

        if (availableSpots.length === 0) {
            toast({
                title: "Sem vagas",
                description: "Não há vagas disponíveis para sortear.",
                variant: "destructive",
            });
            return;
        }

        let remainingSpots = [...availableSpots];
        const updatedOrder = [...drawnOrder];

        // Embaralhar ausentes
        const shuffledAbsent = shuffleArray(absentParticipants);

        shuffledAbsent.forEach((participant) => {
            const participantIndex = updatedOrder.findIndex(p => p.id === participant.id);
            if (participantIndex === -1) return;

            const spotsNeeded = (participant.numberOfSpots || 1) - participant.allocatedSpots.length;
            const spotsToAllocate = Math.min(spotsNeeded, remainingSpots.length);

            if (spotsToAllocate > 0) {
                // Sortear vagas aleatoriamente
                const shuffledSpots = shuffleArray(remainingSpots);
                const allocatedSpots = shuffledSpots.slice(0, spotsToAllocate);

                updatedOrder[participantIndex] = {
                    ...updatedOrder[participantIndex],
                    allocatedSpots: [...updatedOrder[participantIndex].allocatedSpots, ...allocatedSpots],
                    status: 'completed',
                    isAbsent: true
                };

                // Remover vagas alocadas das disponíveis
                remainingSpots = remainingSpots.filter(s => !allocatedSpots.some(a => a.id === s.id));
            }
        });

        setDrawnOrder(updatedOrder);
        setAvailableSpots(remainingSpots);

        const allocatedCount = absentParticipants.length - updatedOrder.filter(p => p.status === 'skipped').length;

        toast({
            title: "Ausentes sorteados! 🎲",
            description: `${allocatedCount} participante(s) ausente(s) receberam vagas aleatoriamente.`,
        });

        // Verificar se todos completaram
        const allDone = updatedOrder.every((p: DrawnParticipant) => 
            p.status === 'completed' || (p.status === 'skipped' && p.allocatedSpots.length > 0)
        );

        if (allDone) {
            handleFinalizeSession(updatedOrder, remainingSpots);
        }
    };

    // ============================================================================
    // 🏁 FUNÇÃO: FINALIZAR SESSÃO
    // ============================================================================
    const handleFinalizeSession = (finalOrder: DrawnParticipant[], remainingSpots: ParkingSpot[]): void => {
        // Verificar se há ausentes sem vagas
        const absentWithoutSpots = finalOrder.filter(p => p.status === 'skipped' && p.allocatedSpots.length === 0);
        
        if (absentWithoutSpots.length > 0 && remainingSpots.length > 0) {
            toast({
                title: "Sorteio quase completo!",
                description: `Ainda há ${absentWithoutSpots.length} ausente(s) e ${remainingSpots.length} vaga(s). Use "Sortear Ausentes" para alocar.`,
            });
            return;
        }

        setSessionFinalized(true);
        saveChoiceResultsToPublic(finalOrder.filter(p => p.allocatedSpots.length > 0));

        toast({
            title: "Sorteio Finalizado! 🎉",
            description: "Todos os participantes foram processados.",
        });
    };

    // ============================================================================
    // ❌ FUNÇÃO: CANCELAR SELEÇÃO DE VAGA
    // ============================================================================
    const handleCancelSpotSelection = (): void => {
        setPendingSpot(null);
    };

    // ============================================================================
    // 🔄 FUNÇÃO: DESFAZER ÚLTIMA ESCOLHA
    // ============================================================================
    const handleUndoLastChoice = (): void => {
        const currentParticipant = drawnOrder[currentTurnIndex];
        if (!currentParticipant || currentParticipant.allocatedSpots.length === 0) {
            toast({
                title: "Nada para desfazer",
                description: "Este participante ainda não escolheu nenhuma vaga.",
                variant: "destructive",
            });
            return;
        }

        const lastSpot = currentParticipant.allocatedSpots[currentParticipant.allocatedSpots.length - 1];
        const updatedAllocatedSpots = currentParticipant.allocatedSpots.slice(0, -1);
        const updatedAvailableSpots = [...availableSpots, lastSpot];

        const updatedOrder = [...drawnOrder];
        updatedOrder[currentTurnIndex] = {
            ...currentParticipant,
            allocatedSpots: updatedAllocatedSpots
        };

        setDrawnOrder(updatedOrder);
        setAvailableSpots(updatedAvailableSpots);

        toast({
            title: "Escolha desfeita",
            description: `Vaga ${lastSpot.number} devolvida às opções disponíveis.`,
        });
    };

    // ============================================================================
    // 🔄 FUNÇÃO: REINICIAR SORTEIO
    // ============================================================================
    const handleReset = (): void => {
        if (selectedBuilding?.id) {
            localStorage.removeItem(STORAGE_KEY);
        }

        setDrawnOrder([]);
        setCurrentTurnIndex(0);
        setAvailableSpots(buildingSpots);
        setSessionStarted(false);
        setSearchSpot('');
        setFilterType('all');
        setPendingSpot(null);
        setSessionFinalized(false);

        toast({
            title: "Sorteio reiniciado",
            description: "Sistema pronto para um novo sorteio.",
        });
    };

    // ============================================================================
    // 🔍 BUSCAR POSIÇÃO DA UNIDADE (ENCONTRAR TODAS)
    // ============================================================================
    const handleSearchUnit = (): void => {
        if (!searchUnit.trim()) {
            setSearchResults([]);
            return;
        }

        const searchTerm = searchUnit.toLowerCase().trim();
        
        // ✅ CORRIGIDO: Encontrar TODAS as unidades que correspondem
        const found = drawnOrder.filter((p: DrawnParticipant) =>
            p.unit.toLowerCase().includes(searchTerm) ||
            (p.block && p.block.toLowerCase().includes(searchTerm)) ||
            (p.name && p.name.toLowerCase().includes(searchTerm))
        );

        setSearchResults(found);

        if (found.length === 0) {
            toast({
                title: "Unidade não encontrada",
                description: "Esta unidade não está participando do sorteio.",
                variant: "destructive",
            });
        } else if (found.length === 1) {
            toast({
                title: `Unidade encontrada!`,
                description: `${found[0].block ? `Bloco ${found[0].block} - ` : ''}Unidade ${found[0].unit} está na posição ${found[0].drawOrder}º`,
            });
        } else {
            toast({
                title: `${found.length} unidades encontradas!`,
                description: "Veja os resultados abaixo.",
            });
        }
    };

    // ============================================================================
    // ✏️ FUNÇÃO: ABRIR DIALOG PARA ALTERAR VAGA
    // ============================================================================
    const handleOpenEditDialog = (participant: DrawnParticipant): void => {
        setSelectedParticipantToEdit(participant);
        setSpotToReplace(null);
        setNewSpotForEdit(null);
        setEditingParticipantDialog(true);
    };

    // ============================================================================
    // ✅ FUNÇÃO: CONFIRMAR ALTERAÇÃO DE VAGA
    // ============================================================================
    const handleConfirmEditSpot = (): void => {
        if (!selectedParticipantToEdit || !spotToReplace || !newSpotForEdit) {
            toast({
                title: "Erro",
                description: "Selecione a vaga antiga e a nova vaga.",
                variant: "destructive",
            });
            return;
        }

        const participantIndex = drawnOrder.findIndex((p: DrawnParticipant) => p.id === selectedParticipantToEdit.id);
        if (participantIndex === -1) return;

        const updatedAllocatedSpots = selectedParticipantToEdit.allocatedSpots.filter(
            (s: ParkingSpot) => s.id !== spotToReplace.id
        );
        updatedAllocatedSpots.push(newSpotForEdit);

        const updatedAvailableSpots = availableSpots.filter((s: ParkingSpot) => s.id !== newSpotForEdit.id);
        updatedAvailableSpots.push(spotToReplace);

        const updatedOrder = [...drawnOrder];
        updatedOrder[participantIndex] = {
            ...selectedParticipantToEdit,
            allocatedSpots: updatedAllocatedSpots
        };

        setDrawnOrder(updatedOrder);
        setAvailableSpots(updatedAvailableSpots);
        setEditingParticipantDialog(false);

        toast({
            title: "Vaga alterada!",
            description: `Vaga ${spotToReplace.number} trocada por ${newSpotForEdit.number}`,
        });

        setSelectedParticipantToEdit(null);
        setSpotToReplace(null);
        setNewSpotForEdit(null);
    };

    // ============================================================================
    // 📄 FUNÇÃO: GERAR PDF POR PARTICIPANTE
    // ============================================================================
    const handleGeneratePDFByParticipant = (): void => {
        const completedParticipants = drawnOrder.filter(p => p.allocatedSpots.length > 0);
        
        if (completedParticipants.length === 0) {
            toast({
                title: "Nenhum resultado",
                description: "Não há resultados para exportar.",
                variant: "destructive",
            });
            return;
        }

        // Converter para LotteryResult
        const results: LotteryResult[] = [];
        completedParticipants.forEach((participant) => {
            participant.allocatedSpots.forEach((spot) => {
                results.push({
                    id: `choice-${participant.id}-${spot.id}`,
                    participantId: participant.id,
                    parkingSpotId: spot.id,
                    timestamp: new Date(),
                    priority: participant.hasSpecialNeeds ? 'special-needs' :
                              participant.isElderly ? 'elderly' : 'normal',
                    participantSnapshot: {
                        name: participant.name,
                        block: participant.block,
                        unit: participant.unit,
                    },
                    spotSnapshot: {
                        number: spot.number,
                        floor: spot.floor,
                        type: spot.type,
                        size: spot.size,
                        isCovered: spot.isCovered,
                        isUncovered: spot.isUncovered,
                    },
                });
            });
        });

        generateLotteryPDF(
            `Sorteio de Escolha - ${new Date().toLocaleDateString('pt-BR')}`,
            results,
            participants,
            parkingSpots,
            selectedBuilding?.company || 'exvagas',
            selectedBuilding?.name,
            'participant'
        );

        toast({
            title: "PDF gerado!",
            description: "O PDF por participante foi gerado.",
        });
    };

    // ============================================================================
    // 📄 FUNÇÃO: GERAR PDF POR VAGA
    // ============================================================================
    const handleGeneratePDFBySpot = (): void => {
        const completedParticipants = drawnOrder.filter(p => p.allocatedSpots.length > 0);
        
        if (completedParticipants.length === 0) {
            toast({
                title: "Nenhum resultado",
                description: "Não há resultados para exportar.",
                variant: "destructive",
            });
            return;
        }

        const results: LotteryResult[] = [];
        completedParticipants.forEach((participant) => {
            participant.allocatedSpots.forEach((spot) => {
                results.push({
                    id: `choice-${participant.id}-${spot.id}`,
                    participantId: participant.id,
                    parkingSpotId: spot.id,
                    timestamp: new Date(),
                    priority: participant.hasSpecialNeeds ? 'special-needs' :
                              participant.isElderly ? 'elderly' : 'normal',
                    participantSnapshot: {
                        name: participant.name,
                        block: participant.block,
                        unit: participant.unit,
                    },
                    spotSnapshot: {
                        number: spot.number,
                        floor: spot.floor,
                        type: spot.type,
                        size: spot.size,
                        isCovered: spot.isCovered,
                        isUncovered: spot.isUncovered,
                    },
                });
            });
        });

        generateLotteryPDF(
            `Sorteio de Escolha - ${new Date().toLocaleDateString('pt-BR')}`,
            results,
            participants,
            parkingSpots,
            selectedBuilding?.company || 'exvagas',
            selectedBuilding?.name,
            'spot'
        );

        toast({
            title: "PDF gerado!",
            description: "O PDF por vaga foi gerado.",
        });
    };

    // ============================================================================
    // 📊 FUNÇÃO: GERAR EXCEL
    // ============================================================================
    const handleGenerateExcel = (): void => {
        const completedParticipants = drawnOrder.filter(p => p.allocatedSpots.length > 0);
        
        if (completedParticipants.length === 0) {
            toast({
                title: "Nenhum resultado",
                description: "Não há resultados para exportar.",
                variant: "destructive",
            });
            return;
        }

        // Criar dados para Excel
        const excelData: any[] = [];

        completedParticipants
            .sort((a, b) => {
                const blockCompare = (a.block || '').localeCompare(b.block || '', 'pt-BR', { numeric: true });
                if (blockCompare !== 0) return blockCompare;
                return (a.unit || '').localeCompare(b.unit || '', 'pt-BR', { numeric: true });
            })
            .forEach((participant) => {
                participant.allocatedSpots.forEach((spot, index) => {
                    excelData.push({
                        'Ordem': participant.drawOrder,
                        'Bloco': participant.block || '',
                        'Unidade': participant.unit,
                        'Nome': participant.name || '',
                        'Prioridade': participant.hasSpecialNeeds ? 'PcD' : 
                                     participant.isElderly ? 'Idoso' : 
                                     participant.isUpToDate === false ? 'Inadimplente' : 'Normal',
                        'Ausente': participant.isAbsent ? 'Sim' : 'Não',
                        'Vaga Nº': index + 1,
                        'Número da Vaga': spot.number,
                        'Andar': spot.floor,
                        'Tipo': Array.isArray(spot.type) ? spot.type.join(', ') : spot.type,
                        'Tamanho': spot.size,
                        'Coberta': spot.isCovered ? 'Sim' : spot.isUncovered ? 'Não' : '-',
                    });
                });
            });

        // Criar workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Ajustar largura das colunas
        ws['!cols'] = [
            { wch: 8 },  // Ordem
            { wch: 10 }, // Bloco
            { wch: 12 }, // Unidade
            { wch: 25 }, // Nome
            { wch: 15 }, // Prioridade
            { wch: 10 }, // Ausente
            { wch: 8 },  // Vaga Nº
            { wch: 15 }, // Número da Vaga
            { wch: 20 }, // Andar
            { wch: 30 }, // Tipo
            { wch: 10 }, // Tamanho
            { wch: 10 }, // Coberta
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Resultado Sorteio');

        // Baixar arquivo
        const fileName = `sorteio-escolha-${selectedBuilding?.name || 'resultado'}-${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);

        toast({
            title: "Excel gerado!",
            description: "O arquivo Excel foi baixado.",
        });
    };

    // ============================================================================
    // 🔍 FILTRAR VAGAS
    // ============================================================================
    const filteredSpots = useMemo(() => {
        let filtered = availableSpots;

        if (searchSpot) {
            const search = searchSpot.toLowerCase();
            filtered = filtered.filter((spot: ParkingSpot) =>
                spot.number.toLowerCase().includes(search) ||
                spot.floor.toLowerCase().includes(search)
            );
        }

        if (filterType !== 'all') {
            filtered = filtered.filter((spot: ParkingSpot) => {
                const types = Array.isArray(spot.type) ? spot.type : [spot.type];

                if (filterType === 'covered') return types.includes('Vaga Coberta') || spot.isCovered === true;
                if (filterType === 'uncovered') return types.includes('Vaga Descoberta') || spot.isUncovered === true;
                if (filterType === 'pcd') return types.includes('Vaga PcD');
                if (filterType === 'elderly') return types.includes('Vaga Idoso');
                if (filterType === 'large') return types.includes('Vaga Grande');
                if (filterType === 'small') return types.includes('Vaga Pequena');
                if (filterType === 'motorcycle') return types.includes('Vaga Motocicleta');
                if (filterType === 'common') return types.includes('Vaga Comum');
                if (filterType === 'linked') return types.includes('Vaga Presa');
                if (filterType === 'free') return types.includes('Vaga Livre');

                return true;
            });
        }

        return filtered.sort((a: ParkingSpot, b: ParkingSpot) =>
            a.number.localeCompare(b.number, 'pt-BR', { numeric: true })
        );
    }, [availableSpots, searchSpot, filterType]);

    // ============================================================================
    // 🏷️ FUNÇÃO: OBTER BADGES DE TIPO DA VAGA
    // ============================================================================
    const getSpotBadges = (spot: ParkingSpot) => {
        const types = Array.isArray(spot.type) ? spot.type : [spot.type];
        const badges: { label: string; variant: string; icon: string }[] = [];

        // Verificar tipos específicos
        if (types.includes('Vaga PcD')) badges.push({ label: 'PcD', variant: 'pcd', icon: '♿' });
        if (types.includes('Vaga Idoso')) badges.push({ label: 'Idoso', variant: 'elderly', icon: '👴' });
        if (types.includes('Vaga Grande')) badges.push({ label: 'Grande', variant: 'large', icon: '🚙' });
        if (types.includes('Vaga Pequena')) badges.push({ label: 'Pequena', variant: 'small', icon: '🚗' });
        if (types.includes('Vaga Motocicleta')) badges.push({ label: 'Moto', variant: 'motorcycle', icon: '🏍️' });
        if (types.includes('Vaga Presa')) badges.push({ label: 'Presa', variant: 'linked', icon: '🔗' });
        if (types.includes('Vaga Livre')) badges.push({ label: 'Livre', variant: 'unlinked', icon: '🔓' });
        
        // Cobertura
        if (spot.isCovered || types.includes('Vaga Coberta')) {
            badges.push({ label: 'Coberta', variant: 'covered', icon: '🏠' });
        }
        if (spot.isUncovered || types.includes('Vaga Descoberta')) {
            badges.push({ label: 'Descoberta', variant: 'uncovered', icon: '☀️' });
        }

        // Vaga Comum - mostrar apenas se não tem outros tipos específicos
        const hasSpecificType = types.some(t => 
            t !== 'Vaga Comum' && 
            t !== 'Vaga Coberta' && 
            t !== 'Vaga Descoberta'
        );
        if (types.includes('Vaga Comum') && !hasSpecificType) {
            badges.push({ label: 'Comum', variant: 'common', icon: '🅿️' });
        }

        return badges;
    };

    // ============================================================================
    // 🎨 PARTICIPANTE ATUAL
    // ============================================================================
    const currentParticipant = drawnOrder[currentTurnIndex];
    const spotsNeeded = currentParticipant
        ? (currentParticipant.numberOfSpots || 1) - currentParticipant.allocatedSpots.length
        : 0;

    const hasAvailableSpots = availableSpots.length > 0;
    const hasAbsentParticipants = drawnOrder.some(p => p.status === 'skipped' && p.isAbsent);

    // ============================================================================
    // 📊 ESTATÍSTICAS
    // ============================================================================
    const stats = {
        totalParticipants: buildingParticipants.length,
        totalSpots: buildingSpots.length,
        availableSpots: availableSpots.length,
        completed: drawnOrder.filter((p: DrawnParticipant) => p.status === 'completed').length,
        skipped: drawnOrder.filter((p: DrawnParticipant) => p.status === 'skipped').length,
        progress: drawnOrder.length > 0
            ? (drawnOrder.filter((p: DrawnParticipant) => p.status === 'completed' || p.status === 'skipped').length / drawnOrder.length) * 100
            : 0
    };

    // ============================================================================
    // 🎨 RENDER
    // ============================================================================
    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center">
                        <Shuffle className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Sorteio por Escolha</h1>
                        <p className="text-sm text-muted-foreground">
                            Sorteie a ordem e distribua as vagas manualmente
                        </p>
                    </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                    {sessionStarted && (
                        <>
                            <Button
                                onClick={() => {
                                    setSearchUnitDialog(true);
                                    setSearchResults([]);
                                    setSearchUnit('');
                                }}
                                variant="outline"
                            >
                                <Search className="mr-2 h-4 w-4" />
                                Ordem de Unidade
                            </Button>

                            {/* BOTÕES DE EXPORTAÇÃO */}
                            {drawnOrder.some((p: DrawnParticipant) => p.allocatedSpots.length > 0) && (
                                <>
                                    <Button onClick={handleGeneratePDFByParticipant} variant="outline">
                                        <FileText className="mr-2 h-4 w-4" />
                                        PDF por Participante
                                    </Button>
                                    <Button onClick={handleGeneratePDFBySpot} variant="outline">
                                        <FileText className="mr-2 h-4 w-4" />
                                        PDF por Vaga
                                    </Button>
                                    <Button onClick={handleGenerateExcel} variant="outline">
                                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                                        Excel
                                    </Button>
                                </>
                            )}

                            {/* BOTÃO SORTEAR AUSENTES */}
                            {hasAbsentParticipants && hasAvailableSpots && (
                                <Button onClick={handleRandomizeAbsent} variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50">
                                    <Dices className="mr-2 h-4 w-4" />
                                    Sortear Ausentes
                                </Button>
                            )}
                        </>
                    )}

                    {!sessionStarted ? (
                        <Button
                            onClick={handleDrawOrder}
                            disabled={isDrawing || buildingParticipants.length === 0 || buildingSpots.length === 0}
                            className="gradient-primary text-white shadow-medium"
                        >
                            {isDrawing ? (
                                <>
                                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                                    Sorteando...
                                </>
                            ) : (
                                <>
                                    <Shuffle className="mr-2 h-4 w-4" />
                                    Sortear Ordem
                                </>
                            )}
                        </Button>
                    ) : (
                        <Button onClick={handleReset} variant="outline">
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Reiniciar
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Participantes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalParticipants}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Car className="h-4 w-4" />
                            Vagas Disponíveis
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.availableSpots}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" />
                            Concluídos
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-success">{stats.completed}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <UserX className="h-4 w-4" />
                            Ausentes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-500">{stats.skipped}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Progresso</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Progress value={stats.progress} className="h-2" />
                        <p className="text-sm text-muted-foreground mt-1">
                            {Math.round(stats.progress)}%
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Progresso do Sorteio */}
            {isDrawing && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span>Sorteando ordem...</span>
                                <span>{drawProgress}%</span>
                            </div>
                            <Progress value={drawProgress} className="h-3" />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ALERTA: SORTEIO FINALIZADO */}
            {sessionFinalized && (
                <Card className="border-2 border-green-500 bg-green-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-700">
                            <Trophy className="h-5 w-5" />
                            Sorteio Finalizado!
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-green-700">
                            Todos os participantes foram processados. Use os botões acima para exportar os resultados.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* VEZ ATUAL */}
            {sessionStarted && currentParticipant && currentParticipant.status === 'choosing' && !sessionFinalized && (
                <Card className="border-2 border-primary shadow-lg">
                    <CardHeader className="bg-primary/5">
                        <CardTitle className="flex items-center gap-2">
                            <Trophy className="h-5 w-5 text-primary" />
                            Vez Atual: {currentParticipant.drawOrder}º Sorteado
                            {currentParticipant.hasSpecialNeeds && <Badge variant="pcd">PcD</Badge>}
                            {currentParticipant.isElderly && <Badge variant="elderly">Idoso</Badge>}
                            {currentParticipant.isUpToDate === false && <Badge variant="destructive">Inadimplente</Badge>}
                        </CardTitle>
                        <CardDescription>
                            {currentParticipant.block && `Bloco ${currentParticipant.block} - `}
                            Unidade {currentParticipant.unit} - {currentParticipant.name}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Vagas necessárias</p>
                                    <p className="text-2xl font-bold">{currentParticipant.numberOfSpots || 1}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Já alocadas</p>
                                    <p className="text-2xl font-bold text-success">
                                        {currentParticipant.allocatedSpots.length}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Faltam</p>
                                    <p className="text-2xl font-bold text-orange-500">
                                        {spotsNeeded}
                                    </p>
                                </div>
                            </div>

                            {currentParticipant.allocatedSpots.length > 0 && (
                                <div>
                                    <p className="text-sm font-medium mb-2">Vagas alocadas:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {currentParticipant.allocatedSpots.map((spot: ParkingSpot) => (
                                            <Badge key={spot.id} variant="secondary">
                                                Vaga {spot.number} - {spot.floor}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2 flex-wrap">
                                <Button
                                    onClick={() => setIsSelectingSpot(true)}
                                    className="flex-1 gradient-primary text-white"
                                    disabled={spotsNeeded === 0 || !hasAvailableSpots}
                                >
                                    <ParkingSquare className="mr-2 h-4 w-4" />
                                    {!hasAvailableSpots
                                        ? 'Sem vagas disponíveis'
                                        : `Escolher Vaga ${spotsNeeded > 1 ? `(${spotsNeeded} restantes)` : ''}`
                                    }
                                </Button>

                                <Button
                                    onClick={handleSkipParticipant}
                                    variant="outline"
                                    className="border-orange-500 text-orange-600 hover:bg-orange-50"
                                >
                                    <SkipForward className="mr-2 h-4 w-4" />
                                    Pular (Ausente)
                                </Button>

                                {currentParticipant.allocatedSpots.length > 0 && (
                                    <Button
                                        onClick={handleUndoLastChoice}
                                        variant="outline"
                                        className="border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                                    >
                                        <Undo2 className="mr-2 h-4 w-4" />
                                        Desfazer
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ORDEM SORTEADA */}
            {sessionStarted && drawnOrder.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ListOrdered className="h-5 w-5" />
                            Ordem do Sorteio
                        </CardTitle>
                        <CardDescription>
                            Ordem: PcD → Idosos → Normais → Inadimplentes
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[400px]">
                            <div className="space-y-2">
                                {drawnOrder.map((participant: DrawnParticipant) => (
                                    <div
                                        key={participant.id}
                                        className={`p-4 rounded-lg border-2 transition-all ${
                                            participant.status === 'choosing'
                                                ? 'border-primary bg-primary/5 shadow-md'
                                                : participant.status === 'completed'
                                                    ? 'border-success bg-success/5'
                                                    : participant.status === 'skipped'
                                                        ? 'border-orange-400 bg-orange-50'
                                                        : 'border-muted bg-muted/30'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                                                    participant.status === 'choosing'
                                                        ? 'bg-primary text-primary-foreground'
                                                        : participant.status === 'completed'
                                                            ? 'bg-success text-success-foreground'
                                                            : participant.status === 'skipped'
                                                                ? 'bg-orange-400 text-white'
                                                                : 'bg-muted text-muted-foreground'
                                                }`}>
                                                    {participant.drawOrder}
                                                </div>
                                                <div>
                                                    <div className="font-medium flex items-center gap-2">
                                                        {participant.block && `Bloco ${participant.block} - `}
                                                        Unidade {participant.unit}
                                                        {participant.hasSpecialNeeds && <Badge variant="pcd" className="text-xs">PcD</Badge>}
                                                        {participant.isElderly && <Badge variant="elderly" className="text-xs">Idoso</Badge>}
                                                        {participant.isUpToDate === false && <Badge variant="destructive" className="text-xs">Inad.</Badge>}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {participant.name}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {participant.status === 'choosing' && (
                                                    <Badge variant="default">
                                                        <ArrowRight className="h-3 w-3 mr-1" />
                                                        Escolhendo
                                                    </Badge>
                                                )}
                                                {participant.status === 'completed' && (
                                                    <>
                                                        <Badge variant="secondary" className="bg-success text-success-foreground">
                                                            <CheckCircle className="h-3 w-3 mr-1" />
                                                            {participant.isAbsent ? 'Sorteado' : 'Completo'}
                                                        </Badge>
                                                        {!sessionFinalized && (
                                                            <Button
                                                                onClick={() => handleOpenEditDialog(participant)}
                                                                variant="outline"
                                                                size="sm"
                                                            >
                                                                <Edit className="h-3 w-3 mr-1" />
                                                                Alterar
                                                            </Button>
                                                        )}
                                                    </>
                                                )}
                                                {participant.status === 'skipped' && participant.allocatedSpots.length === 0 && (
                                                    <Badge variant="outline" className="border-orange-400 text-orange-600">
                                                        <UserX className="h-3 w-3 mr-1" />
                                                        Ausente
                                                    </Badge>
                                                )}
                                                {participant.allocatedSpots.length > 0 && (
                                                    <Badge variant="outline">
                                                        {participant.allocatedSpots.length}/{participant.numberOfSpots || 1} vagas
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        {participant.allocatedSpots.length > 0 && (
                                            <div className="mt-3 pl-11 flex flex-wrap gap-2">
                                                {participant.allocatedSpots.map((spot: ParkingSpot) => (
                                                    <Badge key={spot.id} variant="secondary" className="text-xs">
                                                        🅿️ {spot.number}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            )}

            {/* DIALOG: BUSCAR ORDEM DE UNIDADE */}
            <Dialog open={searchUnitDialog} onOpenChange={setSearchUnitDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Buscar Ordem de Unidade</DialogTitle>
                        <DialogDescription>
                            Digite o número da unidade, bloco ou nome para verificar a posição no sorteio.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Unidade, Bloco ou Nome</Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Ex: 101, A, João..."
                                    value={searchUnit}
                                    onChange={(e) => {
                                        setSearchUnit(e.target.value);
                                        if (e.target.value.length >= 1) {
                                            const searchTerm = e.target.value.toLowerCase().trim();
                                            const found = drawnOrder.filter((p: DrawnParticipant) =>
                                                p.unit.toLowerCase().includes(searchTerm) ||
                                                (p.block && p.block.toLowerCase().includes(searchTerm)) ||
                                                (p.name && p.name.toLowerCase().includes(searchTerm))
                                            );
                                            setSearchResults(found);
                                        } else {
                                            setSearchResults([]);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleSearchUnit();
                                        }
                                    }}
                                />
                                <Button onClick={handleSearchUnit}>
                                    <Search className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* RESULTADOS DA BUSCA */}
                        {searchResults.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-green-600">Resultados encontrados ({searchResults.length}):</Label>
                                <ScrollArea className="h-[200px] border rounded-lg p-3 bg-green-50">
                                    <div className="space-y-2">
                                        {searchResults.map((participant: DrawnParticipant) => (
                                            <div
                                                key={participant.id}
                                                className="p-2 border rounded-md bg-white"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium">
                                                        {participant.block && `Bl. ${participant.block} - `}
                                                        Un. {participant.unit}
                                                    </span>
                                                    <Badge variant="default" className="text-lg">
                                                        {participant.drawOrder}º
                                                    </Badge>
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {participant.name}
                                                </div>
                                                <div className="flex gap-1 mt-1">
                                                    {participant.hasSpecialNeeds && <Badge variant="pcd" className="text-xs">PcD</Badge>}
                                                    {participant.isElderly && <Badge variant="elderly" className="text-xs">Idoso</Badge>}
                                                    {participant.isUpToDate === false && <Badge variant="destructive" className="text-xs">Inad.</Badge>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}

                        {/* LISTA COMPLETA */}
                        <div className="space-y-2">
                            <Label>Todas as unidades sorteadas:</Label>
                            <ScrollArea className="h-[250px] border rounded-lg p-3">
                                <div className="space-y-2">
                                    {drawnOrder.map((participant: DrawnParticipant) => (
                                        <div
                                            key={participant.id}
                                            className={`p-2 border rounded-md hover:bg-muted/50 cursor-pointer ${
                                                searchResults.some(r => r.id === participant.id) ? 'bg-green-100 border-green-400' : ''
                                            }`}
                                            onClick={() => {
                                                setSearchUnit(participant.unit);
                                                setSearchResults([participant]);
                                            }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium">
                                                    {participant.block && `Bl. ${participant.block} - `}
                                                    Un. {participant.unit}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    {participant.hasSpecialNeeds && <Badge variant="pcd" className="text-xs">PcD</Badge>}
                                                    {participant.isElderly && <Badge variant="elderly" className="text-xs">Idoso</Badge>}
                                                    <Badge variant="outline">
                                                        {participant.drawOrder}º
                                                    </Badge>
                                                </div>
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {participant.name}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>

                        <Button onClick={() => setSearchUnitDialog(false)} variant="outline" className="w-full">
                            Fechar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* DIALOG: ALTERAR VAGA JÁ ESCOLHIDA */}
            <Dialog open={editingParticipantDialog} onOpenChange={setEditingParticipantDialog}>
                <DialogContent className="max-w-5xl max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle className="text-xl">
                            Alterar Vaga - {selectedParticipantToEdit?.block && `Bl. ${selectedParticipantToEdit.block} - `}
                            Un. {selectedParticipantToEdit?.unit}
                        </DialogTitle>
                        <DialogDescription className="text-base">
                            Selecione a vaga que deseja trocar e depois escolha a nova vaga
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* PASSO 1: SELECIONAR VAGA ANTIGA */}
                        <div className="space-y-2">
                            <Label className="text-lg font-semibold">1. Selecione a vaga que deseja trocar:</Label>
                            <div className="flex flex-wrap gap-2">
                                {selectedParticipantToEdit?.allocatedSpots.map((spot: ParkingSpot) => (
                                    <Card
                                        key={spot.id}
                                        className={`cursor-pointer transition-all ${spotToReplace?.id === spot.id
                                            ? 'border-2 border-red-500 bg-red-50'
                                            : 'hover:border-primary'
                                        }`}
                                        onClick={() => setSpotToReplace(spot)}
                                    >
                                        <CardContent className="p-3">
                                            <div className="flex items-center gap-2">
                                                <ParkingSquare className="h-5 w-5" />
                                                <div>
                                                    <div className="font-bold">Vaga {spot.number}</div>
                                                    <div className="text-sm text-muted-foreground">{spot.floor}</div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>

                        {/* PASSO 2: SELECIONAR NOVA VAGA */}
                        {spotToReplace && (
                            <div className="space-y-2">
                                <Label className="text-lg font-semibold">2. Selecione a nova vaga:</Label>
                                <ScrollArea className="h-[300px] border rounded-lg p-4">
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                        {availableSpots.map((spot: ParkingSpot) => {
                                            const badges = getSpotBadges(spot);
                                            return (
                                                <Card
                                                    key={spot.id}
                                                    className={`cursor-pointer transition-all ${newSpotForEdit?.id === spot.id
                                                        ? 'border-2 border-green-500 bg-green-50'
                                                        : 'hover:border-primary'
                                                    }`}
                                                    onClick={() => setNewSpotForEdit(spot)}
                                                >
                                                    <CardContent className="p-3">
                                                        <div className="font-bold">Vaga {spot.number}</div>
                                                        <div className="text-sm text-muted-foreground">{spot.floor}</div>
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {badges.map((badge, idx) => (
                                                                <Badge key={idx} variant={badge.variant as any} className="text-xs">
                                                                    {badge.icon} {badge.label}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}

                        {/* BOTÕES */}
                        <div className="flex gap-2 justify-end">
                            <Button
                                onClick={handleConfirmEditSpot}
                                disabled={!spotToReplace || !newSpotForEdit}
                                className="gradient-primary text-white"
                            >
                                <Check className="mr-2 h-4 w-4" />
                                Confirmar Troca
                            </Button>
                            <Button
                                onClick={() => {
                                    setEditingParticipantDialog(false);
                                    setSpotToReplace(null);
                                    setNewSpotForEdit(null);
                                }}
                                variant="outline"
                            >
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* DIALOG: SELECIONAR VAGA */}
            <Dialog open={isSelectingSpot} onOpenChange={setIsSelectingSpot}>
                <DialogContent className="max-w-5xl max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle className="text-xl">
                            Escolher Vaga - {currentParticipant?.block && `Bl. ${currentParticipant.block} - `}
                            Un. {currentParticipant?.unit}
                        </DialogTitle>
                        <DialogDescription className="text-base">
                            Selecione {spotsNeeded} vaga{spotsNeeded > 1 ? 's' : ''} disponível
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* VAGA SELECIONADA PENDENTE */}
                        {pendingSpot && (
                            <div className="p-4 border-2 border-primary rounded-lg bg-primary/5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold mb-1">Vaga selecionada:</p>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="default" className="text-lg py-1 px-3">
                                                <ParkingSquare className="h-4 w-4 mr-1" />
                                                Vaga {pendingSpot.number} - {pendingSpot.floor}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleConfirmSpot} className="gradient-primary text-white">
                                            <Check className="mr-2 h-4 w-4" />
                                            Confirmar
                                        </Button>
                                        <Button onClick={handleCancelSpotSelection} variant="outline">
                                            <X className="mr-2 h-4 w-4" />
                                            Cancelar
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Filtros */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Buscar</Label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Número ou andar..."
                                        value={searchSpot}
                                        onChange={(e) => setSearchSpot(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Filtrar por tipo</Label>
                                <select
                                    className="w-full p-2 border rounded-md"
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                >
                                    <option value="all">Todas</option>
                                    <option value="pcd">Vaga PcD</option>
                                    <option value="elderly">Vaga Idoso</option>
                                    <option value="small">Vaga Pequena</option>
                                    <option value="large">Vaga Grande</option>
                                    <option value="motorcycle">Vaga Motocicleta</option>
                                    <option value="common">Vaga Comum</option>
                                    <option value="covered">Vaga Coberta</option>
                                    <option value="uncovered">Vaga Descoberta</option>
                                    <option value="free">Vaga Livre</option>
                                    <option value="linked">Vaga Presa</option>
                                </select>
                            </div>
                        </div>

                        {/* Lista de Vagas com TODAS as prioridades */}
                        <ScrollArea className="h-[450px] border rounded-lg p-4">
                            {filteredSpots.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <ParkingSquare className="h-12 w-12 mx-auto mb-2 opacity-30" />
                                    <p>Nenhuma vaga disponível</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredSpots.map((spot: ParkingSpot) => {
                                        const badges = getSpotBadges(spot);

                                        return (
                                            <Card
                                                key={spot.id}
                                                className={`cursor-pointer transition-all ${pendingSpot?.id === spot.id
                                                    ? 'border-2 border-primary bg-primary/10'
                                                    : 'hover:border-primary hover:shadow-lg'
                                                }`}
                                                onClick={() => handleSelectSpot(spot)}
                                            >
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-2xl flex items-center gap-2">
                                                        <ParkingSquare className="h-7 w-7" />
                                                        Vaga {spot.number}
                                                    </CardTitle>
                                                    <CardDescription className="text-lg font-medium">{spot.floor}</CardDescription>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="flex flex-wrap gap-2">
                                                        {badges.map((badge, idx) => (
                                                            <Badge key={idx} variant={badge.variant as any} className="text-sm font-semibold px-3 py-1">
                                                                {badge.icon} {badge.label}
                                                            </Badge>
                                                        ))}
                                                        {badges.length === 0 && (
                                                            <Badge variant="common" className="text-sm font-semibold px-3 py-1">
                                                                🅿️ Comum
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>
                            )}
                        </ScrollArea>

                        <div className="flex justify-between items-center text-sm text-muted-foreground pt-2">
                            <span className="font-medium">{filteredSpots.length} vagas disponíveis</span>
                            <Button variant="outline" onClick={() => {
                                setIsSelectingSpot(false);
                                setPendingSpot(null);
                            }}>
                                Fechar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
