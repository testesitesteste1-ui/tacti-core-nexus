import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Play, Users, Car, Trophy, Clock, CheckCircle,
  RotateCcw, ParkingSquare, Layers, FileText,
  Link, Plus, Trash2, ArrowRight, AlertCircle
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Participant, ParkingSpot, LotteryResult, LotterySession, Priority } from '@/types/lottery';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { generateLotteryPDF } from '@/utils/pdfGenerator';
import { savePublicResults, clearChoiceLotteryLive } from '@/utils/publicResults';
import * as XLSX from 'xlsx';

// ============================================================================
// 🎲 EMBARALHAMENTO (Fisher-Yates)
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
// 🎯 TIPOS E INTERFACES
// ============================================================================
interface TripleAllocation {
  participantId: string;
  linkedPair: ParkingSpot[];  // 2 vagas conjugadas
  separateSpot: ParkingSpot | null; // 1 vaga separada
  allSpots: ParkingSpot[];
  priority: Priority;
  notes: string[];
}

// ============================================================================
// 🔧 FUNÇÕES AUXILIARES
// ============================================================================
function findLinkedPairs(spots: ParkingSpot[]): { pair: ParkingSpot[], floor: string }[] {
  const pairs: { pair: ParkingSpot[], floor: string }[] = [];
  const usedIds = new Set<string>();

  // 1. Pares por groupId
  const groupMap: Record<string, ParkingSpot[]> = {};
  spots.forEach(spot => {
    if (spot.groupId && !usedIds.has(spot.id)) {
      if (!groupMap[spot.groupId]) groupMap[spot.groupId] = [];
      groupMap[spot.groupId].push(spot);
    }
  });
  Object.values(groupMap).forEach(group => {
    if (group.length >= 2) {
      pairs.push({ pair: [group[0], group[1]], floor: group[0].floor });
      usedIds.add(group[0].id);
      usedIds.add(group[1].id);
    }
  });

  // 2. Pares por tipo "Vaga Presa" com números sequenciais
  const linkedByFloor: Record<string, ParkingSpot[]> = {};
  spots.forEach(spot => {
    if (usedIds.has(spot.id)) return;
    const types = Array.isArray(spot.type) ? spot.type : [spot.type];
    if (types.includes('Vaga Presa')) {
      if (!linkedByFloor[spot.floor]) linkedByFloor[spot.floor] = [];
      linkedByFloor[spot.floor].push(spot);
    }
  });

  Object.entries(linkedByFloor).forEach(([floor, floorSpots]) => {
    const sorted = floorSpots.sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }));
    for (let i = 0; i < sorted.length - 1; i++) {
      if (usedIds.has(sorted[i].id) || usedIds.has(sorted[i + 1].id)) continue;
      const numA = parseInt(sorted[i].number.replace(/\D/g, ''));
      const numB = parseInt(sorted[i + 1].number.replace(/\D/g, ''));
      if (Math.abs(numA - numB) <= 1) {
        pairs.push({ pair: [sorted[i], sorted[i + 1]], floor });
        usedIds.add(sorted[i].id);
        usedIds.add(sorted[i + 1].id);
        i++; // skip next
      }
    }
  });

  return pairs;
}

function findAdjacentSpots(spots: ParkingSpot[], floor: string): { pair: ParkingSpot[] } | null {
  const floorSpots = spots.filter(s => s.floor === floor)
    .sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }));

  for (let i = 0; i < floorSpots.length - 1; i++) {
    const numA = parseInt(floorSpots[i].number.replace(/\D/g, ''));
    const numB = parseInt(floorSpots[i + 1].number.replace(/\D/g, ''));
    if (Math.abs(numA - numB) <= 1) {
      return { pair: [floorSpots[i], floorSpots[i + 1]] };
    }
  }
  return null;
}

