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
    FileText, FileSpreadsheet, Edit, Check, X, SkipForward, UserX, Dices,
    Link, Plus, Trash2, Hand, Layers
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import type { Participant, ParkingSpot, LotterySession, LotteryResult, SpotType } from '@/types/lottery';
import { savePublicResults, saveChoiceLotteryLive, clearChoiceLotteryLive } from '@/utils/publicResults';
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
export default function TripleLotterySystem(): JSX.Element {
    const { participants, parkingSpots, selectedBuilding, saveLotterySession } = useAppContext();
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
    const [filterFloor, setFilterFloor] = useState<string>('all');
    const [isSelectingSpot, setIsSelectingSpot] = useState<boolean>(false);
    const [sessionStarted, setSessionStarted] = useState<boolean>(false);

    // Estado para busca de unidade
    const [searchUnitDialog, setSearchUnitDialog] = useState<boolean>(false);
    const [searchUnit, setSearchUnit] = useState<string>('');
    const [searchResults, setSearchResults] = useState<DrawnParticipant[]>([]);
    const [highlightedParticipantId, setHighlightedParticipantId] = useState<string | null>(null);
    const [quickSearchTerm, setQuickSearchTerm] = useState<string>('');

    // Estado para vaga pendente de confirmação
    const [pendingSpot, setPendingSpot] = useState<ParkingSpot | null>(null);

    // Estado para alterar vaga já escolhida
    const [editingParticipantDialog, setEditingParticipantDialog] = useState<boolean>(false);
    const [selectedParticipantToEdit, setSelectedParticipantToEdit] = useState<DrawnParticipant | null>(null);
    const [spotToReplace, setSpotToReplace] = useState<ParkingSpot | null>(null);
    const [newSpotForEdit, setNewSpotForEdit] = useState<ParkingSpot | null>(null);

    // Estado para pré-alocações
    const [preAllocations, setPreAllocations] = useState<Map<string, string[]>>(new Map());
    const [isPreAllocationOpen, setIsPreAllocationOpen] = useState<boolean>(false);
    const [selectedPreParticipant, setSelectedPreParticipant] = useState<string>('');
    const [selectedPreSpot, setSelectedPreSpot] = useState<string>('');

    // Estado para segunda chance dos ausentes
    const [showSecondChanceDialog, setShowSecondChanceDialog] = useState<boolean>(false);
    const [showAbsentManagerDialog, setShowAbsentManagerDialog] = useState<boolean>(false);
    const [absentToGiveChance, setAbsentToGiveChance] = useState<DrawnParticipant | null>(null);

    // ============================================================================
    // 💾 PERSISTÊNCIA DO SORTEIO
    // ============================================================================
    const STORAGE_KEY = `lottery-triple-${selectedBuilding?.id}`;
    const PRE_ALLOCATION_KEY = `lottery-triple-prealloc-${selectedBuilding?.id}`;

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
                    toast({ title: "Sorteio restaurado", description: "Continuando de onde você parou." });
                }
            } catch (error) {
                console.error('Erro ao restaurar sorteio:', error);
                setIsRestored(true);
            }
        } else {
            setAvailableSpots(buildingSpots);
            setIsRestored(true);
        }
        const savedPreAlloc = localStorage.getItem(PRE_ALLOCATION_KEY);
        if (savedPreAlloc) {
            try {
                setPreAllocations(new Map(JSON.parse(savedPreAlloc)));
            } catch (error) {
                console.error('Erro ao restaurar pré-alocações:', error);
            }
        }
    }, [selectedBuilding?.id]);

    useEffect(() => {
        if (!selectedBuilding?.id || sessionStarted) return;
        localStorage.setItem(PRE_ALLOCATION_KEY, JSON.stringify(Array.from(preAllocations.entries())));
    }, [preAllocations, selectedBuilding?.id, sessionStarted]);

    useEffect(() => {
        if (!selectedBuilding?.id || !sessionStarted || !isRestored) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            drawnOrder, currentTurnIndex, availableSpots, sessionStarted, sessionFinalized
        }));
    }, [drawnOrder, currentTurnIndex, availableSpots, sessionStarted, sessionFinalized, selectedBuilding?.id, isRestored]);

    useEffect(() => {
        if (sessionStarted && !sessionFinalized && drawnOrder[currentTurnIndex]?.status === 'choosing') {
            setTimeout(() => {
                document.getElementById('choosing-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 150);
        }
    }, [currentTurnIndex, sessionStarted, sessionFinalized, drawnOrder]);

    // ============================================================================
    // 📤 SALVAR RESULTADOS PÚBLICOS
    // ============================================================================
    const saveTripleResultsToPublic = async (completedOrder: DrawnParticipant[]): Promise<void> => {
        if (!selectedBuilding?.id) return;
        try {
            const results: LotteryResult[] = [];
            completedOrder.forEach((participant) => {
                const originalParticipant = participants.find(p => p.id === participant.id);
                participant.allocatedSpots.forEach((spot) => {
                    results.push({
                        id: `triple-${participant.id}-${spot.id}`,
                        participantId: participant.id,
                        parkingSpotId: spot.id,
                        timestamp: new Date(),
                        priority: participant.hasSpecialNeeds ? 'special-needs' : participant.isElderly ? 'elderly' : 'normal',
                        participantSnapshot: {
                            name: participant.name,
                            block: participant.block,
                            unit: participant.unit,
                            numberOfSpots: originalParticipant?.numberOfSpots || 3,
                        } as any,
                        spotSnapshot: {
                            number: spot.number, floor: spot.floor, type: spot.type,
                            size: spot.size, isCovered: spot.isCovered, isUncovered: spot.isUncovered,
                        },
                    });
                });
            });

            const session: LotterySession = {
                id: `triple-session-${Date.now()}`,
                buildingId: selectedBuilding.id,
                name: `Sorteio Vaga Tripla - ${new Date().toLocaleDateString('pt-BR')}`,
                date: new Date(),
                participants: completedOrder.map(p => p.id),
                availableSpots: buildingSpots.map(s => s.id),
                results,
                status: 'completed',
                settings: { allowSharedSpots: false, prioritizeElders: true, prioritizeSpecialNeeds: true, zoneByProximity: false },
            };

            const saveResult = await savePublicResults(
                session, selectedBuilding.name || 'Condomínio', participants, parkingSpots, selectedBuilding.company
            );
            if (saveResult.success) {
                await clearChoiceLotteryLive(selectedBuilding.id);
                toast({ title: "Resultados publicados! 📱", description: "Os resultados estão disponíveis no QR Code." });
            }
        } catch (error) {
            console.error('Erro ao salvar resultados públicos:', error);
        }
    };

    // ============================================================================
    // 🎲 SORTEAR ORDEM DOS PARTICIPANTES
    // ============================================================================
    const handleDrawOrder = async (): Promise<void> => {
        if (buildingParticipants.length === 0) {
            toast({ title: "Erro", description: "Não há participantes cadastrados.", variant: "destructive" });
            return;
        }
        if (buildingSpots.length === 0) {
            toast({ title: "Erro", description: "Não há vagas disponíveis.", variant: "destructive" });
            return;
        }

        setIsDrawing(true);
        setDrawProgress(0);
        for (let i = 0; i <= 100; i += 5) {
            setDrawProgress(i);
            await new Promise(resolve => setTimeout(resolve, 30));
        }

        // Separar por prioridade: PcD > Idosos > Normais > Inadimplentes
        const pcd = buildingParticipants.filter(p => p.hasSpecialNeeds);
        const elderly = buildingParticipants.filter(p => p.isElderly && !p.hasSpecialNeeds);
        const normal = buildingParticipants.filter(p => !p.hasSpecialNeeds && !p.isElderly && p.isUpToDate !== false);
        const delinquent = buildingParticipants.filter(p => !p.hasSpecialNeeds && !p.isElderly && p.isUpToDate === false);

        const orderedParticipants = [
            ...shuffleArray(pcd), ...shuffleArray(elderly),
            ...shuffleArray(normal), ...shuffleArray(delinquent)
        ];

        const preAllocatedSpotIds = getPreAllocatedSpotIds();
        const remainingSpots = buildingSpots.filter(s => !preAllocatedSpotIds.includes(s.id));

        const drawn: DrawnParticipant[] = orderedParticipants.map((p, index) => {
            const participantPreAllocatedSpotIds = preAllocations.get(p.id) || [];
            const participantPreAllocatedSpots = buildingSpots.filter(s => participantPreAllocatedSpotIds.includes(s.id));
            const spotsNeeded = p.numberOfSpots || 3;
            const isComplete = participantPreAllocatedSpots.length >= spotsNeeded;

            return {
                ...p,
                drawOrder: index + 1,
                allocatedSpots: participantPreAllocatedSpots,
                status: isComplete ? 'completed' : (index === 0 ? 'choosing' : 'waiting'),
                isAbsent: false
            } as DrawnParticipant;
        });

        let firstChoosingIndex = drawn.findIndex(p => p.status !== 'completed');
        if (firstChoosingIndex >= 0) {
            drawn[firstChoosingIndex].status = 'choosing';
        }

        setDrawnOrder(drawn);
        setCurrentTurnIndex(firstChoosingIndex >= 0 ? firstChoosingIndex : 0);
        setAvailableSpots(remainingSpots);
        setSessionStarted(true);
        setIsDrawing(false);

        if (selectedBuilding?.id) {
            saveChoiceLotteryLive(
                selectedBuilding.id, selectedBuilding.name || 'Condomínio',
                'Sorteio Vaga Tripla', drawn, firstChoosingIndex >= 0 ? firstChoosingIndex : 0,
                'in_progress', selectedBuilding.company
            );
        }

        const preAllocatedCount = Array.from(preAllocations.values()).flat().length;
        toast({
            title: "Ordem sorteada!",
            description: `${drawn.length} participantes. ${preAllocatedCount > 0 ? `${preAllocatedCount} pré-alocação(ões).` : ''}`,
        });
    };

    // ============================================================================
    // 🏢 SUGESTÕES INTELIGENTES DE VAGAS (2 juntas + 1 separada)
    // ============================================================================
    const spotSuggestions = useMemo(() => {
        const cp = drawnOrder[currentTurnIndex];
        if (!cp || cp.status !== 'choosing') return null;

        const spotsNeeded = (cp.numberOfSpots || 3) - cp.allocatedSpots.length;
        if (spotsNeeded < 2) return null;

        // Agrupar vagas disponíveis por andar
        const spotsByFloor: Record<string, ParkingSpot[]> = {};
        availableSpots.forEach(spot => {
            if (!spotsByFloor[spot.floor]) spotsByFloor[spot.floor] = [];
            spotsByFloor[spot.floor].push(spot);
        });

        // Encontrar pares de vagas conjugadas (mesmo groupId ou vagas presas lado a lado)
        const linkedPairs: { pair: ParkingSpot[], floor: string, separate: ParkingSpot[] }[] = [];

        Object.entries(spotsByFloor).forEach(([floor, spots]) => {
            // Buscar vagas com groupId (conjugadas)
            const groupedSpots: Record<string, ParkingSpot[]> = {};
            spots.forEach(spot => {
                if (spot.groupId) {
                    if (!groupedSpots[spot.groupId]) groupedSpots[spot.groupId] = [];
                    groupedSpots[spot.groupId].push(spot);
                }
            });

            // Pares por groupId
            Object.values(groupedSpots).forEach(group => {
                if (group.length >= 2) {
                    const pair = group.slice(0, 2);
                    const remaining = spots.filter(s => !pair.some(p => p.id === s.id));
                    linkedPairs.push({ pair, floor, separate: remaining });
                }
            });

            // Pares por tipo "Vaga Presa" (lado a lado pelo número)
            const linkedSpots = spots.filter(s => {
                const types = Array.isArray(s.type) ? s.type : [s.type];
                return types.includes('Vaga Presa');
            }).sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }));

            for (let i = 0; i < linkedSpots.length - 1; i++) {
                const numA = parseInt(linkedSpots[i].number.replace(/\D/g, ''));
                const numB = parseInt(linkedSpots[i + 1].number.replace(/\D/g, ''));
                if (Math.abs(numA - numB) === 1) {
                    const pair = [linkedSpots[i], linkedSpots[i + 1]];
                    // Verificar se este par já não foi adicionado via groupId
                    const alreadyAdded = linkedPairs.some(lp =>
                        lp.pair.some(p => pair.some(pp => pp.id === p.id))
                    );
                    if (!alreadyAdded) {
                        const remaining = spots.filter(s => !pair.some(p => p.id === s.id));
                        linkedPairs.push({ pair, floor, separate: remaining });
                    }
                }
            }
        });

        return linkedPairs.slice(0, 5);
    }, [drawnOrder, currentTurnIndex, availableSpots]);

    // ============================================================================
    // ✅ SELECIONAR VAGA (PENDENTE)
    // ============================================================================
    const handleSelectSpot = (spot: ParkingSpot): void => {
        setPendingSpot(spot);
        if (selectedBuilding?.id) {
            const currentP = drawnOrder[currentTurnIndex];
            if (currentP) {
                const tempOrder = drawnOrder.map((p, idx) =>
                    idx === currentTurnIndex ? { ...p, allocatedSpots: [...p.allocatedSpots, spot] } : p
                );
                saveChoiceLotteryLive(
                    selectedBuilding.id, selectedBuilding.name || 'Condomínio',
                    'Sorteio Vaga Tripla', tempOrder, currentTurnIndex, 'in_progress', selectedBuilding.company
                );
            }
        }
    };

    // ============================================================================
    // ✅ CONFIRMAR VAGA
    // ============================================================================
    const handleConfirmSpot = (): void => {
        if (!pendingSpot) return;
        const currentP = drawnOrder[currentTurnIndex];
        if (!currentP) return;

        const updatedParticipant: DrawnParticipant = {
            ...currentP,
            allocatedSpots: [...currentP.allocatedSpots, pendingSpot]
        };
        const updatedAvailable = availableSpots.filter(s => s.id !== pendingSpot.id);
        setAvailableSpots(updatedAvailable);

        const spotsNeededTotal = currentP.numberOfSpots || 3;
        const spotsAllocatedNow = updatedParticipant.allocatedSpots.length;
        const needsMoreSpots = spotsAllocatedNow < spotsNeededTotal;

        if (needsMoreSpots && updatedAvailable.length > 0) {
            const updatedOrder = [...drawnOrder];
            updatedOrder[currentTurnIndex] = updatedParticipant;
            setDrawnOrder(updatedOrder);

            if (selectedBuilding?.id) {
                saveChoiceLotteryLive(
                    selectedBuilding.id, selectedBuilding.name || 'Condomínio',
                    'Sorteio Vaga Tripla', updatedOrder, currentTurnIndex, 'in_progress', selectedBuilding.company
                );
            }

            // Determinar tipo da próxima vaga
            const linkedCount = updatedParticipant.allocatedSpots.filter(s => {
                const types = Array.isArray(s.type) ? s.type : [s.type];
                return types.includes('Vaga Presa') || s.groupId;
            }).length;

            let nextHint = '';
            if (linkedCount < 2) {
                nextHint = `Escolha mais ${2 - linkedCount} vaga(s) conjugada(s).`;
            } else {
                nextHint = `Escolha a vaga separada (${spotsNeededTotal - spotsAllocatedNow} restante).`;
            }

            toast({
                title: `Vaga ${pendingSpot.number} alocada! (${spotsAllocatedNow}/${spotsNeededTotal})`,
                description: nextHint,
            });
            setPendingSpot(null);
        } else {
            updatedParticipant.status = 'completed';
            const updatedOrder = [...drawnOrder];
            updatedOrder[currentTurnIndex] = updatedParticipant;

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

            if (selectedBuilding?.id) {
                const allDoneCheck = updatedOrder.every(p => p.status === 'completed' || p.status === 'skipped');
                const hasAbsentWithoutSpots = updatedOrder.some(p => p.status === 'skipped' && p.allocatedSpots.length === 0);
                const newStatus = (allDoneCheck && !hasAbsentWithoutSpots) ? 'completed' : 'in_progress';
                saveChoiceLotteryLive(
                    selectedBuilding.id, selectedBuilding.name || 'Condomínio',
                    'Sorteio Vaga Tripla', updatedOrder,
                    nextIndex < updatedOrder.length ? nextIndex : currentTurnIndex,
                    newStatus as any, selectedBuilding.company
                );
            }

            const allDone = updatedOrder.every(p => p.status === 'completed' || p.status === 'skipped');
            const noSpotsLeft = updatedAvailable.length === 0;

            if (allDone || noSpotsLeft) {
                if (noSpotsLeft && !allDone) {
                    updatedOrder.forEach((p, idx) => {
                        if (p.status === 'waiting' || p.status === 'choosing') {
                            updatedOrder[idx] = { ...p, status: 'skipped' };
                        }
                    });
                    setDrawnOrder(updatedOrder);
                }
                handleFinalizeSession(updatedOrder, updatedAvailable);
            } else {
                toast({
                    title: "Participante concluído!",
                    description: `${currentP.block ? `Bloco ${currentP.block} - ` : ''}Unidade ${currentP.unit} escolheu ${spotsAllocatedNow} vaga(s).`,
                });
            }
            setPendingSpot(null);
            setIsSelectingSpot(false);
        }
    };

    // ============================================================================
    // ⏭️ PULAR PARTICIPANTE AUSENTE
    // ============================================================================
    const handleSkipParticipant = (): void => {
        const currentP = drawnOrder[currentTurnIndex];
        if (!currentP) return;

        const updatedOrder = [...drawnOrder];
        updatedOrder[currentTurnIndex] = { ...currentP, status: 'skipped', isAbsent: true };

        let nextIndex = currentTurnIndex + 1;
        while (nextIndex < updatedOrder.length &&
               (updatedOrder[nextIndex].status === 'completed' || updatedOrder[nextIndex].status === 'skipped')) {
            nextIndex++;
        }

        if (nextIndex < updatedOrder.length) {
            updatedOrder[nextIndex].status = 'choosing';
            setCurrentTurnIndex(nextIndex);
            setDrawnOrder(updatedOrder);
            if (selectedBuilding?.id) {
                saveChoiceLotteryLive(
                    selectedBuilding.id, selectedBuilding.name || 'Condomínio',
                    'Sorteio Vaga Tripla', updatedOrder, nextIndex, 'in_progress', selectedBuilding.company
                );
            }
            toast({ title: "Participante pulado", description: `${currentP.block ? `Bloco ${currentP.block} - ` : ''}Unidade ${currentP.unit} marcado como ausente.` });
        } else {
            setDrawnOrder(updatedOrder);
            handleFinalizeSession(updatedOrder, availableSpots);
        }
    };

    // ============================================================================
    // 🎲 SORTEAR VAGAS PARA AUSENTES
    // ============================================================================
    const handleRandomizeAbsent = (): void => {
        const absentParticipants = drawnOrder.filter(p => p.status === 'skipped' && p.isAbsent);
        if (absentParticipants.length === 0 || availableSpots.length === 0) return;

        let remainingSpots = [...availableSpots];
        const updatedOrder = [...drawnOrder];
        const shuffledAbsent = shuffleArray(absentParticipants);

        shuffledAbsent.forEach((participant) => {
            const idx = updatedOrder.findIndex(p => p.id === participant.id);
            if (idx === -1) return;
            const spotsNeeded = (participant.numberOfSpots || 3) - participant.allocatedSpots.length;
            const spotsToAllocate = Math.min(spotsNeeded, remainingSpots.length);
            if (spotsToAllocate > 0) {
                const shuffledSpots = shuffleArray(remainingSpots);
                const allocated = shuffledSpots.slice(0, spotsToAllocate);
                updatedOrder[idx] = {
                    ...updatedOrder[idx],
                    allocatedSpots: [...updatedOrder[idx].allocatedSpots, ...allocated],
                    status: 'completed', isAbsent: true
                };
                remainingSpots = remainingSpots.filter(s => !allocated.some(a => a.id === s.id));
            }
        });

        setDrawnOrder(updatedOrder);
        setAvailableSpots(remainingSpots);

        if (selectedBuilding?.id) {
            saveChoiceLotteryLive(
                selectedBuilding.id, selectedBuilding.name || 'Condomínio',
                'Sorteio Vaga Tripla', updatedOrder, currentTurnIndex, 'completed', selectedBuilding.company
            );
        }

        const allDone = updatedOrder.every(p => p.status === 'completed' || (p.status === 'skipped' && p.allocatedSpots.length > 0));
        if (allDone) {
            setSessionFinalized(true);
            const withSpots = updatedOrder.filter(p => p.allocatedSpots.length > 0);
            saveTripleSessionToHistory(withSpots);
            saveTripleResultsToPublic(withSpots);
            toast({ title: "Sorteio Finalizado! 🎉", description: "Todos os participantes foram processados." });
        } else {
            toast({ title: "Ausentes sorteados! 🎲", description: "Vagas alocadas aleatoriamente para ausentes." });
        }
    };

    // ============================================================================
    // 🏁 FINALIZAR SESSÃO
    // ============================================================================
    const handleFinalizeSession = (finalOrder: DrawnParticipant[], remainingSpots: ParkingSpot[]): void => {
        const absentWithoutSpots = finalOrder.filter(p => p.status === 'skipped' && p.allocatedSpots.length === 0);
        if (absentWithoutSpots.length > 0 && remainingSpots.length > 0) {
            if (selectedBuilding?.id) {
                saveChoiceLotteryLive(
                    selectedBuilding.id, selectedBuilding.name || 'Condomínio',
                    'Sorteio Vaga Tripla', finalOrder, currentTurnIndex, 'in_progress', selectedBuilding.company
                );
            }
            setShowSecondChanceDialog(true);
            return;
        }
        setSessionFinalized(true);
        saveTripleSessionToHistory(finalOrder.filter(p => p.allocatedSpots.length > 0));
        saveTripleResultsToPublic(finalOrder.filter(p => p.allocatedSpots.length > 0));
        toast({ title: "Sorteio Finalizado! 🎉", description: "Todos os participantes foram processados." });
    };

    // ============================================================================
    // 💾 SALVAR SESSÃO NO HISTÓRICO
    // ============================================================================
    const saveTripleSessionToHistory = (completedOrder: DrawnParticipant[]): void => {
        if (!selectedBuilding?.id) return;
        const results: LotteryResult[] = [];
        completedOrder.forEach((participant) => {
            const original = participants.find(p => p.id === participant.id);
            participant.allocatedSpots.forEach((spot) => {
                results.push({
                    id: `triple-${participant.id}-${spot.id}`,
                    participantId: participant.id, parkingSpotId: spot.id,
                    timestamp: new Date(),
                    priority: participant.hasSpecialNeeds ? 'special-needs' : participant.isElderly ? 'elderly' : 'normal',
                    participantSnapshot: {
                        name: participant.name, block: participant.block, unit: participant.unit,
                        numberOfSpots: original?.numberOfSpots || 3,
                    } as any,
                    spotSnapshot: {
                        number: spot.number, floor: spot.floor, type: spot.type,
                        size: spot.size, isCovered: spot.isCovered, isUncovered: spot.isUncovered,
                    },
                });
            });
        });

        const session: LotterySession = {
            id: `triple-session-${Date.now()}`,
            buildingId: selectedBuilding.id,
            name: `SORTEIO VAGA TRIPLA ${new Date().toLocaleDateString('pt-BR')}`,
            date: new Date(), participants: completedOrder.map(p => p.id),
            availableSpots: buildingSpots.map(s => s.id), results, status: 'completed',
            settings: { allowSharedSpots: false, prioritizeElders: true, prioritizeSpecialNeeds: true, zoneByProximity: false },
        };
        saveLotterySession(session);
    };

    // ============================================================================
    // 🔒 PRÉ-ALOCAÇÃO
    // ============================================================================
    const handleAddPreAllocation = (): void => {
        if (!selectedPreParticipant || !selectedPreSpot) {
            toast({ title: "Erro", description: "Selecione um participante e uma vaga.", variant: "destructive" });
            return;
        }
        const newMap = new Map(preAllocations);
        const current = newMap.get(selectedPreParticipant) || [];
        if (current.includes(selectedPreSpot)) {
            toast({ title: "Erro", description: "Vaga já pré-alocada.", variant: "destructive" });
            return;
        }
        newMap.set(selectedPreParticipant, [...current, selectedPreSpot]);
        setPreAllocations(newMap);
        setSelectedPreSpot('');
        toast({ title: "Pré-alocação adicionada!", description: "A vaga foi reservada." });
    };

    const handleRemovePreAllocation = (participantId: string, spotId: string): void => {
        const newMap = new Map(preAllocations);
        const current = newMap.get(participantId) || [];
        const updated = current.filter(s => s !== spotId);
        if (updated.length === 0) newMap.delete(participantId);
        else newMap.set(participantId, updated);
        setPreAllocations(newMap);
        toast({ title: "Pré-alocação removida" });
    };

    const getPreAllocatedSpotIds = (): string[] => {
        const ids: string[] = [];
        preAllocations.forEach((spots) => ids.push(...spots));
        return ids;
    };

    // ============================================================================
    // 🤚 SEGUNDA CHANCE
    // ============================================================================
    const handleGiveSecondChance = (participant: DrawnParticipant): void => {
        const idx = drawnOrder.findIndex(p => p.id === participant.id);
        if (idx === -1) return;
        const updatedOrder = [...drawnOrder];
        updatedOrder[idx] = { ...updatedOrder[idx], status: 'choosing', isAbsent: false };
        setDrawnOrder(updatedOrder);
        setCurrentTurnIndex(idx);
        setShowAbsentManagerDialog(false);
        setShowSecondChanceDialog(false);
        toast({ title: "Vez concedida! 🎉", description: `${participant.block ? `Bloco ${participant.block} - ` : ''}Unidade ${participant.unit} pode escolher.` });
    };

    const handleFinalizeWithoutAbsent = (): void => {
        setShowSecondChanceDialog(false);
        setSessionFinalized(true);
        const withSpots = drawnOrder.filter(p => p.allocatedSpots.length > 0);
        saveTripleSessionToHistory(withSpots);
        saveTripleResultsToPublic(withSpots);
        if (selectedBuilding?.id) clearChoiceLotteryLive(selectedBuilding.id);
        toast({ title: "Sorteio Finalizado! 🎉", description: "Participantes ausentes não receberam vagas." });
    };

    // ============================================================================
    // ❌ CANCELAR SELEÇÃO
    // ============================================================================
    const handleCancelSpotSelection = (): void => {
        setPendingSpot(null);
        if (selectedBuilding?.id) {
            saveChoiceLotteryLive(
                selectedBuilding.id, selectedBuilding.name || 'Condomínio',
                'Sorteio Vaga Tripla', drawnOrder, currentTurnIndex, 'in_progress', selectedBuilding.company
            );
        }
    };

    // ============================================================================
    // 🔄 DESFAZER ÚLTIMA ESCOLHA
    // ============================================================================
    const handleUndoLastChoice = (): void => {
        const currentP = drawnOrder[currentTurnIndex];
        if (!currentP || currentP.allocatedSpots.length === 0) return;

        const lastSpot = currentP.allocatedSpots[currentP.allocatedSpots.length - 1];
        const updatedOrder = [...drawnOrder];
        updatedOrder[currentTurnIndex] = {
            ...currentP,
            allocatedSpots: currentP.allocatedSpots.slice(0, -1)
        };
        setDrawnOrder(updatedOrder);
        setAvailableSpots([...availableSpots, lastSpot]);
        toast({ title: "Escolha desfeita", description: `Vaga ${lastSpot.number} devolvida.` });
    };

    // ============================================================================
    // 🔄 REINICIAR
    // ============================================================================
    const handleReset = async (): Promise<void> => {
        if (selectedBuilding?.id) {
            localStorage.removeItem(STORAGE_KEY);
            await clearChoiceLotteryLive(selectedBuilding.id);
        }
        setDrawnOrder([]);
        setCurrentTurnIndex(0);
        setAvailableSpots(buildingSpots);
        setSessionStarted(false);
        setSearchSpot('');
        setFilterType('all');
        setFilterFloor('all');
        setPendingSpot(null);
        setSessionFinalized(false);
        setPreAllocations(new Map());
        toast({ title: "Sorteio reiniciado" });
    };

    // ============================================================================
    // ✏️ ALTERAR VAGA
    // ============================================================================
    const handleOpenEditDialog = (participant: DrawnParticipant): void => {
        setSelectedParticipantToEdit(participant);
        setSpotToReplace(null);
        setNewSpotForEdit(null);
        setEditingParticipantDialog(true);
    };

    const handleConfirmEditSpot = (): void => {
        if (!selectedParticipantToEdit || !spotToReplace || !newSpotForEdit) return;

        const idx = drawnOrder.findIndex(p => p.id === selectedParticipantToEdit.id);
        if (idx === -1) return;

        const updatedAllocated = selectedParticipantToEdit.allocatedSpots.filter(s => s.id !== spotToReplace.id);
        updatedAllocated.push(newSpotForEdit);

        const updatedAvailable = availableSpots.filter(s => s.id !== newSpotForEdit.id);
        updatedAvailable.push(spotToReplace);

        const updatedOrder = [...drawnOrder];
        updatedOrder[idx] = { ...selectedParticipantToEdit, allocatedSpots: updatedAllocated };

        setDrawnOrder(updatedOrder);
        setAvailableSpots(updatedAvailable);
        setEditingParticipantDialog(false);

        if (selectedBuilding?.id) {
            saveChoiceLotteryLive(
                selectedBuilding.id, selectedBuilding.name || 'Condomínio',
                'Sorteio Vaga Tripla', updatedOrder, currentTurnIndex, 'in_progress', selectedBuilding.company
            );
        }

        toast({ title: "Vaga alterada!", description: `Vaga ${spotToReplace.number} trocada por ${newSpotForEdit.number}` });
        setSelectedParticipantToEdit(null);
        setSpotToReplace(null);
        setNewSpotForEdit(null);
    };

    // ============================================================================
    // 📄 PDF / EXCEL
    // ============================================================================
    const handleGeneratePDFByParticipant = (): void => {
        const completed = drawnOrder.filter(p => p.allocatedSpots.length > 0);
        if (completed.length === 0) return;
        const results: LotteryResult[] = [];
        completed.forEach((p) => {
            p.allocatedSpots.forEach((spot) => {
                results.push({
                    id: `triple-${p.id}-${spot.id}`, participantId: p.id, parkingSpotId: spot.id,
                    timestamp: new Date(),
                    priority: p.hasSpecialNeeds ? 'special-needs' : p.isElderly ? 'elderly' : 'normal',
                    participantSnapshot: { name: p.name, block: p.block, unit: p.unit },
                    spotSnapshot: { number: spot.number, floor: spot.floor, type: spot.type, size: spot.size, isCovered: spot.isCovered, isUncovered: spot.isUncovered },
                });
            });
        });
        generateLotteryPDF(`Sorteio Vaga Tripla - ${new Date().toLocaleDateString('pt-BR')}`, results, participants, parkingSpots, selectedBuilding?.company || 'exvagas', selectedBuilding?.name, 'participant');
        toast({ title: "PDF gerado!" });
    };

    const handleGeneratePDFBySpot = (): void => {
        const completed = drawnOrder.filter(p => p.allocatedSpots.length > 0);
        if (completed.length === 0) return;
        const results: LotteryResult[] = [];
        completed.forEach((p) => {
            p.allocatedSpots.forEach((spot) => {
                results.push({
                    id: `triple-${p.id}-${spot.id}`, participantId: p.id, parkingSpotId: spot.id,
                    timestamp: new Date(),
                    priority: p.hasSpecialNeeds ? 'special-needs' : p.isElderly ? 'elderly' : 'normal',
                    participantSnapshot: { name: p.name, block: p.block, unit: p.unit },
                    spotSnapshot: { number: spot.number, floor: spot.floor, type: spot.type, size: spot.size, isCovered: spot.isCovered, isUncovered: spot.isUncovered },
                });
            });
        });
        generateLotteryPDF(`Sorteio Vaga Tripla - ${new Date().toLocaleDateString('pt-BR')}`, results, participants, parkingSpots, selectedBuilding?.company || 'exvagas', selectedBuilding?.name, 'spot');
        toast({ title: "PDF gerado!" });
    };

    const handleGenerateExcel = (): void => {
        const completed = drawnOrder.filter(p => p.allocatedSpots.length > 0);
        if (completed.length === 0) return;

        const excelData: any[] = [];
        completed.sort((a, b) => {
            const blockCmp = (a.block || '').localeCompare(b.block || '', 'pt-BR', { numeric: true });
            if (blockCmp !== 0) return blockCmp;
            return (a.unit || '').localeCompare(b.unit || '', 'pt-BR', { numeric: true });
        }).forEach((p) => {
            p.allocatedSpots.forEach((spot, index) => {
                excelData.push({
                    'Ordem': p.drawOrder, 'Bloco': p.block || '', 'Unidade': p.unit,
                    'Nome': p.name || '',
                    'Prioridade': p.hasSpecialNeeds ? 'PcD' : p.isElderly ? 'Idoso' : 'Normal',
                    'Ausente': p.isAbsent ? 'Sim' : 'Não',
                    'Vaga Nº': index + 1,
                    'Número da Vaga': spot.number, 'Andar': spot.floor,
                    'Tipo': Array.isArray(spot.type) ? spot.type.join(', ') : spot.type,
                    'Tamanho': spot.size,
                    'Coberta': spot.isCovered ? 'Sim' : spot.isUncovered ? 'Não' : '-',
                    'Tipo Alocação': index < 2 ? 'Dupla/Conjugada' : 'Separada',
                });
            });
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);
        ws['!cols'] = [
            { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 15 },
            { wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 20 }, { wch: 30 },
            { wch: 10 }, { wch: 10 }, { wch: 18 },
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Resultado Sorteio');
        XLSX.writeFile(wb, `sorteio-vaga-tripla-${selectedBuilding?.name || 'resultado'}-${new Date().toISOString().split('T')[0]}.xlsx`);
        toast({ title: "Excel gerado!" });
    };

    // ============================================================================
    // 🔍 FILTRAR VAGAS
    // ============================================================================
    const availableFloors = useMemo(() => {
        const floors = new Set(availableSpots.map(s => s.floor));
        return Array.from(floors).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    }, [availableSpots]);

    const filteredSpots = useMemo(() => {
        let filtered = availableSpots;

        if (searchSpot) {
            const search = searchSpot.toLowerCase();
            filtered = filtered.filter(s => s.number.toLowerCase().includes(search) || s.floor.toLowerCase().includes(search));
        }

        if (filterFloor !== 'all') {
            filtered = filtered.filter(s => s.floor === filterFloor);
        }

        if (filterType !== 'all') {
            filtered = filtered.filter((spot) => {
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

        return filtered.sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }));
    }, [availableSpots, searchSpot, filterType, filterFloor]);

    // ============================================================================
    // 🏷️ BADGES DE TIPO DA VAGA
    // ============================================================================
    const getSpotBadges = (spot: ParkingSpot) => {
        const types = Array.isArray(spot.type) ? spot.type : [spot.type];
        const badges: { label: string; variant: string; icon: string }[] = [];

        if (types.includes('Vaga PcD')) badges.push({ label: 'Vaga PcD', variant: 'pcd', icon: '♿' });
        if (types.includes('Vaga Idoso')) badges.push({ label: 'Vaga Idoso', variant: 'elderly', icon: '👴' });
        if (types.includes('Vaga Grande')) badges.push({ label: 'Vaga Grande', variant: 'large', icon: '🚙' });
        if (types.includes('Vaga Pequena')) badges.push({ label: 'Vaga Pequena', variant: 'small', icon: '🚗' });
        if (types.includes('Vaga Motocicleta')) badges.push({ label: 'Vaga Motocicleta', variant: 'motorcycle', icon: '🏍️' });
        if (types.includes('Vaga Presa')) badges.push({ label: 'Vaga Presa', variant: 'linked', icon: '🔗' });
        if (types.includes('Vaga Livre')) badges.push({ label: 'Vaga Livre', variant: 'unlinked', icon: '🔓' });

        if (spot.isCovered || types.includes('Vaga Coberta')) badges.push({ label: 'Vaga Coberta', variant: 'covered', icon: '🏠' });
        if (spot.isUncovered || types.includes('Vaga Descoberta')) badges.push({ label: 'Vaga Descoberta', variant: 'uncovered', icon: '☀️' });

        const hasSpecific = types.some(t => t !== 'Vaga Comum' && t !== 'Vaga Coberta' && t !== 'Vaga Descoberta');
        const hasCoverage = spot.isCovered || types.includes('Vaga Coberta') || spot.isUncovered || types.includes('Vaga Descoberta');
        if (types.includes('Vaga Comum') && !hasSpecific && !hasCoverage) {
            badges.push({ label: 'Vaga Comum', variant: 'common', icon: '🅿️' });
        }

        return badges;
    };

    // ============================================================================
    // 🎨 PARTICIPANTE ATUAL
    // ============================================================================
    const currentParticipant = drawnOrder[currentTurnIndex];
    const spotsNeeded = currentParticipant
        ? (currentParticipant.numberOfSpots || 3) - currentParticipant.allocatedSpots.length
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
        completed: drawnOrder.filter(p => p.status === 'completed').length,
        skipped: drawnOrder.filter(p => p.status === 'skipped').length,
        progress: drawnOrder.length > 0
            ? (drawnOrder.filter(p => p.status === 'completed' || p.status === 'skipped').length / drawnOrder.length) * 100
            : 0,
        linkedPairsAvailable: availableSpots.filter(s => {
            const types = Array.isArray(s.type) ? s.type : [s.type];
            return types.includes('Vaga Presa') || s.groupId;
        }).length,
    };

    // ============================================================================
    // 🎨 RENDER
    // ============================================================================
    return (
        <div className="p-4 lg:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-violet-500 to-purple-700 rounded-lg flex items-center justify-center">
                        <Layers className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Sorteio Vaga Tripla</h1>
                        <p className="text-sm text-muted-foreground">
                            Cada participante escolhe {currentParticipant?.numberOfSpots || 3} vagas: 2 conjugadas + 1 separada
                        </p>
                    </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                    {sessionStarted && (
                        <>
                            <Button onClick={() => { setSearchUnitDialog(true); setSearchResults([]); setSearchUnit(''); }} variant="outline">
                                <Search className="mr-2 h-4 w-4" /> Buscar Unidade
                            </Button>
                            {drawnOrder.some(p => p.allocatedSpots.length > 0) && (
                                <>
                                    <Button onClick={handleGeneratePDFByParticipant} variant="outline">
                                        <FileText className="mr-2 h-4 w-4" /> PDF Participante
                                    </Button>
                                    <Button onClick={handleGeneratePDFBySpot} variant="outline">
                                        <FileText className="mr-2 h-4 w-4" /> PDF Vaga
                                    </Button>
                                    <Button onClick={handleGenerateExcel} variant="outline">
                                        <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
                                    </Button>
                                </>
                            )}
                            {hasAbsentParticipants && hasAvailableSpots && (
                                <Button onClick={handleRandomizeAbsent} variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50">
                                    <Dices className="mr-2 h-4 w-4" /> Sortear Ausentes
                                </Button>
                            )}
                        </>
                    )}

                    {!sessionStarted && (
                        <Button onClick={() => setIsPreAllocationOpen(true)} variant="outline">
                            <Link className="mr-2 h-4 w-4" />
                            Pré-Alocação {preAllocations.size > 0 && `(${Array.from(preAllocations.values()).flat().length})`}
                        </Button>
                    )}

                    {!sessionStarted ? (
                        <Button
                            onClick={handleDrawOrder}
                            disabled={isDrawing || buildingParticipants.length === 0 || buildingSpots.length === 0}
                            className="bg-gradient-to-r from-violet-500 to-purple-700 text-white shadow-md"
                        >
                            {isDrawing ? (
                                <><Clock className="mr-2 h-4 w-4 animate-spin" /> Sorteando...</>
                            ) : (
                                <><Shuffle className="mr-2 h-4 w-4" /> Sortear Ordem</>
                            )}
                        </Button>
                    ) : (
                        <Button onClick={handleReset} variant="outline">
                            <RotateCcw className="mr-2 h-4 w-4" /> Novo Sorteio
                        </Button>
                    )}
                </div>
            </div>

            {/* Progresso do sorteio */}
            {isDrawing && (
                <Card>
                    <CardContent className="pt-6">
                        <Progress value={drawProgress} className="h-3" />
                        <p className="text-center text-sm text-muted-foreground mt-2">Sorteando ordem...</p>
                    </CardContent>
                </Card>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Users className="h-4 w-4" /> Participantes
                        </CardTitle>
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.totalParticipants}</div></CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Car className="h-4 w-4" /> Vagas Totais
                        </CardTitle>
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.totalSpots}</div></CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <ParkingSquare className="h-4 w-4" /> Disponíveis
                        </CardTitle>
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold text-primary">{stats.availableSpots}</div></CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" /> Concluídos
                        </CardTitle>
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold text-success">{stats.completed}</div></CardContent>
                </Card>

                <Card className={stats.skipped > 0 ? 'border-orange-300' : ''}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <UserX className="h-4 w-4 text-orange-500" /> Ausentes
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="text-2xl font-bold text-orange-500">{stats.skipped}</div>
                        {sessionStarted && stats.skipped > 0 && !sessionFinalized && (
                            <Button onClick={() => setShowAbsentManagerDialog(true)} size="sm" className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                                <Hand className="mr-2 h-4 w-4" /> Gerenciar
                            </Button>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Progresso</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Progress value={stats.progress} className="h-2" />
                        <p className="text-sm text-muted-foreground mt-1">{Math.round(stats.progress)}%</p>
                    </CardContent>
                </Card>
            </div>

            {/* Busca Rápida */}
            {sessionStarted && !sessionFinalized && (
                <Card className="border-2 border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-purple-500/10">
                    <CardContent className="py-4">
                        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                            <div className="flex items-center gap-2 text-violet-600">
                                <Search className="h-5 w-5" />
                                <span className="font-semibold">Busca Rápida</span>
                            </div>
                            <div className="flex-1 relative">
                                <Input
                                    placeholder="Digite unidade, bloco ou nome..."
                                    value={quickSearchTerm}
                                    onChange={(e) => {
                                        setQuickSearchTerm(e.target.value);
                                        if (e.target.value.length >= 1) {
                                            const term = e.target.value.toLowerCase().trim();
                                            const found = drawnOrder.filter(p =>
                                                p.unit.toLowerCase().includes(term) ||
                                                (p.block && p.block.toLowerCase().includes(term)) ||
                                                (p.name && p.name.toLowerCase().includes(term))
                                            );
                                            setSearchResults(found);
                                            setHighlightedParticipantId(found.length === 1 ? found[0].id : null);
                                        } else {
                                            setSearchResults([]);
                                            setHighlightedParticipantId(null);
                                        }
                                    }}
                                    className="pr-10"
                                />
                                {quickSearchTerm && (
                                    <button
                                        onClick={() => { setQuickSearchTerm(''); setSearchResults([]); setHighlightedParticipantId(null); }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            {searchResults.length > 0 && quickSearchTerm && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm text-muted-foreground">{searchResults.length} encontrado(s):</span>
                                    {searchResults.slice(0, 5).map((p) => (
                                        <Badge
                                            key={p.id}
                                            variant={p.status === 'completed' ? 'secondary' : p.status === 'choosing' ? 'default' : 'outline'}
                                            className="cursor-pointer"
                                            onClick={() => {
                                                setHighlightedParticipantId(p.id);
                                                document.getElementById(`participant-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            }}
                                        >
                                            {p.drawOrder}º - {p.block ? `${p.block}/` : ''}Un. {p.unit}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* CARD DO PARTICIPANTE ATUAL - ESCOLHENDO */}
            {sessionStarted && currentParticipant && currentParticipant.status === 'choosing' && !sessionFinalized && (
                <Card id="choosing-card" className="border-2 border-violet-500 shadow-lg bg-gradient-to-r from-violet-500/5 to-purple-500/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-violet-700">
                            <Trophy className="h-5 w-5" />
                            {currentParticipant.drawOrder}º - {currentParticipant.block ? `Bloco ${currentParticipant.block} - ` : ''}Unidade {currentParticipant.unit}
                        </CardTitle>
                        <CardDescription>
                            {currentParticipant.name || 'Participante'} — Precisa de {spotsNeeded} vaga(s)
                            {' '}({currentParticipant.allocatedSpots.length}/{currentParticipant.numberOfSpots || 3} escolhidas)
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Badges de prioridade */}
                        <div className="flex flex-wrap gap-2">
                            {currentParticipant.hasSpecialNeeds && <Badge variant="pcd">PcD</Badge>}
                            {currentParticipant.isElderly && <Badge variant="elderly">Idoso</Badge>}
                            {currentParticipant.hasLargeCar && <Badge variant="large">Veículo Grande</Badge>}
                            {currentParticipant.hasSmallCar && <Badge variant="small">Veículo Pequeno</Badge>}
                            {currentParticipant.hasMotorcycle && <Badge variant="motorcycle">Motocicleta</Badge>}
                        </div>

                        {/* Vagas já alocadas */}
                        {currentParticipant.allocatedSpots.length > 0 && (
                            <div className="p-3 bg-success/10 border border-success/30 rounded-lg">
                                <p className="text-sm font-medium text-success mb-2">Vagas já escolhidas:</p>
                                <div className="flex flex-wrap gap-2">
                                    {currentParticipant.allocatedSpots.map((spot, i) => (
                                        <Badge key={spot.id} variant="secondary" className="bg-success/20 text-success">
                                            {i < 2 ? '🔗' : '🔓'} Vaga {spot.number} - {spot.floor}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Guia de escolha */}
                        <div className="p-3 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-lg">
                            <p className="text-sm font-medium text-violet-700 dark:text-violet-300 mb-1">
                                💡 Guia de escolha:
                            </p>
                            <p className="text-xs text-violet-600 dark:text-violet-400">
                                {currentParticipant.allocatedSpots.length === 0
                                    ? 'Primeiro, escolha 2 vagas conjugadas (juntas) no mesmo andar.'
                                    : currentParticipant.allocatedSpots.length === 1
                                        ? 'Agora, escolha a segunda vaga conjugada (ao lado da primeira).'
                                        : currentParticipant.allocatedSpots.length === 2
                                            ? 'Por fim, escolha a vaga separada — de preferência no mesmo andar.'
                                            : `Escolha mais ${spotsNeeded} vaga(s).`
                                }
                            </p>
                        </div>

                        {/* Sugestões inteligentes */}
                        {spotSuggestions && spotSuggestions.length > 0 && currentParticipant.allocatedSpots.length === 0 && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                                <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">
                                    ✨ Sugestões de duplas disponíveis:
                                </p>
                                <div className="space-y-2">
                                    {spotSuggestions.slice(0, 3).map((suggestion, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                                            <Badge variant="outline" className="border-amber-400">
                                                {suggestion.floor}
                                            </Badge>
                                            <span>
                                                Dupla: Vagas {suggestion.pair.map(p => p.number).join(' + ')}
                                                {suggestion.separate.length > 0 && ` | +${suggestion.separate.length} avulsa(s) no andar`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 flex-wrap">
                            <Button
                                onClick={() => setIsSelectingSpot(true)}
                                className="flex-1 bg-gradient-to-r from-violet-500 to-purple-700 text-white"
                                disabled={spotsNeeded === 0 || !hasAvailableSpots}
                            >
                                <ParkingSquare className="mr-2 h-4 w-4" />
                                {!hasAvailableSpots
                                    ? 'Sem vagas disponíveis'
                                    : `Escolher Vaga ${spotsNeeded > 1 ? `(${spotsNeeded} restantes)` : ''}`
                                }
                            </Button>

                            <Button onClick={handleSkipParticipant} variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50">
                                <SkipForward className="mr-2 h-4 w-4" /> Pular (Ausente)
                            </Button>

                            {currentParticipant.allocatedSpots.length > 0 && (
                                <Button onClick={handleUndoLastChoice} variant="outline" className="border-yellow-500 text-yellow-600 hover:bg-yellow-50">
                                    <Undo2 className="mr-2 h-4 w-4" /> Desfazer
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ORDEM SORTEADA */}
            {sessionStarted && drawnOrder.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ListOrdered className="h-5 w-5" /> Ordem do Sorteio
                        </CardTitle>
                        <CardDescription>
                            Prioridade: PcD → Idosos → Normais | Cada participante escolhe {drawnOrder[0]?.numberOfSpots || 3} vagas
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className={sessionFinalized ? "h-[calc(100vh-200px)]" : "h-[600px]"}>
                            <div className="space-y-2">
                                {drawnOrder.map((participant, index) => (
                                    <div
                                        key={participant.id}
                                        id={`participant-${participant.id}`}
                                        className={`p-4 rounded-lg border-2 transition-all ${
                                            highlightedParticipantId === participant.id
                                                ? 'border-yellow-400 bg-yellow-50 ring-4 ring-yellow-300 shadow-lg animate-pulse'
                                                : participant.status === 'choosing'
                                                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/20 shadow-md'
                                                    : participant.status === 'completed'
                                                        ? 'border-success bg-success/5'
                                                        : participant.status === 'skipped'
                                                            ? 'border-orange-400 bg-orange-50'
                                                            : 'border-muted bg-muted/30'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                                    participant.status === 'choosing'
                                                        ? 'bg-violet-500 text-white'
                                                        : participant.status === 'completed'
                                                            ? 'bg-success text-success-foreground'
                                                            : participant.status === 'skipped'
                                                                ? 'bg-orange-400 text-white'
                                                                : 'bg-muted text-muted-foreground'
                                                }`}>
                                                    {index + 1}°
                                                </div>
                                                <div>
                                                    <div className="font-medium flex items-center gap-2 flex-wrap">
                                                        {participant.block && `Bloco ${participant.block} - `}
                                                        Unidade {participant.unit}
                                                        {participant.hasSpecialNeeds && <Badge variant="pcd" className="text-xs">PcD</Badge>}
                                                        {participant.isElderly && <Badge variant="elderly" className="text-xs">Idoso</Badge>}
                                                    </div>
                                                    {participant.name && (
                                                        <p className="text-xs text-muted-foreground">{participant.name}</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {participant.status === 'choosing' && (
                                                    <Badge className="bg-violet-500">
                                                        <ArrowRight className="h-3 w-3 mr-1" /> Escolhendo
                                                    </Badge>
                                                )}
                                                {participant.status === 'completed' && (
                                                    <>
                                                        <Badge variant="secondary" className="bg-success text-success-foreground">
                                                            <CheckCircle className="h-3 w-3 mr-1" />
                                                            {participant.isAbsent ? 'Sorteado' : 'Completo'}
                                                        </Badge>
                                                        {!sessionFinalized && (
                                                            <Button onClick={() => handleOpenEditDialog(participant)} variant="outline" size="sm">
                                                                <Edit className="h-3 w-3 mr-1" /> Alterar
                                                            </Button>
                                                        )}
                                                    </>
                                                )}
                                                {participant.status === 'skipped' && participant.allocatedSpots.length === 0 && (
                                                    <Badge variant="outline" className="border-orange-400 text-orange-600">
                                                        <UserX className="h-3 w-3 mr-1" /> Ausente
                                                    </Badge>
                                                )}
                                                {participant.allocatedSpots.length > 0 && (
                                                    <Badge variant="outline">
                                                        {participant.allocatedSpots.length}/{participant.numberOfSpots || 3} vagas
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        {participant.allocatedSpots.length > 0 && (
                                            <div className="mt-3 pl-11 space-y-1">
                                                {participant.allocatedSpots.map((spot, i) => (
                                                    <div key={spot.id}>
                                                        <div className="text-sm font-medium text-success flex items-center gap-1">
                                                            <span>{i < 2 ? '🔗' : '🔓'}</span>
                                                            Vaga {spot.number} - {spot.floor}
                                                            <span className="text-xs text-muted-foreground">
                                                                ({i < 2 ? 'Conjugada' : 'Separada'})
                                                            </span>
                                                        </div>
                                                        <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                                                            {getSpotBadges(spot).map((badge, idx) => (
                                                                <Badge key={idx} variant={badge.variant as any} className="text-[10px] px-1.5 py-0">
                                                                    {badge.label}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </div>
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

            {/* DIALOG: BUSCAR UNIDADE */}
            <Dialog open={searchUnitDialog} onOpenChange={setSearchUnitDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Buscar Ordem de Unidade</DialogTitle>
                        <DialogDescription>Busque por unidade, bloco ou nome.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <Input
                                placeholder="Digite a unidade, bloco ou nome..."
                                value={searchUnit}
                                onChange={(e) => setSearchUnit(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const term = searchUnit.toLowerCase().trim();
                                        const found = drawnOrder.filter(p =>
                                            p.unit.toLowerCase().includes(term) ||
                                            (p.block && p.block.toLowerCase().includes(term)) ||
                                            (p.name && p.name.toLowerCase().includes(term))
                                        );
                                        setSearchResults(found);
                                    }
                                }}
                            />
                            <Button onClick={() => {
                                const term = searchUnit.toLowerCase().trim();
                                const found = drawnOrder.filter(p =>
                                    p.unit.toLowerCase().includes(term) ||
                                    (p.block && p.block.toLowerCase().includes(term)) ||
                                    (p.name && p.name.toLowerCase().includes(term))
                                );
                                setSearchResults(found);
                            }}>
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                        {searchResults.length > 0 && (
                            <ScrollArea className="h-[300px]">
                                <div className="space-y-2">
                                    {searchResults.map((p) => (
                                        <div key={p.id} className="p-3 border rounded-lg">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="font-medium">
                                                        {p.drawOrder}º - {p.block ? `Bl. ${p.block} - ` : ''}Un. {p.unit}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">{p.name}</p>
                                                </div>
                                                <Badge variant={
                                                    p.status === 'completed' ? 'secondary' :
                                                    p.status === 'choosing' ? 'default' :
                                                    p.status === 'skipped' ? 'outline' : 'secondary'
                                                }>
                                                    {p.status === 'completed' ? 'Completo' :
                                                     p.status === 'choosing' ? 'Escolhendo' :
                                                     p.status === 'skipped' ? 'Ausente' : 'Aguardando'}
                                                </Badge>
                                            </div>
                                            {p.allocatedSpots.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {p.allocatedSpots.map((spot) => (
                                                        <Badge key={spot.id} variant="outline" className="text-xs">
                                                            Vaga {spot.number}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* DIALOG: SELECIONAR VAGA */}
            <Dialog open={isSelectingSpot} onOpenChange={(open) => { if (!open) { setIsSelectingSpot(false); setPendingSpot(null); } }}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ParkingSquare className="h-5 w-5" />
                            Escolher Vaga — {currentParticipant?.block ? `Bl. ${currentParticipant.block} - ` : ''}Un. {currentParticipant?.unit}
                        </DialogTitle>
                        <DialogDescription>
                            {currentParticipant && (
                                <>
                                    Vaga {(currentParticipant.allocatedSpots?.length || 0) + 1} de {currentParticipant.numberOfSpots || 3}
                                    {currentParticipant.allocatedSpots.length < 2 ? ' — Escolha uma vaga conjugada (dupla)' : ' — Escolha a vaga separada'}
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Confirmação de vaga pendente */}
                        {pendingSpot && (
                            <div className="p-4 bg-violet-50 dark:bg-violet-950/30 border-2 border-violet-500 rounded-lg">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-violet-700 dark:text-violet-300">Vaga selecionada:</span>
                                        <Badge variant="default" className="text-lg py-1 px-3 bg-violet-500">
                                            <ParkingSquare className="h-4 w-4 mr-1" /> Vaga {pendingSpot.number} - {pendingSpot.floor}
                                        </Badge>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleConfirmSpot} className="bg-gradient-to-r from-violet-500 to-purple-700 text-white">
                                            <Check className="mr-2 h-4 w-4" /> Confirmar
                                        </Button>
                                        <Button onClick={handleCancelSpotSelection} variant="outline">
                                            <X className="mr-2 h-4 w-4" /> Cancelar
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Vagas já alocadas */}
                        {currentParticipant && currentParticipant.allocatedSpots.length > 0 && (
                            <div className="p-3 bg-success/10 border border-success/30 rounded-lg">
                                <p className="text-sm font-medium text-success mb-1">Vagas já escolhidas:</p>
                                <div className="flex flex-wrap gap-2">
                                    {currentParticipant.allocatedSpots.map((spot, i) => (
                                        <Badge key={spot.id} variant="secondary" className="bg-success/20 text-success">
                                            {i < 2 ? '🔗' : '🔓'} Vaga {spot.number} - {spot.floor}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Filtros */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Buscar</Label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Número ou andar..." value={searchSpot} onChange={(e) => setSearchSpot(e.target.value)} className="pl-9" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Filtrar por andar</Label>
                                <select className="w-full p-2 border rounded-md" value={filterFloor} onChange={(e) => setFilterFloor(e.target.value)}>
                                    <option value="all">Todos os andares</option>
                                    {availableFloors.map(floor => (
                                        <option key={floor} value={floor}>{floor}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>Filtrar por tipo</Label>
                                <select className="w-full p-2 border rounded-md" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                                    <option value="all">Todas</option>
                                    <option value="linked">Vaga Presa (Conjugada)</option>
                                    <option value="free">Vaga Livre</option>
                                    <option value="pcd">Vaga PcD</option>
                                    <option value="elderly">Vaga Idoso</option>
                                    <option value="small">Vaga Pequena</option>
                                    <option value="large">Vaga Grande</option>
                                    <option value="motorcycle">Vaga Motocicleta</option>
                                    <option value="common">Vaga Comum</option>
                                    <option value="covered">Vaga Coberta</option>
                                    <option value="uncovered">Vaga Descoberta</option>
                                </select>
                            </div>
                        </div>

                        {/* Lista de Vagas */}
                        <ScrollArea className="h-[450px] border rounded-lg p-4">
                            {filteredSpots.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <ParkingSquare className="h-12 w-12 mx-auto mb-2 opacity-30" />
                                    <p>Nenhuma vaga disponível</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredSpots.map((spot) => {
                                        const badges = getSpotBadges(spot);
                                        const isLinked = Array.isArray(spot.type) ? spot.type.includes('Vaga Presa') : false;
                                        const sameFloorAsFirst = currentParticipant?.allocatedSpots[0]?.floor === spot.floor;

                                        return (
                                            <Card
                                                key={spot.id}
                                                className={`cursor-pointer transition-all ${
                                                    pendingSpot?.id === spot.id
                                                        ? 'border-2 border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                                                        : sameFloorAsFirst && currentParticipant && currentParticipant.allocatedSpots.length > 0
                                                            ? 'border-green-300 bg-green-50/50 hover:border-violet-400 hover:shadow-lg'
                                                            : 'hover:border-violet-400 hover:shadow-lg'
                                                }`}
                                                onClick={() => handleSelectSpot(spot)}
                                            >
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-2xl flex items-center gap-2">
                                                        <ParkingSquare className="h-7 w-7" />
                                                        Vaga {spot.number}
                                                    </CardTitle>
                                                    <CardDescription className="text-lg font-medium flex items-center gap-2">
                                                        {spot.floor}
                                                        {sameFloorAsFirst && currentParticipant && currentParticipant.allocatedSpots.length > 0 && (
                                                            <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                                                                Mesmo andar ✓
                                                            </Badge>
                                                        )}
                                                    </CardDescription>
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
                            <Button variant="outline" onClick={() => { setIsSelectingSpot(false); setPendingSpot(null); }}>
                                Fechar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* DIALOG: PRÉ-ALOCAÇÃO */}
            <Dialog open={isPreAllocationOpen} onOpenChange={setIsPreAllocationOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Link className="h-5 w-5" /> Pré-Alocação de Vagas
                        </DialogTitle>
                        <DialogDescription>
                            Reserve vagas específicas para participantes antes do sorteio. Ideal para PcDs com vagas designadas.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Participante</Label>
                                <select className="w-full p-2 border rounded-md" value={selectedPreParticipant} onChange={(e) => setSelectedPreParticipant(e.target.value)}>
                                    <option value="">Selecione...</option>
                                    {[...buildingParticipants]
                                        .sort((a, b) => {
                                            const bA = (a.block || '').toLowerCase();
                                            const bB = (b.block || '').toLowerCase();
                                            if (bA !== bB) return bA.localeCompare(bB, 'pt-BR', { numeric: true });
                                            return (a.unit || '').localeCompare(b.unit || '', 'pt-BR', { numeric: true });
                                        })
                                        .map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.block && `${p.block} - `}Unid. {p.unit} {p.hasSpecialNeeds ? '(PcD)' : ''}
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>Vaga</Label>
                                <select className="w-full p-2 border rounded-md" value={selectedPreSpot} onChange={(e) => setSelectedPreSpot(e.target.value)}>
                                    <option value="">Selecione...</option>
                                    {buildingSpots
                                        .filter(s => !getPreAllocatedSpotIds().includes(s.id))
                                        .sort((a, b) => {
                                            const fA = (a.floor || '').toLowerCase();
                                            const fB = (b.floor || '').toLowerCase();
                                            if (fA !== fB) return fA.localeCompare(fB, 'pt-BR', { numeric: true });
                                            return (a.number || '').localeCompare(b.number || '', 'pt-BR', { numeric: true });
                                        })
                                        .map((s) => (
                                            <option key={s.id} value={s.id}>Vaga {s.number} - {s.floor}</option>
                                        ))
                                    }
                                </select>
                            </div>
                            <div className="flex items-end">
                                <Button onClick={handleAddPreAllocation} className="w-full">
                                    <Plus className="mr-2 h-4 w-4" /> Adicionar
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 p-3 bg-muted/50 rounded-lg">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-primary">{buildingParticipants.length}</p>
                                <p className="text-xs text-muted-foreground">Participantes</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-blue-600">{buildingSpots.length}</p>
                                <p className="text-xs text-muted-foreground">Vagas Disponíveis</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-green-600">{Array.from(preAllocations.values()).flat().length}</p>
                                <p className="text-xs text-muted-foreground">Pré-alocadas</p>
                            </div>
                        </div>

                        {preAllocations.size > 0 && (
                            <div className="space-y-2">
                                <Label>Pré-alocações ({Array.from(preAllocations.values()).flat().length} vagas para {preAllocations.size} participantes)</Label>
                                <ScrollArea className="h-[200px] border rounded-lg p-3">
                                    <div className="space-y-2">
                                        {Array.from(preAllocations.entries()).map(([participantId, spotIds]) => {
                                            const participant = buildingParticipants.find(p => p.id === participantId);
                                            return spotIds.map((spotId) => {
                                                const spot = buildingSpots.find(s => s.id === spotId);
                                                return (
                                                    <div key={`${participantId}-${spotId}`} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                                                        <div className="flex items-center gap-3">
                                                            <Badge variant="secondary">
                                                                {participant?.block && `${participant.block} - `}Unid. {participant?.unit}
                                                                {participant?.hasSpecialNeeds ? ' (PcD)' : ''}
                                                            </Badge>
                                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                                            <Badge variant="outline">Vaga {spot?.number} - {spot?.floor}</Badge>
                                                        </div>
                                                        <Button variant="ghost" size="sm" onClick={() => handleRemovePreAllocation(participantId, spotId)}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                );
                                            });
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}

                        {preAllocations.size === 0 && (
                            <div className="text-center py-6 text-muted-foreground">
                                <Link className="h-12 w-12 mx-auto mb-2 opacity-30" />
                                <p>Nenhuma pré-alocação configurada</p>
                                <p className="text-xs mt-1">Reserve vagas PcD antes de iniciar o sorteio</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* DIALOG: SEGUNDA CHANCE PARA AUSENTES */}
            <Dialog open={showSecondChanceDialog} onOpenChange={setShowSecondChanceDialog}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Hand className="h-5 w-5 text-orange-500" /> Segunda Chance para Ausentes
                        </DialogTitle>
                        <DialogDescription>
                            Há {drawnOrder.filter(p => p.status === 'skipped' && p.allocatedSpots.length === 0).length} participante(s) ausente(s)
                            e {availableSpots.length} vaga(s) disponível(is).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <ScrollArea className="h-[200px] border rounded-lg p-3">
                            <div className="space-y-2">
                                {drawnOrder.filter(p => p.status === 'skipped' && p.allocatedSpots.length === 0).map((p) => (
                                    <div key={p.id} className="flex items-center justify-between p-2 bg-orange-50 rounded-lg">
                                        <span className="text-sm">
                                            {p.drawOrder}º - {p.block ? `Bl. ${p.block} - ` : ''}Un. {p.unit}
                                        </span>
                                        <Button size="sm" variant="outline" onClick={() => handleGiveSecondChance(p)}>
                                            Dar vez
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                        <div className="flex gap-2 flex-wrap">
                            <Button onClick={handleRandomizeAbsent} className="flex-1">
                                <Dices className="mr-2 h-4 w-4" /> Sortear Vagas Aleatoriamente
                            </Button>
                            <Button onClick={handleFinalizeWithoutAbsent} variant="outline" className="flex-1">
                                Finalizar sem Ausentes
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* DIALOG: GERENCIAR AUSENTES */}
            <Dialog open={showAbsentManagerDialog} onOpenChange={setShowAbsentManagerDialog}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserX className="h-5 w-5 text-orange-500" /> Gerenciar Ausentes
                        </DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                            {drawnOrder.filter(p => p.status === 'skipped' && p.isAbsent).map((p) => (
                                <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div>
                                        <p className="font-medium">
                                            {p.drawOrder}º - {p.block ? `Bl. ${p.block} - ` : ''}Un. {p.unit}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{p.name}</p>
                                    </div>
                                    <Button size="sm" onClick={() => handleGiveSecondChance(p)}>
                                        <Hand className="mr-2 h-4 w-4" /> Dar Vez
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* DIALOG: ALTERAR VAGA */}
            <Dialog open={editingParticipantDialog} onOpenChange={setEditingParticipantDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Edit className="h-5 w-5" /> Alterar Vaga
                        </DialogTitle>
                        <DialogDescription>
                            {selectedParticipantToEdit && (
                                <>Alterar vaga de {selectedParticipantToEdit.block ? `Bl. ${selectedParticipantToEdit.block} - ` : ''}Un. {selectedParticipantToEdit.unit}</>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedParticipantToEdit && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Vaga a ser trocada</Label>
                                <div className="flex flex-wrap gap-2">
                                    {selectedParticipantToEdit.allocatedSpots.map((spot) => (
                                        <Badge
                                            key={spot.id}
                                            variant={spotToReplace?.id === spot.id ? 'destructive' : 'outline'}
                                            className="cursor-pointer text-sm py-1 px-3"
                                            onClick={() => setSpotToReplace(spot)}
                                        >
                                            Vaga {spot.number} - {spot.floor}
                                        </Badge>
                                    ))}
                                </div>
                            </div>

                            {spotToReplace && (
                                <div className="space-y-2">
                                    <Label>Nova vaga</Label>
                                    <ScrollArea className="h-[300px] border rounded-lg p-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {availableSpots
                                                .sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }))
                                                .map((spot) => (
                                                    <div
                                                        key={spot.id}
                                                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                                                            newSpotForEdit?.id === spot.id ? 'border-violet-500 bg-violet-50' : 'hover:border-violet-300'
                                                        }`}
                                                        onClick={() => setNewSpotForEdit(spot)}
                                                    >
                                                        <p className="font-medium">Vaga {spot.number}</p>
                                                        <p className="text-xs text-muted-foreground">{spot.floor}</p>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    </ScrollArea>
                                </div>
                            )}

                            <div className="flex gap-2 justify-end">
                                <Button onClick={handleConfirmEditSpot} disabled={!spotToReplace || !newSpotForEdit}>
                                    <Check className="mr-2 h-4 w-4" /> Confirmar Troca
                                </Button>
                                <Button variant="outline" onClick={() => setEditingParticipantDialog(false)}>
                                    Cancelar
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
