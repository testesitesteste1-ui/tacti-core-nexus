import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Play, Settings, Users, Trophy, MapPin, CheckCircle, Building, RotateCcw, ParkingSquare } from 'lucide-react';
import { Participant, ParkingSpot, LotteryResult, LotterySession, AVAILABLE_SECTORS, SectorName } from '@/types/lottery';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { generateLotteryPDF } from '@/utils/pdfGenerator';
import { savePublicResults } from '@/utils/publicResults';

// Tipos específicos para o sorteio por setor
interface SectorLotteryConfig {
  sessionName: string;
  sectorMapping: Record<string, string[]>; // Setor -> setores próximos em ordem de prioridade
}

export const SectorLotterySystem = () => {
  const {
    participants,
    parkingSpots,
    saveLotterySession,
    selectedBuilding
  } = useAppContext();

  const { toast } = useToast();

  const buildingId = selectedBuilding?.id || '';
  const storageKey = `sectorLottery_${buildingId}`;

  const [isRunning, setIsRunning] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [results, setResults] = useState<LotteryResult[]>(() => {
    if (!buildingId) return [];
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.results || [];
      }
    } catch {}
    return [];
  });
  const [showResults, setShowResults] = useState(() => {
    if (!buildingId) return false;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return (parsed.results?.length || 0) > 0;
      }
    } catch {}
    return false;
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Estados para escolha manual de PcD
  const [isPcdManualSelectionOpen, setIsPcdManualSelectionOpen] = useState(false);
  const [currentPcdParticipant, setCurrentPcdParticipant] = useState<Participant | null>(null);
  const [availableSpotsForPcd, setAvailableSpotsForPcd] = useState<ParkingSpot[]>([]);
  const [selectedPcdSpot, setSelectedPcdSpot] = useState<string | null>(null);
  const [pcdSelectionResolve, setPcdSelectionResolve] = useState<((spotId: string | null) => void) | null>(null);

  // Participantes e vagas do condomínio selecionado
  const buildingParticipants = useMemo(() =>
    participants.filter(p => p.buildingId === selectedBuilding?.id),
    [participants, selectedBuilding?.id]
  );

  const buildingSpots = useMemo(() =>
    parkingSpots.filter(s => s.buildingId === selectedBuilding?.id && s.status === 'available'),
    [parkingSpots, selectedBuilding?.id]
  );

  // Setores em uso no condomínio (derivados dos dados reais)
  const usedSectors = useMemo(() => {
    const sectors = new Set<string>();
    buildingParticipants.forEach(p => { if (p.sector) sectors.add(p.sector); });
    buildingSpots.forEach(s => { if (s.sector) sectors.add(s.sector); });
    return Array.from(sectors).sort();
  }, [buildingParticipants, buildingSpots]);

  // Configuração de mapeamento de setores (inicializar com setores em uso)
  const [config, setConfig] = useState<SectorLotteryConfig>({
    sessionName: `SORTEIO SETORIAL ${new Date().toLocaleDateString('pt-BR')}`,
    sectorMapping: {},
  });

  // Atualizar mapeamento quando setores em uso mudam
  useEffect(() => {
    if (usedSectors.length > 0) {
      setConfig(prev => {
        const newMapping: Record<string, string[]> = { ...prev.sectorMapping };
        usedSectors.forEach(sector => {
          if (!newMapping[sector]) {
            newMapping[sector] = [sector, ...usedSectors.filter(s => s !== sector)];
          }
        });
        return { ...prev, sectorMapping: newMapping };
      });
    }
  }, [usedSectors]);

  // Persistir resultados no localStorage
  useEffect(() => {
    if (!buildingId) return;
    if (results.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify({ results }));
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [results, storageKey, buildingId]);

  // Extrair setor da vaga
  const getSpotSector = (spot: ParkingSpot): string | null => {
    if (spot.sector) return spot.sector;
    return null;
  };

  // Verificar se a vaga é PcD
  const isSpotPcD = (spot: ParkingSpot): boolean => {
    const types = Array.isArray(spot.type) ? spot.type : [spot.type];
    return types.includes('Vaga PcD');
  };

  // Verificar se a vaga é de Idoso
  const isSpotIdoso = (spot: ParkingSpot): boolean => {
    const types = Array.isArray(spot.type) ? spot.type : [spot.type];
    return types.includes('Vaga Idoso');
  };

  // Verificar se a vaga é de Motocicleta
  const isSpotMotorcycle = (spot: ParkingSpot): boolean => {
    const types = Array.isArray(spot.type) ? spot.type : [spot.type];
    return types.includes('Vaga Motocicleta');
  };

  // Helper: verificar se spot tem atributo
  const spotHasType = (spot: ParkingSpot, typeName: string): boolean => {
    const types = Array.isArray(spot.type) ? spot.type : [spot.type];
    return types.includes(typeName as any);
  };

  // Helper: verificar cobertura
  const spotIsCovered = (spot: ParkingSpot): boolean => {
    return spotHasType(spot, 'Vaga Coberta') || spot.isCovered === true;
  };
  const spotIsUncovered = (spot: ParkingSpot): boolean => {
    return spotHasType(spot, 'Vaga Descoberta') || spot.isUncovered === true;
  };

  // Verificar se participante é inadimplente
  const isDefaulter = (participant: Participant): boolean => {
    return participant.isUpToDate === false;
  };

  const getPriorityLevel = (participant: Participant): 'normal' | 'elderly' | 'special-needs' | 'up-to-date' => {
    if (participant.hasSpecialNeeds) return 'special-needs';
    if (participant.isElderly) return 'elderly';
    if (participant.isUpToDate) return 'up-to-date';
    return 'normal';
  };

  /**
   * Filtra vagas elegíveis para um participante, respeitando preferências.
   * strict = true: retorna vazio se preferência de cobertura/tipo não atendida.
   * strict = false: relaxa preferências de cobertura/Livre/Presa.
   */
  const filterSpotsForParticipant = (
    spots: ParkingSpot[],
    participant: Participant,
    assignedSpotIds: Set<string>,
    strict: boolean = true
  ): ParkingSpot[] => {
    let eligible = spots.filter(s => !assignedSpotIds.has(s.id));

    // 1. Exclusividade de Motocicleta (bidirecional)
    if (participant.hasMotorcycle) {
      eligible = eligible.filter(s => isSpotMotorcycle(s));
    } else {
      eligible = eligible.filter(s => !isSpotMotorcycle(s));
    }

    // 2. PcD: participante NÃO-PcD não pega vaga PcD
    if (!participant.hasSpecialNeeds) {
      eligible = eligible.filter(s => !isSpotPcD(s));
    }

    // 3. Idoso: participante NÃO-Idoso evita vaga Idoso
    if (!participant.isElderly) {
      const nonIdoso = eligible.filter(s => !isSpotIdoso(s));
      if (nonIdoso.length > 0) eligible = nonIdoso;
    }

    // 4. Preferência Coberta/Descoberta
    const wantsCovered = participant.prefersCovered && !participant.prefersUncovered;
    const wantsUncovered = participant.prefersUncovered && !participant.prefersCovered;
    if (wantsCovered) {
      const covered = eligible.filter(s => spotIsCovered(s));
      if (covered.length > 0) eligible = covered;
      else if (strict) return [];
    } else if (wantsUncovered) {
      const uncovered = eligible.filter(s => spotIsUncovered(s));
      if (uncovered.length > 0) eligible = uncovered;
      else if (strict) return [];
    }

    // 5. Preferência Presa/Livre
    if (participant.prefersLinkedSpot && !participant.prefersUnlinkedSpot) {
      const linked = eligible.filter(s => spotHasType(s, 'Vaga Presa'));
      if (linked.length > 0) eligible = linked;
      else if (strict) return [];
    } else if (participant.prefersUnlinkedSpot && !participant.prefersLinkedSpot) {
      const unlinked = eligible.filter(s => spotHasType(s, 'Vaga Livre'));
      if (unlinked.length > 0) eligible = unlinked;
      else if (strict) return [];
    }

    // 6. Veículo Pequeno → preferir vaga pequena
    if (participant.prefersSmallSpot || participant.hasSmallCar) {
      const small = eligible.filter(s => spotHasType(s, 'Vaga Pequena') || s.size === 'P');
      if (small.length > 0) eligible = small;
    }

    // 7. Veículo Grande → preferir vaga grande
    if (participant.hasLargeCar) {
      const large = eligible.filter(s => spotHasType(s, 'Vaga Grande') || s.size === 'G' || s.size === 'XG');
      if (large.length > 0) eligible = large;
    }

    // 8. Andares preferidos (soft)
    if (participant.preferredFloors && participant.preferredFloors.length > 0) {
      const inFloors = eligible.filter(s => participant.preferredFloors!.includes(s.floor));
      if (inFloors.length > 0) eligible = inFloors;
    }

    return eligible;
  };

  /**
   * Encontra a melhor vaga para um participante, seguindo ordem de setores.
   * Fase 1: Vagas no setor (strict) → vagas sem setor (strict)
   * Fase 2: Vagas no setor (relaxed) → vagas sem setor (relaxed)
   * Fase 3: Qualquer vaga restante
   */
  const findBestSpot = (
    participant: Participant,
    availableSpots: ParkingSpot[],
    assignedSpotIds: Set<string>,
    sectorPriority: string[]
  ): ParkingSpot | null => {
    // Fase 1: Strict
    for (const sector of sectorPriority) {
      const sectorSpots = availableSpots.filter(s => getSpotSector(s) === sector);
      const eligible = filterSpotsForParticipant(sectorSpots, participant, assignedSpotIds, true);
      if (eligible.length > 0) return eligible[Math.floor(Math.random() * eligible.length)];
    }
    // Fase 1b: Vagas sem setor (strict)
    const noSectorSpots = availableSpots.filter(s => !getSpotSector(s));
    const eligibleNoSector = filterSpotsForParticipant(noSectorSpots, participant, assignedSpotIds, true);
    if (eligibleNoSector.length > 0) return eligibleNoSector[Math.floor(Math.random() * eligibleNoSector.length)];

    // Fase 2: Relaxed
    for (const sector of sectorPriority) {
      const sectorSpots = availableSpots.filter(s => getSpotSector(s) === sector);
      const eligible = filterSpotsForParticipant(sectorSpots, participant, assignedSpotIds, false);
      if (eligible.length > 0) {
        console.log(`      ⚠️ ${participant.name}: preferências relaxadas no setor ${sector}`);
        return eligible[Math.floor(Math.random() * eligible.length)];
      }
    }
    // Fase 2b: Vagas sem setor (relaxed)
    const eligibleNoSectorRelaxed = filterSpotsForParticipant(noSectorSpots, participant, assignedSpotIds, false);
    if (eligibleNoSectorRelaxed.length > 0) {
      console.log(`      ⚠️ ${participant.name}: usando vaga sem setor (preferências relaxadas)`);
      return eligibleNoSectorRelaxed[Math.floor(Math.random() * eligibleNoSectorRelaxed.length)];
    }

    // Fase 3: Qualquer vaga (respeita exclusividade moto)
    const anyEligible = availableSpots.filter(s => {
      if (assignedSpotIds.has(s.id)) return false;
      if (participant.hasMotorcycle) return isSpotMotorcycle(s);
      return !isSpotMotorcycle(s) && !isSpotPcD(s);
    });
    if (anyEligible.length > 0) {
      console.log(`      ❗ ${participant.name}: alocado em vaga residual`);
      return anyEligible[Math.floor(Math.random() * anyEligible.length)];
    }
    return null;
  };

  /** Monta lista de prioridade de setores para um participante */
  const getSectorPriority = (participant: Participant): string[] => {
    if (participant.preferredSectors && participant.preferredSectors.length > 0) {
      return [
        ...participant.preferredSectors,
        ...usedSectors.filter(s => !participant.preferredSectors!.includes(s as any))
      ];
    }
    const pSector = participant.sector;
    if (pSector) {
      return selectedBuilding?.sectorProximity?.[pSector]
        || config.sectorMapping[pSector]
        || [pSector, ...usedSectors.filter(s => s !== pSector)];
    }
    return usedSectors;
  };

  // Estatísticas
  const stats = useMemo(() => {
    const pcdParticipants = buildingParticipants.filter(p => p.hasSpecialNeeds);
    const uniqueSpotParticipants = buildingParticipants.filter(p => !p.hasSpecialNeeds && (p.numberOfSpots || 1) === 1 && !p.prefersLinkedSpot);
    const doubleSpotParticipants = buildingParticipants.filter(p => !p.hasSpecialNeeds && ((p.numberOfSpots || 1) > 1 || p.prefersLinkedSpot));
    const defaulters = buildingParticipants.filter(p => !p.isUpToDate);

    const pcdSpots = buildingSpots.filter(isSpotPcD);
    const normalSpots = buildingSpots.filter(s => !isSpotPcD(s));

    // Contagem dinâmica por setor
    const sectorCounts: Record<string, number> = {};
    usedSectors.forEach(sector => {
      sectorCounts[sector] = buildingSpots.filter(s => getSpotSector(s) === sector).length;
    });

    return {
      total: buildingParticipants.length,
      pcd: pcdParticipants.length,
      unique: uniqueSpotParticipants.length,
      double: doubleSpotParticipants.length,
      defaulters: defaulters.length,
      totalSpots: buildingSpots.length,
      pcdSpots: pcdSpots.length,
      normalSpots: normalSpots.length,
      sectorCounts,
    };
  }, [buildingParticipants, buildingSpots, usedSectors]);

  // Função para aguardar escolha manual do PcD
  const waitForPcdManualSelection = (participant: Participant, availableSpots: ParkingSpot[]): Promise<string | null> => {
    return new Promise((resolve) => {
      setCurrentPcdParticipant(participant);
      setAvailableSpotsForPcd(availableSpots);
      setSelectedPcdSpot(null);
      setPcdSelectionResolve(() => resolve);
      setIsPcdManualSelectionOpen(true);
    });
  };

  // Confirmar seleção manual do PcD
  const handleConfirmPcdSelection = () => {
    if (selectedPcdSpot && pcdSelectionResolve) {
      pcdSelectionResolve(selectedPcdSpot);
      setIsPcdManualSelectionOpen(false);
      setCurrentPcdParticipant(null);
      setSelectedPcdSpot(null);
      setPcdSelectionResolve(null);
    }
  };

  // Pular PcD (não atribuir vaga)
  const handleSkipPcdSelection = () => {
    if (pcdSelectionResolve) {
      pcdSelectionResolve(null);
      setIsPcdManualSelectionOpen(false);
      setCurrentPcdParticipant(null);
      setSelectedPcdSpot(null);
      setPcdSelectionResolve(null);
    }
  };

  const runSectorLottery = async () => {
    setIsRunning(true);
    setProgress(0);
    setResults([]);
    setShowResults(false);
    setCurrentStep('Iniciando sorteio setorial...');

    const newResults: LotteryResult[] = [];
    const assignedParticipantIds = new Set<string>();
    const assignedSpotIds = new Set<string>();
    const availableSpots = [...buildingSpots];

    const createResult = (participant: Participant, spot: ParkingSpot, phase: string): LotteryResult => {
      return {
        id: `result-${Date.now()}-${phase}-${participant.id}-${spot.id}`,
        participantId: participant.id,
        parkingSpotId: spot.id,
        timestamp: new Date(),
        priority: getPriorityLevel(participant),
        participantSnapshot: {
          name: participant.name,
          block: participant.block,
          unit: participant.unit,
        },
        spotSnapshot: {
          number: spot.number,
          floor: spot.floor,
          type: Array.isArray(spot.type) ? spot.type : [spot.type],
          size: spot.size,
          isCovered: spot.isCovered,
          isUncovered: spot.isUncovered,
        },
      };
    };

    const assignSpot = (participant: Participant, spot: ParkingSpot, phase: string) => {
      const result = createResult(participant, spot, phase);
      newResults.push(result);
      assignedSpotIds.add(spot.id);

      const spotIndex = availableSpots.findIndex(s => s.id === spot.id);
      if (spotIndex > -1) {
        availableSpots.splice(spotIndex, 1);
      }

      console.log(`   ✅ ${phase}: ${participant.name} (${participant.block}/${participant.unit}) → Vaga ${spot.number}`);
    };

    const shuffleArray = <T,>(array: T[]): T[] => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    /** Ordena participantes por prioridade, sorteando dentro de cada subgrupo */
    const sortByPriorityWithShuffle = (participants: Participant[]): Participant[] => {
      const pcd = shuffleArray(participants.filter(p => p.hasSpecialNeeds && !isDefaulter(p)));
      const elderly = shuffleArray(participants.filter(p => p.isElderly && !p.hasSpecialNeeds && !isDefaulter(p)));
      const normal = shuffleArray(participants.filter(p => !p.hasSpecialNeeds && !p.isElderly && !isDefaulter(p)));
      const defaulters = shuffleArray(participants.filter(p => isDefaulter(p)));
      return [...pcd, ...elderly, ...normal, ...defaulters];
    };

    // Ordenar setores alfabeticamente
    const sortedSectors = [...usedSectors].sort();
    const totalSectors = sortedSectors.length;

    console.log('\n🏢 ========== SORTEIO SETORIAL (POR SETOR) ==========');
    console.log(`   📊 Setores: ${sortedSectors.join(', ')}`);
    console.log(`   👥 Total participantes: ${buildingParticipants.length}`);
    console.log(`   🅿️ Total vagas: ${buildingSpots.length}`);

    // ============ ETAPA 1: PcDs (escolha manual - antes dos setores) ============
    console.log('\n♿ PRÉ-ETAPA: PcDs COM ESCOLHA MANUAL');
    setCurrentStep('Pré-etapa: PcDs com escolha manual...');
    setProgress(5);

    const pcdParticipants = shuffleArray(
      buildingParticipants.filter(p => p.hasSpecialNeeds && !isDefaulter(p))
    );
    console.log(`   📊 PcDs encontrados: ${pcdParticipants.length}`);

    for (const participant of pcdParticipants) {
      const numberOfSpots = Math.max(1, participant.numberOfSpots || 1);

      for (let i = 0; i < numberOfSpots; i++) {
        // Primeiro tenta vaga PcD
        const availablePcdSpots = availableSpots.filter(s => isSpotPcD(s) && !assignedSpotIds.has(s.id));

        if (availablePcdSpots.length > 0) {
          const randomPcdSpot = availablePcdSpots[Math.floor(Math.random() * availablePcdSpots.length)];
          assignSpot(participant, randomPcdSpot, 'pcd-priority');
          console.log(`   ✅ PcD ${participant.name} recebeu vaga PcD ${randomPcdSpot.number}`);
        } else {
          console.log(`   ⚠️ Sem vagas PcD disponíveis. ${participant.name} vai ESCOLHER manualmente.`);

          const normalSpotsAvailable = availableSpots.filter(s => !isSpotPcD(s) && !assignedSpotIds.has(s.id));

          if (normalSpotsAvailable.length > 0) {
            const selectedSpotId = await waitForPcdManualSelection(participant, normalSpotsAvailable);

            if (selectedSpotId) {
              const selectedSpot = availableSpots.find(s => s.id === selectedSpotId);
              if (selectedSpot) {
                assignSpot(participant, selectedSpot, 'pcd-manual-selection');
                console.log(`   ✅ PcD ${participant.name} ESCOLHEU vaga ${selectedSpot.number}`);
              }
            } else {
              console.log(`   ⏭️ PcD ${participant.name} pulou a seleção`);
            }
          } else {
            console.log(`   ❌ Sem vagas disponíveis para ${participant.name}`);
          }
        }
      }

      const assignedCount = newResults.filter(r => r.participantId === participant.id).length;
      if (assignedCount >= numberOfSpots) {
        assignedParticipantIds.add(participant.id);
      }
    }

    await new Promise(r => setTimeout(r, 300));

    // ============ ETAPA 2: SORTEIO POR SETOR (A, B, C...) ============
    console.log('\n🏢 ETAPA PRINCIPAL: SORTEIO POR SETOR');

    for (let sIdx = 0; sIdx < sortedSectors.length; sIdx++) {
      const sector = sortedSectors[sIdx];
      const progressBase = 10 + ((sIdx / totalSectors) * 70);
      setProgress(Math.round(progressBase));
      setCurrentStep(`Sorteando ${sector}...`);

      console.log(`\n📍 ===== ${sector} =====`);

      // Participantes deste setor (que ainda não foram alocados)
      const sectorParticipants = buildingParticipants.filter(p =>
        !assignedParticipantIds.has(p.id) &&
        (p.sector === sector || (p.preferredSectors && p.preferredSectors[0] === sector && !p.sector))
      );

      // Vagas deste setor
      const sectorSpots = availableSpots.filter(s => getSpotSector(s) === sector && !assignedSpotIds.has(s.id));

      console.log(`   👥 Participantes no setor: ${sectorParticipants.length}`);
      console.log(`   🅿️ Vagas no setor: ${sectorSpots.length}`);

      // Ordenar: PcD > Idoso > Normal > Inadimplente (sorteio dentro de cada grupo)
      const orderedParticipants = sortByPriorityWithShuffle(sectorParticipants);

      for (const participant of orderedParticipants) {
        const numberOfSpots = Math.max(1, participant.numberOfSpots || 1);
        const alreadyAssigned = newResults.filter(r => r.participantId === participant.id).length;
        const needed = numberOfSpots - alreadyAssigned;

        for (let i = 0; i < needed; i++) {
          // Tentar vaga no próprio setor primeiro (strict)
          let eligible = filterSpotsForParticipant(
            availableSpots.filter(s => getSpotSector(s) === sector),
            participant, assignedSpotIds, true
          );

          // Se não encontrou strict, tentar relaxed no setor
          if (eligible.length === 0) {
            eligible = filterSpotsForParticipant(
              availableSpots.filter(s => getSpotSector(s) === sector),
              participant, assignedSpotIds, false
            );
          }

          // Se não encontrou no setor, tentar vagas sem setor
          if (eligible.length === 0) {
            eligible = filterSpotsForParticipant(
              availableSpots.filter(s => !getSpotSector(s)),
              participant, assignedSpotIds, false
            );
          }

          // Se não encontrou, transbordar para setores próximos
          if (eligible.length === 0) {
            const proximitySectors = selectedBuilding?.sectorProximity?.[sector]
              || config.sectorMapping[sector]
              || sortedSectors.filter(s => s !== sector);

            for (const proxSector of proximitySectors) {
              if (proxSector === sector) continue;
              eligible = filterSpotsForParticipant(
                availableSpots.filter(s => getSpotSector(s) === proxSector),
                participant, assignedSpotIds, false
              );
              if (eligible.length > 0) {
                console.log(`      ↗️ ${participant.name}: transbordou para ${proxSector}`);
                break;
              }
            }
          }

          // Última chance: qualquer vaga residual
          if (eligible.length === 0) {
            eligible = availableSpots.filter(s => {
              if (assignedSpotIds.has(s.id)) return false;
              if (participant.hasMotorcycle) return isSpotMotorcycle(s);
              return !isSpotMotorcycle(s) && !isSpotPcD(s);
            });
            if (eligible.length > 0) {
              console.log(`      ❗ ${participant.name}: alocado em vaga residual`);
            }
          }

          if (eligible.length > 0) {
            const spot = eligible[Math.floor(Math.random() * eligible.length)];
            assignSpot(participant, spot, `sector-${sector}`);
          } else {
            console.log(`   ❌ Sem vaga disponível para ${participant.name}`);
          }
        }

        const assignedCount = newResults.filter(r => r.participantId === participant.id).length;
        if (assignedCount >= numberOfSpots) {
          assignedParticipantIds.add(participant.id);
        }
      }

      await new Promise(r => setTimeout(r, 200));
    }

    // ============ ETAPA 3: Participantes sem setor definido ============
    console.log('\n🎲 ETAPA FINAL: PARTICIPANTES SEM SETOR');
    setCurrentStep('Alocando participantes sem setor...');
    setProgress(85);

    const noSectorParticipants = sortByPriorityWithShuffle(
      buildingParticipants.filter(p =>
        !assignedParticipantIds.has(p.id) &&
        !p.sector &&
        (!p.preferredSectors || p.preferredSectors.length === 0)
      )
    );
    console.log(`   📊 Sem setor definido: ${noSectorParticipants.length}`);

    for (const participant of noSectorParticipants) {
      const numberOfSpots = Math.max(1, participant.numberOfSpots || 1);
      const alreadyAssigned = newResults.filter(r => r.participantId === participant.id).length;
      const needed = numberOfSpots - alreadyAssigned;

      for (let i = 0; i < needed; i++) {
        const spot = findBestSpot(participant, availableSpots, assignedSpotIds, usedSectors);
        if (spot) assignSpot(participant, spot, 'no-sector');
      }

      const assignedCount = newResults.filter(r => r.participantId === participant.id).length;
      if (assignedCount >= numberOfSpots) {
        assignedParticipantIds.add(participant.id);
      }
    }

    // ============ FINALIZAÇÃO ============
    console.log('\n🎊 ========== SORTEIO SETORIAL FINALIZADO ==========');
    console.log(`   ✅ Total alocações: ${newResults.length}`);
    console.log(`   👥 Participantes atendidos: ${assignedParticipantIds.size}/${buildingParticipants.length}`);

    setProgress(100);
    setCurrentStep('Sorteio setorial concluído!');
    setResults(newResults);

    await new Promise(r => setTimeout(r, 500));

    setIsRunning(false);
    setShowResults(true);

    // Salvar sessão
    const sessionId = `sector-session-${Date.now()}`;
    const session: LotterySession = {
      id: sessionId,
      buildingId: selectedBuilding?.id || '',
      name: config.sessionName,
      date: new Date(),
      participants: buildingParticipants.map(p => p.id),
      availableSpots: buildingSpots.map(s => s.id),
      results: newResults,
      status: 'completed',
      settings: {
        allowSharedSpots: false,
        prioritizeElders: false,
        prioritizeSpecialNeeds: true,
        zoneByProximity: true,
      },
    };
    saveLotterySession(session);

    // Publicar resultados
    try {
      const result = await savePublicResults(
        session,
        selectedBuilding?.name || '',
        buildingParticipants,
        buildingSpots,
        selectedBuilding?.company
      );
      if (result?.success) {
        toast({
          title: "Sorteio setorial concluído e publicado",
          description: "Os resultados estão disponíveis publicamente.",
        });
      }
    } catch (error) {
      console.error('Erro ao publicar:', error);
    }

    toast({
      title: "Sorteio setorial concluído",
      description: `${newResults.length} vaga(s) sorteadas por setor.`,
    });
  };

  const handleNewLottery = () => {
    setResults([]);
    setShowResults(false);
    setProgress(0);
    setCurrentStep('');
    setSearchTerm('');
    toast({
      title: "Novo sorteio",
      description: "Sistema pronto para um novo sorteio setorial.",
    });
  };

  const handleGeneratePDF = () => {
    generateLotteryPDF(
      config.sessionName,
      results,
      buildingParticipants,
      buildingSpots,
      selectedBuilding?.company || 'exvagas',
      selectedBuilding?.name
    );
    toast({
      title: "Relatório gerado",
      description: "O arquivo PDF foi aberto em uma nova janela.",
    });
  };

  // Filtrar resultados pela busca
  const filteredResults = results.filter(result => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const snapshot = result.participantSnapshot;
    const spotSnapshot = result.spotSnapshot;

    return (
      snapshot?.name?.toLowerCase().includes(search) ||
      snapshot?.block?.toLowerCase().includes(search) ||
      snapshot?.unit?.toLowerCase().includes(search) ||
      spotSnapshot?.number?.toLowerCase().includes(search)
    );
  });

  if (!selectedBuilding) {
    return (
      <div className="p-6">
        <Card className="border-dashed">
          <CardContent className="pt-6 text-center">
            <Building className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Selecione um condomínio para usar o sorteio setorial.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
            <MapPin className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Sorteio por Setor</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Sorteio com regras de setor (A, B, C) e etapas específicas
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsConfigOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Configurar
          </Button>
          {showResults && (
            <>
              <Button variant="outline" onClick={handleGeneratePDF}>
                Gerar PDF
              </Button>
              <Button variant="outline" onClick={handleNewLottery}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Novo Sorteio
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5">
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Participantes</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5">
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.pcd}</div>
            <div className="text-xs text-muted-foreground">PcD</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5">
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.unique}</div>
            <div className="text-xs text-muted-foreground">Vaga Única</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5">
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.double}</div>
            <div className="text-xs text-muted-foreground">Vaga Dupla</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5">
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.defaulters}</div>
            <div className="text-xs text-muted-foreground">Inadimplentes</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-500/10 to-slate-600/5">
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-slate-600">{stats.totalSpots}</div>
            <div className="text-xs text-muted-foreground">Vagas Totais</div>
          </CardContent>
        </Card>
      </div>

      {/* Vagas por Setor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Vagas por Setor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`grid gap-3 sm:gap-4 ${usedSectors.length <= 3 ? 'grid-cols-2 sm:grid-cols-3' : usedSectors.length <= 5 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
            {usedSectors.map((sector, idx) => {
              const colors = ['amber', 'emerald', 'sky', 'purple', 'rose', 'teal', 'indigo', 'orange', 'cyan', 'violet'];
              const color = colors[idx % colors.length];
              return (
                <div key={sector} className={`text-center p-4 bg-${color}-500/10 rounded-lg`}>
                  <div className={`text-3xl font-bold text-${color}-600`}>{stats.sectorCounts[sector] || 0}</div>
                  <div className="text-sm text-muted-foreground">{sector}</div>
                </div>
              );
            })}
          </div>
          {usedSectors.length === 0 && (
            <p className="text-sm text-muted-foreground text-center italic">
              Nenhum setor configurado nas vagas.
            </p>
          )}
          <div className="mt-4 text-center">
            <Badge variant="outline" className="mr-2">PcD: {stats.pcdSpots}</Badge>
            <Badge variant="outline">Normal: {stats.normalSpots}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Botão de Sorteio ou Progresso */}
      {!showResults && (
        <Card className="border-2 border-dashed border-amber-500/50 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
          <CardContent className="pt-6 text-center">
            {isRunning ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <div className="h-8 w-8 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                  <span className="text-lg font-medium">{currentStep}</span>
                </div>
                <Progress value={progress} className="h-3" />
                <p className="text-sm text-muted-foreground">{Math.round(progress)}% concluído</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-6xl">🎯</div>
                <h3 className="text-xl font-semibold">Sorteio Setorial</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Este sorteio segue 6 etapas: PcDs → Idosos → Vaga Única (por setor) → Vaga Dupla → Restantes → Inadimplentes
                </p>
                <Button
                  size="lg"
                  onClick={runSectorLottery}
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                  disabled={buildingParticipants.length === 0 || buildingSpots.length === 0}
                >
                  <Play className="h-5 w-5 mr-2" />
                  Iniciar Sorteio Setorial
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Resultados */}
      {showResults && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                <CardTitle>Resultados do Sorteio Setorial</CardTitle>
              </div>
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                {results.length} alocações
              </Badge>
            </div>
            <CardDescription>
              <Input
                placeholder="Buscar por bloco, unidade ou vaga..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm mt-2"
              />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            <ScrollArea className="h-[500px]">
              <div className="min-w-[800px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Participante</TableHead>
                    <TableHead>Bloco/Unidade</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Pref. Setores</TableHead>
                    <TableHead>Vaga Sorteada</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Tipo da Vaga</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredResults.map((result, index) => {
                    const spot = parkingSpots.find(s => s.id === result.parkingSpotId);
                    const participant = buildingParticipants.find(p => p.id === result.participantId);
                    const spotSector = spot?.sector || '-';

                    // Priority badge (inadimplente mostra como Normal)
                    const priorityLabel = result.priority === 'special-needs' ? 'PcD' 
                      : result.priority === 'elderly' ? 'Idoso' 
                      : 'Normal';
                    const priorityColor = result.priority === 'special-needs' ? 'bg-purple-500/20 text-purple-700 border-purple-300' 
                      : result.priority === 'elderly' ? 'bg-sky-400/20 text-sky-700 border-sky-300' 
                      : 'bg-green-500/20 text-green-700 border-green-300';

                    // Spot type color mapping
                    const getTypeColor = (type: string) => {
                      if (type.includes('PcD')) return 'bg-purple-500/20 text-purple-700 border-purple-300';
                      if (type.includes('Idoso')) return 'bg-sky-400/20 text-sky-700 border-sky-300';
                      if (type.includes('Motocicleta')) return 'bg-amber-800/20 text-amber-900 border-amber-700';
                      if (type.includes('Presa')) return 'bg-red-500/20 text-red-700 border-red-300';
                      if (type.includes('Livre')) return 'bg-green-500/20 text-green-700 border-green-300';
                      if (type.includes('Grande')) return 'bg-gray-900/20 text-gray-900 border-gray-700';
                      if (type.includes('Pequena')) return 'bg-yellow-500/20 text-yellow-700 border-yellow-400';
                      if (type.includes('Coberta')) return 'bg-blue-700/20 text-blue-800 border-blue-500';
                      if (type.includes('Descoberta')) return 'bg-orange-500/20 text-orange-700 border-orange-300';
                      if (type.includes('Comum')) return 'bg-gray-500/20 text-gray-700 border-gray-300';
                      return 'bg-gray-500/20 text-gray-700 border-gray-300';
                    };

                    return (
                      <TableRow key={result.id}>
                        <TableCell className="font-bold text-amber-600">{index + 1}º</TableCell>
                        <TableCell className="font-medium">{result.participantSnapshot?.name || '-'}</TableCell>
                        <TableCell>
                          <span className="font-medium">{result.participantSnapshot?.block}</span>
                          {' / '}
                          <span>{result.participantSnapshot?.unit}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-0.5">
                            {priorityLabel !== 'Normal' && (
                              <Badge variant="outline" className={`text-[10px] ${priorityColor}`}>
                                {priorityLabel}
                              </Badge>
                            )}
                            {participant?.hasSmallCar && (
                              <Badge variant="outline" className="text-[10px] bg-yellow-500/20 text-yellow-700 border-yellow-400">
                                Veículo Pequeno
                              </Badge>
                            )}
                            {participant?.hasLargeCar && (
                              <Badge variant="outline" className="text-[10px] bg-gray-900/20 text-gray-900 border-gray-700">
                                Veículo Grande
                              </Badge>
                            )}
                            {participant?.hasMotorcycle && (
                              <Badge variant="outline" className="text-[10px] bg-amber-800/20 text-amber-900 border-amber-700">
                                Motocicleta
                              </Badge>
                            )}
                            {participant?.prefersCommonSpot && (
                              <Badge variant="outline" className="text-[10px] bg-gray-500/20 text-gray-700 border-gray-300">
                                Pref. Vaga Comum
                              </Badge>
                            )}
                            {participant?.prefersCovered && (
                              <Badge variant="outline" className="text-[10px] bg-blue-700/20 text-blue-800 border-blue-500">
                                Pref. Vaga Coberta
                              </Badge>
                            )}
                            {participant?.prefersUncovered && (
                              <Badge variant="outline" className="text-[10px] bg-orange-500/20 text-orange-700 border-orange-300">
                                Pref. Vaga Descoberta
                              </Badge>
                            )}
                            {participant?.prefersUnlinkedSpot && (
                              <Badge variant="outline" className="text-[10px] bg-green-500/20 text-green-700 border-green-300">
                                Pref. Vaga Livre
                              </Badge>
                            )}
                            {participant?.prefersLinkedSpot && (
                              <Badge variant="outline" className="text-[10px] bg-red-500/20 text-red-700 border-red-300">
                                Pref. Vaga Presa
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {participant?.preferredSectors && participant.preferredSectors.length > 0 ? (
                            <div className="flex flex-wrap gap-0.5">
                              {participant.preferredSectors.map((s, i) => (
                                <Badge key={s} variant="outline" className="text-[10px] bg-white">
                                  {i + 1}° {s.replace('Setor ', '')}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <Badge variant="outline" className="font-mono">
                              {result.spotSnapshot?.number || '-'}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground mt-0.5">
                              {result.spotSnapshot?.floor || ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {spotSector}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              const types = result.spotSnapshot?.type || [];
                              const hasCoverage = types.some(t => t.includes('Coberta') || t.includes('Descoberta')) 
                                || result.spotSnapshot?.isCovered || result.spotSnapshot?.isUncovered;
                              const filteredTypes = hasCoverage 
                                ? types.filter(t => !t.includes('Comum'))
                                : types;
                              
                              const badges: { label: string; color: string }[] = [];
                              
                              // Add coverage from snapshot flags if not already in types
                              if (result.spotSnapshot?.isCovered && !types.some(t => t.includes('Coberta'))) {
                                badges.push({ label: 'Vaga Coberta', color: getTypeColor('Coberta') });
                              }
                              if (result.spotSnapshot?.isUncovered && !types.some(t => t.includes('Descoberta'))) {
                                badges.push({ label: 'Vaga Descoberta', color: getTypeColor('Descoberta') });
                              }
                              
                              filteredTypes.forEach(t => {
                                badges.push({ label: t, color: getTypeColor(t) });
                              });
                              
                              return badges.map((b, i) => (
                                <Badge key={i} variant="outline" className={`text-[10px] ${b.color}`}>
                                  {b.label}
                                </Badge>
                              ));
                            })()}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* MODAL DE ESCOLHA MANUAL DO PcD */}
      <Dialog open={isPcdManualSelectionOpen} onOpenChange={setIsPcdManualSelectionOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-600" />
              Escolha Manual de Vaga - PcD
            </DialogTitle>
            <DialogDescription>
              Não há mais vagas PcD disponíveis. O participante pode escolher qualquer vaga.
            </DialogDescription>
          </DialogHeader>

          {currentPcdParticipant && (
            <div className="space-y-6">
              {/* Info do Participante */}
              <Card className="bg-purple-500/10 border-purple-500/30">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                      <Users className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <div className="text-xl font-bold">{currentPcdParticipant.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Bloco {currentPcdParticipant.block} - Unidade {currentPcdParticipant.unit}
                      </div>
                      <Badge variant="pcd" className="mt-1">PcD</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Vagas Disponíveis */}
              <div>
                <Label className="text-base font-medium mb-3 block">
                  Vagas Disponíveis ({availableSpotsForPcd.length})
                </Label>
                <ScrollArea className="h-[400px] border rounded-lg p-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {availableSpotsForPcd
                      .sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }))
                      .map((spot) => {
                        const isSelected = selectedPcdSpot === spot.id;
                        const sector = getSpotSector(spot);

                        return (
                          <div
                            key={spot.id}
                            onClick={() => setSelectedPcdSpot(spot.id)}
                            className={`p-4 border-2 rounded-lg cursor-pointer transition-all hover:scale-105 ${isSelected
                                ? 'border-purple-500 bg-purple-500/20 shadow-lg'
                                : 'border-muted hover:border-purple-500/50'
                              }`}
                          >
                            <div className="flex flex-col items-center space-y-2">
                              <div className={`font-bold text-xl ${isSelected ? 'text-purple-600' : ''}`}>
                                {spot.number}
                              </div>
                              <div className="text-xs text-muted-foreground text-center">
                                {spot.floor}
                              </div>
                              <div className="flex flex-wrap gap-1 justify-center">
                                {sector && (
                                  <Badge
                                    variant="outline"
                                    className={
                                      sector === 'A' ? 'bg-amber-500/10 text-amber-600' :
                                        sector === 'B' ? 'bg-emerald-500/10 text-emerald-600' :
                                          'bg-sky-500/10 text-sky-600'
                                    }
                                  >
                                    Setor {sector}
                                  </Badge>
                                )}
                                {spot.isCovered && (
                                  <Badge variant="covered" className="text-xs">Coberta</Badge>
                                )}
                                {spot.isUncovered && (
                                  <Badge variant="uncovered" className="text-xs">Descoberta</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </ScrollArea>
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSkipPcdSelection}
                >
                  Pular (Não atribuir vaga)
                </Button>
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  onClick={handleConfirmPcdSelection}
                  disabled={!selectedPcdSpot}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Confirmar Vaga Selecionada
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Configuração */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurações do Sorteio Setorial</DialogTitle>
            <DialogDescription>
              Configure o mapeamento de setores e preferências
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome da Sessão</Label>
              <Input
                value={config.sessionName}
                onChange={(e) => setConfig({ ...config, sessionName: e.target.value })}
              />
            </div>

            <div className="space-y-3">
              <Label>Mapeamento de Setores (Ordem de Proximidade)</Label>
              <p className="text-xs text-muted-foreground">
                Define a ordem de prioridade dos setores para cada setor. Se o setor designado lotou, o sistema tenta os próximos na ordem.
              </p>

              {usedSectors.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Nenhum setor configurado. Cadastre setores nos participantes e vagas primeiro.
                </p>
              ) : (
                usedSectors.map((sector) => (
                  <div key={sector} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                    <span className="font-medium w-24">{sector}:</span>
                    <span className="text-sm text-muted-foreground">
                      {(config.sectorMapping[sector] || [sector]).join(' → ')}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t">
              <h4 className="font-medium mb-2">Etapas do Sorteio:</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>PcDs → Vagas PcD (PcD ESCOLHE se acabar vagas PcD)</li>
                <li>Vaga Única → Sorteia dentro do setor do bloco</li>
                <li>Vaga Dupla → Sorteia dentro do setor correspondente</li>
                <li>Aleatório → Restantes não inadimplentes</li>
                <li>Inadimplentes → Por último, vagas restantes</li>
              </ol>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsConfigOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};