// ============================================================================
// 🎲 ALGORITMO PRINCIPAL DE ALOCAÇÃO TRIPLA
// ============================================================================
async function runTripleAllocation(
  participants: Participant[],
  spots: ParkingSpot[],
  preAllocations: Map<string, string[]>,
  onProgress: (step: string, progress: number) => void
): Promise<TripleAllocation[]> {
  const results: TripleAllocation[] = [];
  const assignedSpotIds = new Set<string>();
  let availableSpots = [...spots];

  // FASE 0: Aplicar pré-alocações
  const preAllocatedParticipantIds = new Set<string>();
  for (const [participantId, spotIds] of preAllocations.entries()) {
    const participant = participants.find(p => p.id === participantId);
    if (!participant) continue;

    const preSpots = spotIds.map(id => spots.find(s => s.id === id)).filter(Boolean) as ParkingSpot[];
    preSpots.forEach(s => {
      assignedSpotIds.add(s.id);
    });

    const spotsNeeded = participant.numberOfSpots || 3;
    const allocation: TripleAllocation = {
      participantId,
      linkedPair: preSpots.slice(0, 2),
      separateSpot: preSpots[2] || null,
      allSpots: preSpots,
      priority: participant.hasSpecialNeeds ? 'special-needs' : participant.isElderly ? 'elderly' : 'normal',
      notes: ['Pré-alocado'],
    };

    results.push(allocation);
    preAllocatedParticipantIds.add(participantId);
    console.log(`🔒 Pré-alocado: ${participant.name} → ${preSpots.map(s => s.number).join(', ')}`);
  }

  availableSpots = availableSpots.filter(s => !assignedSpotIds.has(s.id));
  onProgress('Pré-alocações processadas', 10);

  // FASE 1: Ordenar participantes por prioridade
  const remaining = participants.filter(p => !preAllocatedParticipantIds.has(p.id));

  const pcd = shuffleArray(remaining.filter(p => p.hasSpecialNeeds));
  const elderly = shuffleArray(remaining.filter(p => p.isElderly && !p.hasSpecialNeeds));
  const normal = shuffleArray(remaining.filter(p => !p.hasSpecialNeeds && !p.isElderly && p.isUpToDate !== false));
  const delinquent = shuffleArray(remaining.filter(p => !p.hasSpecialNeeds && !p.isElderly && p.isUpToDate === false));

  const orderedParticipants = [...pcd, ...elderly, ...normal, ...delinquent];
  onProgress('Ordem de prioridade definida', 20);

  // FASE 2: Alocar vagas para cada participante
  const totalToProcess = orderedParticipants.length;

  for (let i = 0; i < orderedParticipants.length; i++) {
    const participant = orderedParticipants[i];
    const spotsNeeded = participant.numberOfSpots || 3;
    const progressPct = 20 + ((i / totalToProcess) * 70);
    onProgress(`Processando: ${participant.name} (${i + 1}/${totalToProcess})`, progressPct);
    await new Promise(resolve => setTimeout(resolve, i < 3 ? 100 : 10));

    const notes: string[] = [];
    const allocatedSpots: ParkingSpot[] = [];
    let linkedPair: ParkingSpot[] = [];
    let separateSpot: ParkingSpot | null = null;

    // Passo 1: Encontrar dupla conjugada
    const currentAvailable = availableSpots.filter(s => !assignedSpotIds.has(s.id));
    const linkedPairs = findLinkedPairs(currentAvailable);

    // Preferir dupla no andar preferido
    let bestPair: ParkingSpot[] | null = null;
    let pairFloor = '';

    if (participant.preferredFloors && participant.preferredFloors.length > 0) {
      const pairOnPreferredFloor = linkedPairs.find(lp =>
        participant.preferredFloors!.includes(lp.floor)
      );
      if (pairOnPreferredFloor) {
        bestPair = pairOnPreferredFloor.pair;
        pairFloor = pairOnPreferredFloor.floor;
        notes.push(`Dupla no andar preferido (${pairFloor})`);
      }
    }

    if (!bestPair && linkedPairs.length > 0) {
      // Pegar qualquer dupla disponível (aleatoriamente)
      const randomIdx = Math.floor(Math.random() * linkedPairs.length);
      bestPair = linkedPairs[randomIdx].pair;
      pairFloor = linkedPairs[randomIdx].floor;
      if (participant.preferredFloors?.length) {
        notes.push(`Dupla fora do andar preferido → ${pairFloor}`);
      }
    }

    if (bestPair) {
      linkedPair = bestPair;
      bestPair.forEach(s => {
        assignedSpotIds.add(s.id);
        allocatedSpots.push(s);
      });
    } else {
      // Sem dupla disponível → pegar 2 vagas adjacentes no mesmo andar
      notes.push('Sem dupla conjugada disponível');

      // Tentar vagas adjacentes por andar
      const spotsByFloor: Record<string, ParkingSpot[]> = {};
      currentAvailable.forEach(s => {
        if (!assignedSpotIds.has(s.id)) {
          if (!spotsByFloor[s.floor]) spotsByFloor[s.floor] = [];
          spotsByFloor[s.floor].push(s);
        }
      });

      // Preferir andar preferido
      const floorOrder = participant.preferredFloors?.length
        ? [...participant.preferredFloors, ...Object.keys(spotsByFloor).filter(f => !participant.preferredFloors!.includes(f))]
        : Object.keys(spotsByFloor);

      let foundAdjacent = false;
      for (const floor of floorOrder) {
        if (!spotsByFloor[floor] || spotsByFloor[floor].length < 2) continue;
        const adj = findAdjacentSpots(spotsByFloor[floor].filter(s => !assignedSpotIds.has(s.id)), floor);
        if (adj) {
          linkedPair = adj.pair;
          adj.pair.forEach(s => {
            assignedSpotIds.add(s.id);
            allocatedSpots.push(s);
          });
          pairFloor = floor;
          notes.push(`2 vagas lado a lado no ${floor}`);
          foundAdjacent = true;
          break;
        }
      }

      if (!foundAdjacent) {
        // Pegar quaisquer 2 vagas disponíveis
        const remaining2 = currentAvailable.filter(s => !assignedSpotIds.has(s.id));
        const shuffled = shuffleArray(remaining2);
        const taken = shuffled.slice(0, Math.min(2, shuffled.length));
        taken.forEach(s => {
          assignedSpotIds.add(s.id);
          allocatedSpots.push(s);
          linkedPair.push(s);
        });
        if (taken.length > 0) {
          pairFloor = taken[0].floor;
          notes.push(`2 vagas individuais (sem adjacência disponível)`);
        }
      }
    }

    // Passo 2: Encontrar vaga separada (preferência mesmo andar da dupla)
    if (allocatedSpots.length < spotsNeeded) {
      const spotsRemaining = spotsNeeded - allocatedSpots.length;

      for (let s = 0; s < spotsRemaining; s++) {
        const stillAvailable = availableSpots.filter(sp => !assignedSpotIds.has(sp.id));

        // Preferir mesmo andar da dupla
        let spot = stillAvailable.find(sp => sp.floor === pairFloor);

        if (!spot && participant.preferredFloors?.length) {
          spot = stillAvailable.find(sp => participant.preferredFloors!.includes(sp.floor));
        }

        if (!spot && stillAvailable.length > 0) {
          const shuffled = shuffleArray(stillAvailable);
          spot = shuffled[0];
          if (pairFloor && spot.floor !== pairFloor) {
            notes.push(`Vaga separada em outro andar (${spot.floor})`);
          }
        }

        if (spot) {
          assignedSpotIds.add(spot.id);
          allocatedSpots.push(spot);
          if (s === 0) separateSpot = spot;
        }
      }
    }

    const priority: Priority = participant.hasSpecialNeeds ? 'special-needs' :
      participant.isElderly ? 'elderly' : 'normal';

    results.push({
      participantId: participant.id,
      linkedPair,
      separateSpot,
      allSpots: allocatedSpots,
      priority,
      notes,
    });

    console.log(`✅ ${participant.name}: ${allocatedSpots.map(s => s.number).join(', ')} [${notes.join('; ')}]`);
  }

  onProgress('Sorteio concluído!', 100);
  return results;
}

