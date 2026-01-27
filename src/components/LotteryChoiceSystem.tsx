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
    FileText, FileSpreadsheet, Edit, Check, X
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import type { Participant, ParkingSpot, LotterySession, LotteryResult } from '@/types/lottery';
import { savePublicResults } from '@/utils/publicResults';

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
    status: 'waiting' | 'choosing' | 'completed';
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

    // NOVO: Estado para finalização da sessão
    const [sessionFinalized, setSessionFinalized] = useState<boolean>(false);

    // Estados principais
    const [drawnOrder, setDrawnOrder] = useState<DrawnParticipant[]>([]);
    const [currentTurnIndex, setCurrentTurnIndex] = useState<number>(0);
    const [availableSpots, setAvailableSpots] = useState<ParkingSpot[]>([]);
    const [isRestored, setIsRestored] = useState<boolean>(false); // ✅ ADICIONAR ESTA LINHA

    // Estados de UI
    const [isDrawing, setIsDrawing] = useState<boolean>(false);
    const [drawProgress, setDrawProgress] = useState<number>(0);
    const [searchSpot, setSearchSpot] = useState<string>('');
    const [filterType, setFilterType] = useState<string>('all');
    const [isSelectingSpot, setIsSelectingSpot] = useState<boolean>(false);
    const [sessionStarted, setSessionStarted] = useState<boolean>(false);

    // NOVO: Estado para busca de unidade
    const [searchUnitDialog, setSearchUnitDialog] = useState<boolean>(false);
    const [searchUnit, setSearchUnit] = useState<string>('');

    // NOVO: Estado para vaga pendente de confirmação
    const [pendingSpot, setPendingSpot] = useState<ParkingSpot | null>(null);

    // NOVO: Estado para alterar vaga já escolhida
    const [editingParticipantDialog, setEditingParticipantDialog] = useState<boolean>(false);
    const [selectedParticipantToEdit, setSelectedParticipantToEdit] = useState<DrawnParticipant | null>(null);
    const [spotToReplace, setSpotToReplace] = useState<ParkingSpot | null>(null);
    const [newSpotForEdit, setNewSpotForEdit] = useState<ParkingSpot | null>(null);

    // ============================================================================
    // 💾 PERSISTÊNCIA DO SORTEIO
    // ============================================================================
    // ============================================================================
    // 💾 PERSISTÊNCIA DO SORTEIO
    // ============================================================================
    const STORAGE_KEY = `lottery-choice-${selectedBuilding?.id}`;

    // Carregar dados salvos ao montar o componente
    useEffect(() => {
        console.log('🔵 [LOAD] useEffect de carregamento disparado');
        console.log('🔵 [LOAD] selectedBuilding?.id:', selectedBuilding?.id);
        console.log('🔵 [LOAD] buildingSpots.length:', buildingSpots.length);

        if (!selectedBuilding?.id) {
            console.log('🔴 [LOAD] Sem prédio selecionado, abortando');
            return;
        }

        const saved = localStorage.getItem(STORAGE_KEY);
        console.log('🔵 [LOAD] Dados salvos encontrados?', saved ? 'SIM' : 'NÃO');

        if (saved) {
            try {
                const data = JSON.parse(saved);
                console.log('🔵 [LOAD] Dados parseados:', {
                    drawnOrder_length: data.drawnOrder?.length,
                    currentTurnIndex: data.currentTurnIndex,
                    availableSpots_length: data.availableSpots?.length,
                    sessionStarted: data.sessionStarted,
                    sessionFinalized: data.sessionFinalized
                });

                setDrawnOrder(data.drawnOrder || []);
                setCurrentTurnIndex(data.currentTurnIndex || 0);
                setSessionStarted(data.sessionStarted || false);
                setSessionFinalized(data.sessionFinalized || false);

                // SEMPRE priorizar os dados salvos de vagas disponíveis
                if (data.availableSpots) {
                    console.log('✅ [LOAD] Restaurando vagas salvas:', data.availableSpots.length);
                    setAvailableSpots(data.availableSpots);
                } else {
                    console.log('⚠️ [LOAD] Sem vagas salvas, usando buildingSpots:', buildingSpots.length);
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
                console.error('❌ [LOAD] Erro ao restaurar sorteio:', error);
                setIsRestored(true);
            }
        } else {
            console.log('🆕 [LOAD] Primeira vez, inicializando com buildingSpots:', buildingSpots.length);
            setAvailableSpots(buildingSpots);
            setIsRestored(true);
        }
    }, [selectedBuilding?.id]);

    // Salvar dados sempre que mudarem
    // Salvar dados sempre que mudarem
    useEffect(() => {
        console.log('💾 [SAVE] useEffect de salvamento disparado');
        console.log('💾 [SAVE] availableSpots.length:', availableSpots.length);
        console.log('💾 [SAVE] isRestored:', isRestored);

        // ⚠️ CRÍTICO: Só salvar DEPOIS de restaurar
        if (!selectedBuilding?.id || !sessionStarted || !isRestored) {
            console.log('🔴 [SAVE] Não salvando');
            return;
        }

        const dataToSave = {
            drawnOrder,
            currentTurnIndex,
            availableSpots,
            sessionStarted,
            sessionFinalized
        };

        console.log('✅ [SAVE] Salvando availableSpots.length:', availableSpots.length);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }, [drawnOrder, currentTurnIndex, availableSpots, sessionStarted, sessionFinalized, selectedBuilding?.id, isRestored]);
    //  Adicionar isRestored aqui ^^^^^^^^^^^

    // ============================================================================
    // 📤 FUNÇÃO: SALVAR RESULTADOS PÚBLICOS DO SORTEIO DE ESCOLHA
    // ============================================================================
    const saveChoiceResultsToPublic = async (completedOrder: DrawnParticipant[]): Promise<void> => {
        if (!selectedBuilding?.id) return;

        try {
            // Converter os resultados do sorteio de escolha para o formato LotteryResult
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

            // Criar sessão de sorteio
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

            // Salvar resultados públicos
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
            } else {
                console.error('Erro ao salvar resultados públicos:', saveResult.error);
            }
        } catch (error) {
            console.error('Erro ao salvar resultados públicos:', error);
        }
    };

    // ============================================================================
    // 🎲 FUNÇÃO: SORTEAR ORDEM DOS PARTICIPANTES
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

        // Embaralhar participantes
        const shuffled = shuffleArray(buildingParticipants);

        const drawn: DrawnParticipant[] = shuffled.map((p, index) => ({
            ...p,
            drawOrder: index + 1,
            allocatedSpots: [],
            status: index === 0 ? 'choosing' : 'waiting'
        }));

        setDrawnOrder(drawn);
        setCurrentTurnIndex(0);
        setAvailableSpots(buildingSpots);
        setSessionStarted(true);
        setIsDrawing(false);

        toast({
            title: "Ordem sorteada!",
            description: `${drawn.length} participantes na fila de escolha.`,
        });

        console.log('🎲 Ordem sorteada:', drawn);
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

        // Verificar se participante completou suas escolhas
        const needsMoreSpots = updatedParticipant.allocatedSpots.length < (currentParticipant.numberOfSpots || 1);

        if (needsMoreSpots) {
            // Ainda precisa escolher mais vagas
            const updatedOrder = [...drawnOrder];
            updatedOrder[currentTurnIndex] = updatedParticipant;
            setDrawnOrder(updatedOrder);
        } else {
            // Completou - marcar como completo e avançar
            updatedParticipant.status = 'completed';

            const updatedOrder = [...drawnOrder];
            updatedOrder[currentTurnIndex] = updatedParticipant;

            // Próximo participante
            if (currentTurnIndex + 1 < drawnOrder.length) {
                updatedOrder[currentTurnIndex + 1].status = 'choosing';
                setCurrentTurnIndex(currentTurnIndex + 1);
            }

            setDrawnOrder(updatedOrder);

            // Verificar se todos completaram
            const allCompleted = updatedOrder.every((p: DrawnParticipant) => p.status === 'completed');

            if (allCompleted) {
                toast({
                    title: "Sorteio Finalizado! 🎉",
                    description: "Todos os participantes escolheram suas vagas.",
                });

                // Salvar resultados públicos
                saveChoiceResultsToPublic(updatedOrder);

                // Opcional: você pode adicionar um estado de "finalizado" se quiser
                setSessionFinalized(true);
            }
        }

        toast({
            title: "Vaga alocada!",
            description: `Vaga ${pendingSpot.number} alocada para ${currentParticipant.name}`,
        });

        setPendingSpot(null);
        setIsSelectingSpot(false);
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

        // Pegar a última vaga alocada
        const lastSpot = currentParticipant.allocatedSpots[currentParticipant.allocatedSpots.length - 1];

        // Remover da lista de alocados
        const updatedAllocatedSpots = currentParticipant.allocatedSpots.slice(0, -1);

        // Devolver vaga para disponíveis
        const updatedAvailableSpots = [...availableSpots, lastSpot];

        // Atualizar participante
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
    // 🔍 BUSCAR POSIÇÃO DA UNIDADE
    // ============================================================================
    const handleSearchUnit = (): void => {
        if (!searchUnit.trim()) {
            toast({
                title: "Digite uma unidade",
                description: "Informe o número da unidade para buscar.",
                variant: "destructive",
            });
            return;
        }

        const found = drawnOrder.find((p: DrawnParticipant) =>
            p.unit.toLowerCase().includes(searchUnit.toLowerCase()) ||
            (p.block && p.block.toLowerCase().includes(searchUnit.toLowerCase()))
        );

        if (found) {
            toast({
                title: `Unidade encontrada!`,
                description: `${found.block ? `Bloco ${found.block} - ` : ''}Unidade ${found.unit} está na posição ${found.drawOrder}º`,
            });
        } else {
            toast({
                title: "Unidade não encontrada",
                description: "Esta unidade não está participando do sorteio.",
                variant: "destructive",
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

        // Encontrar índice do participante
        const participantIndex = drawnOrder.findIndex((p: DrawnParticipant) => p.id === selectedParticipantToEdit.id);
        if (participantIndex === -1) return;

        // Remover vaga antiga
        const updatedAllocatedSpots = selectedParticipantToEdit.allocatedSpots.filter(
            (s: ParkingSpot) => s.id !== spotToReplace.id
        );

        // Adicionar nova vaga
        updatedAllocatedSpots.push(newSpotForEdit);

        // Devolver vaga antiga para disponíveis e remover nova vaga
        const updatedAvailableSpots = availableSpots.filter((s: ParkingSpot) => s.id !== newSpotForEdit.id);
        updatedAvailableSpots.push(spotToReplace);

        // Atualizar participante
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
    // 📄 FUNÇÃO: GERAR PDF DA ORDEM SORTEADA (ANTES DA ESCOLHA)
    // ============================================================================
    const handleGeneratePDFOrder = (): void => {
        toast({
            title: "Gerando PDF...",
            description: "PDF da ordem do sorteio será gerado.",
        });
        // Implementar geração de PDF aqui
        console.log('📄 Gerar PDF da ordem sorteada');
    };

    // ============================================================================
    // 📄 FUNÇÃO: GERAR EXCEL DA ORDEM SORTEADA (ANTES DA ESCOLHA)
    // ============================================================================
    const handleGenerateExcelOrder = (): void => {
        toast({
            title: "Gerando Excel...",
            description: "Excel da ordem do sorteio será gerado.",
        });
        // Implementar geração de Excel aqui
        console.log('📊 Gerar Excel da ordem sorteada');
    };

    // ============================================================================
    // 📄 FUNÇÃO: GERAR PDF POR PARTICIPANTE (APÓS ESCOLHA)
    // ============================================================================
    const handleGeneratePDFByParticipant = (): void => {
        toast({
            title: "Gerando PDF...",
            description: "PDF por participante será gerado.",
        });
        // Implementar geração de PDF aqui
        console.log('📄 Gerar PDF por participante');
    };

    // ============================================================================
    // 📄 FUNÇÃO: GERAR PDF POR VAGA (APÓS ESCOLHA)
    // ============================================================================
    const handleGeneratePDFBySpot = (): void => {
        toast({
            title: "Gerando PDF...",
            description: "PDF por vaga será gerado.",
        });
        // Implementar geração de PDF aqui
        console.log('📄 Gerar PDF por vaga');
    };

    // ============================================================================
    // 📊 FUNÇÃO: GERAR EXCEL APÓS ESCOLHA
    // ============================================================================
    const handleGenerateExcelAfterChoice = (): void => {
        toast({
            title: "Gerando Excel...",
            description: "Excel com as alocações será gerado.",
        });
        // Implementar geração de Excel aqui
        console.log('📊 Gerar Excel após escolha');
    };

    // ============================================================================
    // 🔍 FILTRAR VAGAS
    // ============================================================================
    const filteredSpots = useMemo(() => {
        let filtered = availableSpots;

        // Filtro de busca
        if (searchSpot) {
            const search = searchSpot.toLowerCase();
            filtered = filtered.filter((spot: ParkingSpot) =>
                spot.number.toLowerCase().includes(search) ||
                spot.floor.toLowerCase().includes(search)
            );
        }

        // Filtro de tipo
        if (filterType !== 'all') {
            filtered = filtered.filter((spot: ParkingSpot) => {
                const types = Array.isArray(spot.type) ? spot.type : [spot.type];

                // ✅ CORRIGIDO: Verificar AMBOS (type[] e booleanos)
                if (filterType === 'covered') return types.includes('Vaga Coberta') || spot.isCovered === true;
                if (filterType === 'uncovered') return types.includes('Vaga Descoberta') || spot.isUncovered === true;
                if (filterType === 'pcd') return types.includes('Vaga PcD');
                if (filterType === 'elderly') return types.includes('Vaga Idoso');
                if (filterType === 'large') return types.includes('Vaga Grande');
                if (filterType === 'small') return types.includes('Vaga Pequena');

                return true;
            });
        }

        return filtered.sort((a: ParkingSpot, b: ParkingSpot) =>
            a.number.localeCompare(b.number, 'pt-BR', { numeric: true })
        );
    }, [availableSpots, searchSpot, filterType]);

    // ============================================================================
    // 🔍 FILTRAR VAGAS PARA EDIÇÃO (INCLUINDO AS DISPONÍVEIS)
    // ============================================================================
    const filteredSpotsForEdit = useMemo(() => {
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

                // ✅ CORRIGIDO: Verificar AMBOS (type[] e booleanos)
                if (filterType === 'covered') return types.includes('Vaga Coberta') || spot.isCovered === true;
                if (filterType === 'uncovered') return types.includes('Vaga Descoberta') || spot.isUncovered === true;
                if (filterType === 'pcd') return types.includes('Vaga PcD');
                if (filterType === 'elderly') return types.includes('Vaga Idoso');
                if (filterType === 'large') return types.includes('Vaga Grande');
                if (filterType === 'small') return types.includes('Vaga Pequena');

                return true;
            });
        }

        return filtered.sort((a: ParkingSpot, b: ParkingSpot) =>
            a.number.localeCompare(b.number, 'pt-BR', { numeric: true })
        );
    }, [availableSpots, searchSpot, filterType]);

    // ============================================================================
    // 🎨 PARTICIPANTE ATUAL
    // ============================================================================
    const currentParticipant = drawnOrder[currentTurnIndex];
    const spotsNeeded = currentParticipant
        ? (currentParticipant.numberOfSpots || 1) - currentParticipant.allocatedSpots.length
        : 0;

    // NOVO: Verificar se ainda há vagas disponíveis
    const hasAvailableSpots = availableSpots.length > 0;

    // ============================================================================
    // 📊 ESTATÍSTICAS
    // ============================================================================
    const stats = {
        totalParticipants: buildingParticipants.length,
        totalSpots: buildingSpots.length,
        availableSpots: availableSpots.length,
        completed: drawnOrder.filter((p: DrawnParticipant) => p.status === 'completed').length,
        progress: drawnOrder.length > 0
            ? (drawnOrder.filter((p: DrawnParticipant) => p.status === 'completed').length / drawnOrder.length) * 100
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
                                onClick={() => setSearchUnitDialog(true)}
                                variant="outline"
                            >
                                <Search className="mr-2 h-4 w-4" />
                                Ordem de Unidade
                            </Button>

                            {/* BOTÕES DE EXPORTAÇÃO ANTES DA ESCOLHA */}
                            {drawnOrder.length > 0 && drawnOrder.every((p: DrawnParticipant) => p.allocatedSpots.length === 0) && (
                                <>
                                    <Button
                                        onClick={handleGeneratePDFOrder}
                                        variant="outline"
                                    >
                                        <FileText className="mr-2 h-4 w-4" />
                                        PDF da Ordem
                                    </Button>
                                    <Button
                                        onClick={handleGenerateExcelOrder}
                                        variant="outline"
                                    >
                                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                                        Excel da Ordem
                                    </Button>
                                </>
                            )}

                            {/* BOTÕES DE EXPORTAÇÃO APÓS ESCOLHA */}
                            {drawnOrder.some((p: DrawnParticipant) => p.allocatedSpots.length > 0) && (
                                <>
                                    <Button
                                        onClick={handleGeneratePDFByParticipant}
                                        variant="outline"
                                    >
                                        <FileText className="mr-2 h-4 w-4" />
                                        PDF por Participante
                                    </Button>
                                    <Button
                                        onClick={handleGeneratePDFBySpot}
                                        variant="outline"
                                    >
                                        <FileText className="mr-2 h-4 w-4" />
                                        PDF por Vaga
                                    </Button>
                                    <Button
                                        onClick={handleGenerateExcelAfterChoice}
                                        variant="outline"
                                    >
                                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                                        Excel
                                    </Button>
                                </>
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
                        <Button
                            onClick={handleReset}
                            variant="outline"
                        >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Reiniciar
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                            Vagas Totais
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalSpots}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <ParkingSquare className="h-4 w-4 text-green-500" />
                            Disponíveis
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">{stats.availableSpots}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-blue-500" />
                            Concluídos
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-500">
                            {stats.completed}/{stats.totalParticipants}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Progresso do Sorteio */}
            {isDrawing && (
                <Card>
                    <CardHeader>
                        <CardTitle>Sorteando ordem...</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Progress value={drawProgress} className="w-full" />
                    </CardContent>
                </Card>
            )}

            {/* Progresso da Sessão */}
            {sessionStarted && (
                <Card>
                    <CardHeader>
                        <CardTitle>Progresso da Alocação</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Progress value={stats.progress} className="w-full" />
                        <p className="text-sm text-muted-foreground mt-2">
                            {stats.completed} de {stats.totalParticipants} participantes alocados
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* BANNER: SORTEIO FINALIZADO */}
            {sessionFinalized && (
                <Card className="border-2 border-green-500 bg-green-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-700">
                            <CheckCircle className="h-5 w-5" />
                            Sorteio Finalizado! 🎉
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-green-700">
                            Todos os participantes escolheram suas vagas. Você pode exportar os resultados usando os botões acima.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* ALERTA: VAGAS ESGOTADAS */}
            {sessionStarted && !hasAvailableSpots && currentParticipant && currentParticipant.status === 'choosing' && (
                <Card className="border-2 border-yellow-500 bg-yellow-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-yellow-700">
                            <AlertTriangle className="h-5 w-5" />
                            Vagas Esgotadas
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-yellow-700">
                            Não há mais vagas disponíveis para escolha. O sorteio será encerrado.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* VEZ ATUAL */}
            {sessionStarted && currentParticipant && !sessionFinalized && (
                <Card className="border-2 border-primary shadow-lg">
                    <CardHeader className="bg-primary/5">
                        <CardTitle className="flex items-center gap-2">
                            <Trophy className="h-5 w-5 text-primary" />
                            Vez Atual: {currentParticipant.drawOrder}º Sorteado
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
                                    <p className="text-2xl font-bold">{spotsNeeded}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Já alocadas</p>
                                    <p className="text-2xl font-bold text-success">
                                        {currentParticipant.allocatedSpots.length}
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

                            <div className="flex gap-2">
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
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[400px]">
                            <div className="space-y-2">
                                {drawnOrder.map((participant: DrawnParticipant) => (
                                    <div
                                        key={participant.id}
                                        className={`p-4 rounded-lg border-2 transition-all ${participant.status === 'choosing'
                                            ? 'border-primary bg-primary/5 shadow-md'
                                            : participant.status === 'completed'
                                                ? 'border-success bg-success/5'
                                                : 'border-muted bg-muted/30'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${participant.status === 'choosing'
                                                    ? 'bg-primary text-primary-foreground'
                                                    : participant.status === 'completed'
                                                        ? 'bg-success text-success-foreground'
                                                        : 'bg-muted text-muted-foreground'
                                                    }`}>
                                                    {participant.drawOrder}
                                                </div>
                                                <div>
                                                    <div className="font-medium">
                                                        {participant.block && `Bloco ${participant.block} - `}
                                                        Unidade {participant.unit}
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
                                                            Completo
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
                            Digite o número da unidade ou bloco para verificar sua posição no sorteio.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Unidade ou Bloco</Label>
                            <Input
                                placeholder="Ex: 101, A, B-202..."
                                value={searchUnit}
                                onChange={(e) => setSearchUnit(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSearchUnit();
                                    }
                                }}
                            />
                        </div>

                        {/* LISTA DE TODAS AS UNIDADES */}
                        <div className="space-y-2">
                            <Label>Todas as unidades sorteadas:</Label>
                            <ScrollArea className="h-[300px] border rounded-lg p-3">
                                <div className="space-y-2">
                                    {drawnOrder.map((participant: DrawnParticipant) => (
                                        <div
                                            key={participant.id}
                                            className="p-2 border rounded-md hover:bg-muted/50 cursor-pointer"
                                            onClick={() => {
                                                setSearchUnit(participant.unit);
                                                handleSearchUnit();
                                            }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium">
                                                    {participant.block && `Bl. ${participant.block} - `}
                                                    Un. {participant.unit}
                                                </span>
                                                <Badge variant="outline">
                                                    {participant.drawOrder}º
                                                </Badge>
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {participant.name}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                onClick={handleSearchUnit}
                                className="flex-1 gradient-primary text-white"
                            >
                                <Search className="mr-2 h-4 w-4" />
                                Buscar
                            </Button>
                            <Button
                                onClick={() => setSearchUnitDialog(false)}
                                variant="outline"
                            >
                                Fechar
                            </Button>
                        </div>
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
                                            <option value="pcd">PcD</option>
                                            <option value="elderly">Idoso</option>
                                            <option value="large">Grande</option>
                                            <option value="small">Pequena</option>
                                            <option value="covered">Coberta</option>
                                            <option value="uncovered">Descoberta</option>
                                        </select>
                                    </div>
                                </div>

                                <ScrollArea className="h-[300px] border rounded-lg p-4">
                                    {filteredSpotsForEdit.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <ParkingSquare className="h-12 w-12 mx-auto mb-2 opacity-30" />
                                            <p>Nenhuma vaga disponível</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {filteredSpotsForEdit.map((spot: ParkingSpot) => {
                                                const types = Array.isArray(spot.type) ? spot.type : [spot.type];
                                                const isPcd = types.includes('Vaga PcD');
                                                const isElderly = types.includes('Vaga Idoso');
                                                const isLarge = types.includes('Vaga Grande');
                                                const isSmall = types.includes('Vaga Pequena');
                                                const isLinked = types.includes('Vaga Presa');

                                                return (
                                                    <Card
                                                        key={spot.id}
                                                        className={`cursor-pointer transition-all ${newSpotForEdit?.id === spot.id
                                                            ? 'border-2 border-green-500 bg-green-50'
                                                            : 'hover:border-primary hover:shadow-lg'
                                                            }`}
                                                        onClick={() => setNewSpotForEdit(spot)}
                                                    >
                                                        <CardHeader className="pb-3">
                                                            <CardTitle className="text-xl flex items-center gap-2">
                                                                <ParkingSquare className="h-5 w-5" />
                                                                Vaga {spot.number}
                                                            </CardTitle>
                                                            <CardDescription className="text-base font-medium">{spot.floor}</CardDescription>
                                                        </CardHeader>
                                                        <CardContent>
                                                            <div className="flex flex-wrap gap-2">
                                                                {isPcd && (
                                                                    <Badge variant="pcd" className="text-xs font-semibold px-2 py-1">
                                                                        ♿ PcD
                                                                    </Badge>
                                                                )}
                                                                {isElderly && (
                                                                    <Badge variant="elderly" className="text-xs font-semibold px-2 py-1">
                                                                        👴 Idoso
                                                                    </Badge>
                                                                )}
                                                                {isLarge && (
                                                                    <Badge variant="large" className="text-xs font-semibold px-2 py-1">
                                                                        🚙 Grande
                                                                    </Badge>
                                                                )}
                                                                {isSmall && (
                                                                    <Badge variant="small" className="text-xs font-semibold px-2 py-1">
                                                                        🚗 Pequena
                                                                    </Badge>
                                                                )}
                                                                {spot.isCovered && (
                                                                    <Badge variant="covered" className="text-xs font-semibold px-2 py-1">
                                                                        🏠 Coberta
                                                                    </Badge>
                                                                )}
                                                                {spot.isUncovered && (
                                                                    <Badge variant="uncovered" className="text-xs font-semibold px-2 py-1">
                                                                        ☀️ Descoberta
                                                                    </Badge>
                                                                )}
                                                                {isLinked && (
                                                                    <Badge variant="linked" className="text-xs font-semibold px-2 py-1">
                                                                        🔗 Presa
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
                            </div>
                        )}

                        {/* RESUMO DA TROCA */}
                        {spotToReplace && newSpotForEdit && (
                            <div className="p-4 border-2 border-primary rounded-lg bg-primary/5">
                                <p className="font-semibold mb-2">Resumo da alteração:</p>
                                <div className="flex items-center gap-2">
                                    <Badge variant="destructive" className="text-sm">
                                        Vaga {spotToReplace.number}
                                    </Badge>
                                    <ArrowRight className="h-4 w-4" />
                                    <Badge variant="default" className="bg-green-500 text-sm">
                                        Vaga {newSpotForEdit.number}
                                    </Badge>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <Button
                                onClick={handleConfirmEditSpot}
                                disabled={!spotToReplace || !newSpotForEdit}
                                className="flex-1 gradient-primary text-white"
                            >
                                <Check className="mr-2 h-4 w-4" />
                                Confirmar Alteração
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
                                        <Button
                                            onClick={handleConfirmSpot}
                                            className="gradient-primary text-white"
                                        >
                                            <Check className="mr-2 h-4 w-4" />
                                            Confirmar
                                        </Button>
                                        <Button
                                            onClick={handleCancelSpotSelection}
                                            variant="outline"
                                        >
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
                                    <option value="pcd">PcD</option>
                                    <option value="elderly">Idoso</option>
                                    <option value="large">Grande</option>
                                    <option value="small">Pequena</option>
                                    <option value="covered">Coberta</option>
                                    <option value="uncovered">Descoberta</option>
                                </select>
                            </div>
                        </div>

                        {/* Lista de Vagas - TAMANHO MAIOR */}
                        <ScrollArea className="h-[450px] border rounded-lg p-4">
                            {filteredSpots.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <ParkingSquare className="h-12 w-12 mx-auto mb-2 opacity-30" />
                                    <p>Nenhuma vaga disponível</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredSpots.map((spot: ParkingSpot) => {
                                        const types = Array.isArray(spot.type) ? spot.type : [spot.type];
                                        const isPcd = types.includes('Vaga PcD');
                                        const isElderly = types.includes('Vaga Idoso');
                                        const isLarge = types.includes('Vaga Grande');
                                        const isSmall = types.includes('Vaga Pequena');
                                        const isLinked = types.includes('Vaga Presa');

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
                                                        {isPcd && (
                                                            <Badge variant="pcd" className="text-sm font-semibold px-3 py-1">
                                                                ♿ PcD
                                                            </Badge>
                                                        )}
                                                        {isElderly && (
                                                            <Badge variant="elderly" className="text-sm font-semibold px-3 py-1">
                                                                👴 Idoso
                                                            </Badge>
                                                        )}
                                                        {isLarge && (
                                                            <Badge variant="large" className="text-sm font-semibold px-3 py-1">
                                                                🚙 Grande
                                                            </Badge>
                                                        )}
                                                        {isSmall && (
                                                            <Badge variant="small" className="text-sm font-semibold px-3 py-1">
                                                                🚗 Pequena
                                                            </Badge>
                                                        )}
                                                        {spot.isCovered && (
                                                            <Badge variant="covered" className="text-sm font-semibold px-3 py-1">
                                                                🏠 Coberta
                                                            </Badge>
                                                        )}
                                                        {spot.isUncovered && (
                                                            <Badge variant="uncovered" className="text-sm font-semibold px-3 py-1">
                                                                ☀️ Descoberta
                                                            </Badge>
                                                        )}
                                                        {isLinked && (
                                                            <Badge variant="linked" className="text-sm font-semibold px-3 py-1">
                                                                🔗 Presa
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