// ============================================================================
// 🎨 COMPONENTE PRINCIPAL
// ============================================================================
export default function TripleLotterySystem(): JSX.Element {
  const {
    participants, parkingSpots, selectedBuilding, saveLotterySession
  } = useAppContext();
  const { toast } = useToast();
  const resultsRef = useRef<HTMLDivElement>(null);

  // Filtrar por prédio
  const buildingParticipants = participants.filter(p => p.buildingId === selectedBuilding?.id);
  const buildingSpots = parkingSpots.filter(s =>
    s.buildingId === selectedBuilding?.id && s.status === 'available'
  );

  // Estados
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [allocations, setAllocations] = useState<TripleAllocation[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'participant' | 'spot'>('participant');

  // Pré-alocação
  const [preAllocations, setPreAllocations] = useState<Map<string, string[]>>(new Map());
  const [isPreAllocationOpen, setIsPreAllocationOpen] = useState(false);
  const [selectedPreParticipant, setSelectedPreParticipant] = useState('');
  const [selectedPreSpot, setSelectedPreSpot] = useState('');

  // Persistência
  useEffect(() => {
    if (!selectedBuilding?.id) return;
    const saved = localStorage.getItem(`triple-lottery-results-${selectedBuilding.id}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setAllocations(data);
        setShowResults(true);
      } catch (e) { console.error(e); }
    }
    const savedPre = localStorage.getItem(`triple-lottery-prealloc-${selectedBuilding.id}`);
    if (savedPre) {
      try { setPreAllocations(new Map(JSON.parse(savedPre))); }
      catch (e) { console.error(e); }
    }
  }, [selectedBuilding?.id]);

  useEffect(() => {
    if (!selectedBuilding?.id || allocations.length === 0) return;
    localStorage.setItem(`triple-lottery-results-${selectedBuilding.id}`, JSON.stringify(allocations));
  }, [allocations, selectedBuilding?.id]);

  useEffect(() => {
    if (!selectedBuilding?.id) return;
    if (preAllocations.size > 0) {
      localStorage.setItem(`triple-lottery-prealloc-${selectedBuilding.id}`, JSON.stringify(Array.from(preAllocations.entries())));
    }
  }, [preAllocations, selectedBuilding?.id]);

  // Maps
  const participantMap = useMemo(() => {
    const map = new Map<string, Participant>();
    participants.forEach(p => map.set(p.id, p));
    return map;
  }, [participants]);

  const spotMap = useMemo(() => {
    const map = new Map<string, ParkingSpot>();
    parkingSpots.forEach(s => map.set(s.id, s));
    return map;
  }, [parkingSpots]);

  // Stats
  const stats = useMemo(() => ({
    totalParticipants: buildingParticipants.length,
    totalSpots: buildingSpots.length,
    pcd: buildingParticipants.filter(p => p.hasSpecialNeeds).length,
    elderly: buildingParticipants.filter(p => p.isElderly && !p.hasSpecialNeeds).length,
    linkedPairs: findLinkedPairs(buildingSpots).length,
    preAllocated: Array.from(preAllocations.values()).flat().length,
    successRate: buildingParticipants.length > 0
      ? Math.min(100, Math.round((buildingSpots.length / (buildingParticipants.length * 3)) * 100))
      : 0,
  }), [buildingParticipants, buildingSpots, preAllocations]);

  // Pré-alocação handlers
  const handleAddPreAllocation = () => {
    if (!selectedPreParticipant || !selectedPreSpot) return;
    const newMap = new Map(preAllocations);
    const current = newMap.get(selectedPreParticipant) || [];
    if (current.includes(selectedPreSpot)) return;
    newMap.set(selectedPreParticipant, [...current, selectedPreSpot]);
    setPreAllocations(newMap);
    setSelectedPreSpot('');
    toast({ title: "Pré-alocação adicionada!" });
  };

  const handleRemovePreAllocation = (participantId: string, spotId: string) => {
    const newMap = new Map(preAllocations);
    const current = newMap.get(participantId) || [];
    const updated = current.filter(s => s !== spotId);
    if (updated.length === 0) newMap.delete(participantId);
    else newMap.set(participantId, updated);
    setPreAllocations(newMap);
  };

  const getPreAllocatedSpotIds = (): string[] => {
    const ids: string[] = [];
    preAllocations.forEach(spots => ids.push(...spots));
    return ids;
  };

  // Executar sorteio
  const runLottery = async () => {
    if (buildingParticipants.length === 0 || buildingSpots.length === 0) {
      toast({ title: "Erro", description: "Sem participantes ou vagas.", variant: "destructive" });
      return;
    }

    setIsRunning(true);
    setProgress(0);
    setAllocations([]);
    setShowResults(false);

    if (selectedBuilding?.id) await clearChoiceLotteryLive(selectedBuilding.id);

    try {
      const results = await runTripleAllocation(
        buildingParticipants,
        buildingSpots,
        preAllocations,
        (step, prog) => { setCurrentStep(step); setProgress(prog); }
      );

      setAllocations(results);
      setShowResults(true);
      setIsRunning(false);

      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

      // Salvar sessão
      const lotteryResults: LotteryResult[] = [];
      results.forEach(alloc => {
        const participant = participantMap.get(alloc.participantId);
        alloc.allSpots.forEach((spot, idx) => {
          lotteryResults.push({
            id: `triple-${alloc.participantId}-${spot.id}`,
            participantId: alloc.participantId,
            parkingSpotId: spot.id,
            timestamp: new Date(),
            priority: alloc.priority,
            participantSnapshot: participant ? { name: participant.name, block: participant.block, unit: participant.unit } : undefined,
            spotSnapshot: { number: spot.number, floor: spot.floor, type: spot.type, size: spot.size, isCovered: spot.isCovered, isUncovered: spot.isUncovered },
          });
        });
      });

      const session: LotterySession = {
        id: `triple-session-${Date.now()}`,
        buildingId: selectedBuilding?.id || '',
        name: `SORTEIO VAGA TRIPLA ${new Date().toLocaleDateString('pt-BR')}`,
        date: new Date(),
        participants: results.map(r => r.participantId),
        availableSpots: buildingSpots.map(s => s.id),
        results: lotteryResults,
        status: 'completed',
        settings: { allowSharedSpots: false, prioritizeElders: true, prioritizeSpecialNeeds: true, zoneByProximity: false },
      };

      saveLotterySession(session);

      const saveResult = await savePublicResults(
        session, selectedBuilding?.name || '', participants, parkingSpots, selectedBuilding?.company
      );

      toast({
        title: "Sorteio Concluído! 🎉",
        description: `${results.length} participante(s) receberam vagas.${saveResult?.success ? ' Resultados publicados.' : ''}`,
      });
    } catch (error) {
      console.error('Erro no sorteio:', error);
      toast({ title: "Erro no sorteio", description: "Tente novamente.", variant: "destructive" });
      setIsRunning(false);
    }
  };

  const handleNewLottery = () => {
    setAllocations([]);
    setShowResults(false);
    setProgress(0);
    setCurrentStep('');
    if (selectedBuilding?.id) {
      localStorage.removeItem(`triple-lottery-results-${selectedBuilding.id}`);
    }
    toast({ title: "Pronto para novo sorteio" });
  };

  // PDF
  const handleGeneratePDF = (mode: 'participant' | 'spot') => {
    const lotteryResults: LotteryResult[] = [];
    allocations.forEach(alloc => {
      const participant = participantMap.get(alloc.participantId);
      alloc.allSpots.forEach(spot => {
        lotteryResults.push({
          id: `triple-${alloc.participantId}-${spot.id}`,
          participantId: alloc.participantId, parkingSpotId: spot.id,
          timestamp: new Date(), priority: alloc.priority,
          participantSnapshot: participant ? { name: participant.name, block: participant.block, unit: participant.unit } : undefined,
          spotSnapshot: { number: spot.number, floor: spot.floor, type: spot.type, size: spot.size, isCovered: spot.isCovered, isUncovered: spot.isUncovered },
        });
      });
    });
    generateLotteryPDF(
      `Sorteio Vaga Tripla - ${new Date().toLocaleDateString('pt-BR')}`,
      lotteryResults, participants, parkingSpots,
      selectedBuilding?.company || 'exvagas', selectedBuilding?.name, mode
    );
    toast({ title: "PDF gerado!" });
  };

  // Excel
  const handleGenerateExcel = () => {
    const data: any[] = [];
    allocations.forEach(alloc => {
      const p = participantMap.get(alloc.participantId);
      alloc.allSpots.forEach((spot, idx) => {
        data.push({
          'Bloco': p?.block || '', 'Unidade': p?.unit || '', 'Nome': p?.name || '',
          'Prioridade': alloc.priority === 'special-needs' ? 'PcD' : alloc.priority === 'elderly' ? 'Idoso' : 'Normal',
          'Vaga Nº': idx + 1, 'Número da Vaga': spot.number, 'Andar': spot.floor,
          'Tipo': Array.isArray(spot.type) ? spot.type.join(', ') : spot.type,
          'Tipo Alocação': idx < 2 ? 'Conjugada' : 'Separada',
          'Observações': alloc.notes.join('; '),
        });
      });
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sorteio Tripla');
    XLSX.writeFile(wb, `sorteio-vaga-tripla-${selectedBuilding?.name || 'resultado'}-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: "Excel gerado!" });
  };

  // Filtrar resultados
  const filteredAllocations = useMemo(() => {
    if (!searchTerm) return allocations;
    const search = searchTerm.toLowerCase();
    return allocations.filter(alloc => {
      const p = participantMap.get(alloc.participantId);
      return p?.name?.toLowerCase().includes(search) ||
        p?.block?.toLowerCase().includes(search) ||
        p?.unit?.toLowerCase().includes(search) ||
        alloc.allSpots.some(s => s.number.toLowerCase().includes(search));
    });
  }, [allocations, searchTerm, participantMap]);

  const getPriorityBadge = (priority: Priority) => {
    if (priority === 'special-needs') return <Badge variant="pcd">PcD</Badge>;
    if (priority === 'elderly') return <Badge variant="elderly">Idoso</Badge>;
    return null;
  };

  // ============================================================================
  // RENDER
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
              Sorteio automático: 2 vagas conjugadas + 1 separada por participante
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            variant="secondary"
            onClick={() => setIsPreAllocationOpen(true)}
            disabled={isRunning}
          >
            <Link className="mr-2 h-4 w-4" />
            Pré-alocar Vagas {preAllocations.size > 0 && `(${stats.preAllocated})`}
          </Button>
          <Button
            onClick={runLottery}
            disabled={isRunning || buildingParticipants.length === 0 || buildingSpots.length === 0}
            className="bg-gradient-to-r from-violet-500 to-purple-700 text-white shadow-md"
          >
            {isRunning ? (
              <><Clock className="mr-2 h-4 w-4 animate-spin" /> Executando...</>
            ) : (
              <><Play className="mr-2 h-4 w-4" /> Executar Sorteio</>
            )}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" /> Participantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalParticipants}</div>
            <p className="text-xs text-muted-foreground">{stats.pcd} PcD, {stats.elderly} Idosos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Car className="h-4 w-4" /> Vagas Totais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSpots}</div>
            <p className="text-xs text-muted-foreground">{stats.linkedPairs} duplas conjugadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ParkingSquare className="h-4 w-4" /> Vagas Necessárias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {buildingParticipants.reduce((sum, p) => sum + (p.numberOfSpots || 3), 0)}
            </div>
            <p className="text-xs text-muted-foreground">~{buildingParticipants.length > 0 ? Math.round(buildingParticipants.reduce((sum, p) => sum + (p.numberOfSpots || 3), 0) / buildingParticipants.length) : 0} por participante</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Link className="h-4 w-4" /> Pré-alocadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{stats.preAllocated}</div>
            <p className="text-xs text-muted-foreground">{preAllocations.size} participantes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" /> Taxa de Sucesso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{stats.successRate}%</div>
            <p className="text-xs text-muted-foreground">Vagas / necessidade</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {isRunning && (
        <Card>
          <CardHeader>
            <CardTitle>Sorteio em Andamento</CardTitle>
            <CardDescription>{currentStep}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} className="w-full" />
            <div className="flex items-center justify-center">
              <div className="w-8 h-8 animate-spin bg-gradient-to-r from-violet-500 to-purple-700 rounded-full flex items-center justify-center">
                <Trophy className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {showResults && allocations.length > 0 && (
        <Card ref={resultsRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-success" />
              Resultados do Sorteio
            </CardTitle>
            <CardDescription>
              {allocations.length} participante(s) — {allocations.reduce((sum, a) => sum + a.allSpots.length, 0)} vagas alocadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Controles */}
            <div className="mb-4 flex gap-2">
              <Button variant={viewMode === 'participant' ? 'default' : 'outline'} onClick={() => setViewMode('participant')} className="flex-1">
                <Users className="mr-2 h-4 w-4" /> Por Morador
              </Button>
              <Button variant={viewMode === 'spot' ? 'default' : 'outline'} onClick={() => setViewMode('spot')} className="flex-1">
                <ParkingSquare className="mr-2 h-4 w-4" /> Por Vaga
              </Button>
            </div>

            <div className="mb-4">
              <Input placeholder="Buscar por nome, unidade ou nº da vaga..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <ScrollArea className="h-[calc(100vh-200px)] pr-4">
              <div className="space-y-3">
                {viewMode === 'participant' ? (
                  filteredAllocations
                    .sort((a, b) => {
                      const pA = participantMap.get(a.participantId);
                      const pB = participantMap.get(b.participantId);
                      const blockCmp = (pA?.block || '').localeCompare(pB?.block || '', 'pt-BR', { numeric: true });
                      if (blockCmp !== 0) return blockCmp;
                      return (pA?.unit || '').localeCompare(pB?.unit || '', 'pt-BR', { numeric: true });
                    })
                    .map((alloc) => {
                      const p = participantMap.get(alloc.participantId);
                      return (
                        <div key={alloc.participantId} className="p-4 bg-muted rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-700 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                {alloc.allSpots.length}
                              </div>
                              <div>
                                <div className="font-medium">
                                  {p?.block ? `Bloco ${p.block} - ` : ''}Unidade {p?.unit || 'N/A'}
                                </div>
                                <div className="text-xs text-muted-foreground">{p?.name}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getPriorityBadge(alloc.priority)}
                              <Badge variant="outline">{alloc.allSpots.length} vagas</Badge>
                            </div>
                          </div>

                          <div className="pl-11 space-y-1">
                            {alloc.allSpots.map((spot, idx) => {
                              const isLinked = idx < alloc.linkedPair.length;
                              const typeArray = spot?.type ? (Array.isArray(spot.type) ? spot.type : [spot.type]) : [];
                              return (
                                <div key={spot.id}>
                                  <div className="text-sm font-medium text-success flex items-center gap-1">
                                    <span>{isLinked ? '🔗' : '🔓'}</span>
                                    Vaga {spot.number} - {spot.floor}
                                    <span className="text-xs text-muted-foreground">({isLinked ? 'Conjugada' : 'Separada'})</span>
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                                    {typeArray.filter(t => t !== 'Vaga Coberta' && t !== 'Vaga Descoberta').map((type, i) => (
                                      <Badge key={i} variant={
                                        type === 'Vaga PcD' ? 'pcd' : type === 'Vaga Idoso' ? 'elderly' :
                                        type === 'Vaga Presa' ? 'linked' : type === 'Vaga Livre' ? 'unlinked' :
                                        type === 'Vaga Grande' ? 'large' : type === 'Vaga Pequena' ? 'small' :
                                        type === 'Vaga Motocicleta' ? 'motorcycle' : 'common'
                                      } className="text-[10px] px-1.5 py-0">{type}</Badge>
                                    ))}
                                    {spot?.isCovered && <Badge variant="covered" className="text-[10px] px-1.5 py-0">Coberta</Badge>}
                                    {spot?.isUncovered && <Badge variant="uncovered" className="text-[10px] px-1.5 py-0">Descoberta</Badge>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {alloc.notes.length > 0 && (
                            <div className="pl-11 mt-2">
                              <p className="text-xs text-muted-foreground italic">📝 {alloc.notes.join(' | ')}</p>
                            </div>
                          )}
                        </div>
                      );
                    })
                ) : (
                  // Por Vaga
                  (() => {
                    const spotAllocMap = new Map<string, { spot: ParkingSpot; participant: Participant | undefined; allocType: string }>();
                    allocations.forEach(alloc => {
                      const p = participantMap.get(alloc.participantId);
                      alloc.allSpots.forEach((spot, idx) => {
                        spotAllocMap.set(spot.id, {
                          spot,
                          participant: p,
                          allocType: idx < alloc.linkedPair.length ? 'Conjugada' : 'Separada',
                        });
                      });
                    });

                    return Array.from(spotAllocMap.entries())
                      .filter(([, data]) => {
                        if (!searchTerm) return true;
                        const s = searchTerm.toLowerCase();
                        return data.spot.number.toLowerCase().includes(s) ||
                          data.spot.floor.toLowerCase().includes(s) ||
                          data.participant?.name?.toLowerCase().includes(s) ||
                          data.participant?.unit?.toLowerCase().includes(s);
                      })
                      .sort(([, a], [, b]) => a.spot.number.localeCompare(b.spot.number, 'pt-BR', { numeric: true }))
                      .map(([spotId, data]) => (
                        <div key={spotId} className="p-4 bg-muted rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                              <ParkingSquare className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="font-medium">Vaga {data.spot.number} - {data.spot.floor}</div>
                              <div className="text-sm text-success">
                                {data.participant?.block ? `Bl. ${data.participant.block} - ` : ''}Un. {data.participant?.unit} — {data.participant?.name}
                              </div>
                            </div>
                          </div>
                          <Badge variant={data.allocType === 'Conjugada' ? 'linked' : 'unlinked'} className="text-xs">
                            {data.allocType === 'Conjugada' ? '🔗' : '🔓'} {data.allocType}
                          </Badge>
                        </div>
                      ));
                  })()
                )}
              </div>
            </ScrollArea>

            <div className="mt-6 flex flex-col sm:flex-row gap-2">
              <Button variant="outline" className="flex-1" onClick={() => handleGeneratePDF('participant')}>
                📄 PDF por Participante
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => handleGeneratePDF('spot')}>
                🅿️ PDF por Vaga
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleGenerateExcel}>
                📊 Excel
              </Button>
              <Button className="flex-1 bg-gradient-to-r from-violet-500 to-purple-700 text-white" onClick={handleNewLottery}>
                <RotateCcw className="mr-2 h-4 w-4" /> Novo Sorteio
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog: Pré-alocação */}
      <Dialog open={isPreAllocationOpen} onOpenChange={setIsPreAllocationOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="h-5 w-5" /> Pré-Alocação de Vagas
            </DialogTitle>
            <DialogDescription>
              Reserve vagas para PcDs ou participantes específicos antes do sorteio automático.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Participante</Label>
                <select className="w-full p-2 border rounded-md bg-background" value={selectedPreParticipant} onChange={(e) => setSelectedPreParticipant(e.target.value)}>
                  <option value="">Selecione...</option>
                  {[...buildingParticipants]
                    .sort((a, b) => {
                      const bA = (a.block || '').localeCompare(b.block || '', 'pt-BR', { numeric: true });
                      if (bA !== 0) return bA;
                      return (a.unit || '').localeCompare(b.unit || '', 'pt-BR', { numeric: true });
                    })
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.block && `${p.block} - `}Un. {p.unit} {p.hasSpecialNeeds ? '(PcD)' : ''} — {p.name}
                      </option>
                    ))
                  }
                </select>
              </div>
              <div className="space-y-2">
                <Label>Vaga</Label>
                <select className="w-full p-2 border rounded-md bg-background" value={selectedPreSpot} onChange={(e) => setSelectedPreSpot(e.target.value)}>
                  <option value="">Selecione...</option>
                  {buildingSpots
                    .filter(s => !getPreAllocatedSpotIds().includes(s.id))
                    .sort((a, b) => {
                      if (a.floor !== b.floor) return a.floor.localeCompare(b.floor, 'pt-BR', { numeric: true });
                      return a.number.localeCompare(b.number, 'pt-BR', { numeric: true });
                    })
                    .map(s => (
                      <option key={s.id} value={s.id}>Vaga {s.number} - {s.floor}</option>
                    ))
                  }
                </select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleAddPreAllocation} disabled={!selectedPreParticipant || !selectedPreSpot} className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Adicionar
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{stats.totalParticipants}</p>
                <p className="text-xs text-muted-foreground">Participantes</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.totalSpots}</p>
                <p className="text-xs text-muted-foreground">Vagas Totais</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-success">{stats.preAllocated}</p>
                <p className="text-xs text-muted-foreground">Pré-alocadas</p>
              </div>
            </div>

            {preAllocations.size > 0 ? (
              <div className="space-y-2">
                <Label>Pré-alocações ({stats.preAllocated} vagas para {preAllocations.size} participantes)</Label>
                <ScrollArea className="h-[200px] border rounded-lg p-3">
                  <div className="space-y-2">
                    {Array.from(preAllocations.entries()).map(([participantId, spotIds]) => {
                      const participant = buildingParticipants.find(p => p.id === participantId);
                      return spotIds.map(spotId => {
                        const spot = buildingSpots.find(s => s.id === spotId);
                        return (
                          <div key={`${participantId}-${spotId}`} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                            <div className="flex items-center gap-3">
                              <Badge variant="secondary">
                                {participant?.block && `${participant.block} - `}Un. {participant?.unit}
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
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>Nenhuma pré-alocação configurada</p>
                <p className="text-xs mt-1">Ideal para reservar vagas PcD antes do sorteio</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
