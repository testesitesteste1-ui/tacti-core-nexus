import { useState, useMemo } from 'react';
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
import { Participant, ParkingSpot, LotteryResult, LotterySession } from '@/types/lottery';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { generateLotteryPDF } from '@/utils/pdfGenerator';
import { savePublicResults } from '@/utils/publicResults';

// Tipos específicos para o sorteio por setor
type SectorType = 'A' | 'B' | 'C';

interface SectorLotteryConfig {
  sessionName: string;
  sectorMapping: {
    A: SectorType[];
    B: SectorType[];
    C: SectorType[];
  };
}

export const SectorLotterySystem = () => {
  const {
    participants,
    parkingSpots,
    saveLotterySession,
    selectedBuilding
  } = useAppContext();

  const { toast } = useToast();

  const [isRunning, setIsRunning] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [results, setResults] = useState<LotteryResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Estados para escolha manual de PcD
  const [isPcdManualSelectionOpen, setIsPcdManualSelectionOpen] = useState(false);
  const [currentPcdParticipant, setCurrentPcdParticipant] = useState<Participant | null>(null);
  const [availableSpotsForPcd, setAvailableSpotsForPcd] = useState<ParkingSpot[]>([]);
  const [selectedPcdSpot, setSelectedPcdSpot] = useState<string | null>(null);
  const [pcdSelectionResolve, setPcdSelectionResolve] = useState<((spotId: string | null) => void) | null>(null);

  // Configuração de mapeamento de setores
  const [config, setConfig] = useState<SectorLotteryConfig>({
    sessionName: `Sorteio Setorial ${new Date().toLocaleDateString('pt-BR')}`,
    sectorMapping: {
      A: ['A', 'B', 'C'],
      B: ['B', 'A', 'C'],
      C: ['C', 'B', 'A'],
    }
  });

  // Participantes e vagas do condomínio selecionado
  const buildingParticipants = useMemo(() =>
    participants.filter(p => p.buildingId === selectedBuilding?.id),
    [participants, selectedBuilding?.id]
  );

  const buildingSpots = useMemo(() =>
    parkingSpots.filter(s => s.buildingId === selectedBuilding?.id && s.status === 'available'),
    [parkingSpots, selectedBuilding?.id]
  );

  // Extrair setor do número da vaga (ex: "A-001" -> "A")
  const getSpotSector = (spot: ParkingSpot): SectorType | null => {
    const number = spot.number.toUpperCase();
    if (number.startsWith('A')) return 'A';
    if (number.startsWith('B')) return 'B';
    if (number.startsWith('C')) return 'C';
    return null;
  };

  // Extrair bloco do participante (normalizado para A, B ou C)
  const getParticipantSector = (participant: Participant): SectorType | null => {
    const block = participant.block.toUpperCase().trim();
    if (block.includes('A') || block === '1' || block === 'BLOCO A' || block === 'BL A') return 'A';
    if (block.includes('B') || block === '2' || block === 'BLOCO B' || block === 'BL B') return 'B';
    if (block.includes('C') || block === '3' || block === 'BLOCO C' || block === 'BL C') return 'C';
    return null;
  };

  // Verificar se a vaga é PcD
  const isSpotPcD = (spot: ParkingSpot): boolean => {
    const types = Array.isArray(spot.type) ? spot.type : [spot.type];
    return types.includes('Vaga PcD');
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

  // Estatísticas
  const stats = useMemo(() => {
    const pcdParticipants = buildingParticipants.filter(p => p.hasSpecialNeeds);
    const uniqueSpotParticipants = buildingParticipants.filter(p => !p.hasSpecialNeeds && (p.numberOfSpots || 1) === 1 && !p.prefersLinkedSpot);
    const doubleSpotParticipants = buildingParticipants.filter(p => !p.hasSpecialNeeds && ((p.numberOfSpots || 1) > 1 || p.prefersLinkedSpot));
    const defaulters = buildingParticipants.filter(p => !p.isUpToDate);

    const pcdSpots = buildingSpots.filter(isSpotPcD);
    const normalSpots = buildingSpots.filter(s => !isSpotPcD(s));

    const sectorASpots = buildingSpots.filter(s => getSpotSector(s) === 'A');
    const sectorBSpots = buildingSpots.filter(s => getSpotSector(s) === 'B');
    const sectorCSpots = buildingSpots.filter(s => getSpotSector(s) === 'C');

    return {
      total: buildingParticipants.length,
      pcd: pcdParticipants.length,
      unique: uniqueSpotParticipants.length,
      double: doubleSpotParticipants.length,
      defaulters: defaulters.length,
      totalSpots: buildingSpots.length,
      pcdSpots: pcdSpots.length,
      normalSpots: normalSpots.length,
      sectorA: sectorASpots.length,
      sectorB: sectorBSpots.length,
      sectorC: sectorCSpots.length,
    };
  }, [buildingParticipants, buildingSpots]);

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

    // ============ ETAPA 1: PcDs ============
    console.log('\n♿ ETAPA 1: SORTEIO PcD');
    setCurrentStep('Etapa 1: Sorteando PcDs...');
    setProgress(10);

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
          // Sorteia entre vagas PcD disponíveis
          const randomPcdSpot = availablePcdSpots[Math.floor(Math.random() * availablePcdSpots.length)];
          assignSpot(participant, randomPcdSpot, 'pcd-priority');
          console.log(`   ✅ PcD ${participant.name} recebeu vaga PcD ${randomPcdSpot.number}`);
        } else {
          // 🚨 AQUI: Se não há vaga PcD, PcD ESCOLHE MANUALMENTE
          console.log(`   ⚠️ Sem vagas PcD disponíveis. ${participant.name} vai ESCOLHER manualmente.`);

          const normalSpotsAvailable = availableSpots.filter(s => !isSpotPcD(s) && !assignedSpotIds.has(s.id));

          if (normalSpotsAvailable.length > 0) {
            // Pausar sorteio e abrir modal para escolha manual
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

    // ============ ETAPA 2: Vaga Única (por setor) ============
    console.log('\n🎯 ETAPA 2: SORTEIO VAGA ÚNICA (POR SETOR)');
    setCurrentStep('Etapa 2: Sorteando vagas únicas por setor...');
    setProgress(30);

    const uniqueParticipants = shuffleArray(
      buildingParticipants.filter(p =>
        !assignedParticipantIds.has(p.id) &&
        !p.hasSpecialNeeds &&
        (p.numberOfSpots || 1) === 1 &&
        !p.prefersLinkedSpot &&
        !isDefaulter(p)
      )
    );
    console.log(`   📊 Participantes vaga única: ${uniqueParticipants.length}`);

    for (const participant of uniqueParticipants) {
      const participantSector = getParticipantSector(participant);
      const sectorPriority = participantSector ? config.sectorMapping[participantSector] : ['A', 'B', 'C'];

      console.log(`   👤 ${participant.name} (Bloco ${participant.block}) - Prioridade setores: ${sectorPriority.join(' → ')}`);
      
      // ✅ NOVO: Determinar preferência estrita de coberta/descoberta
      const wantsCovered = participant.prefersCovered && !participant.prefersUncovered;
      const wantsUncovered = participant.prefersUncovered && !participant.prefersCovered;
      console.log(`      🏠 Preferência cobertura: ${wantsCovered ? 'COBERTA' : wantsUncovered ? 'DESCOBERTA' : 'sem preferência'}`);

      let spotFound = false;

      for (const sector of sectorPriority) {
        // Passo 1: Filtrar vagas do setor
        let sectorSpots = availableSpots.filter(s =>
          !assignedSpotIds.has(s.id) &&
          !isSpotPcD(s) &&
          getSpotSector(s) === sector
        );

        // ✅ NOVO: Aplicar filtro de coberta/descoberta PRIMEIRO (estrito)
        if (wantsCovered) {
          const coveredSpots = sectorSpots.filter(s => s.isCovered === true);
          if (coveredSpots.length > 0) {
            sectorSpots = coveredSpots;
            console.log(`      🏠 Filtrado para vagas COBERTAS: ${coveredSpots.length} disponíveis`);
          } else {
            console.log(`      ⚠️ SEM vagas COBERTAS no setor ${sector}, tentando próximo setor...`);
            continue; // Tentar próximo setor
          }
        } else if (wantsUncovered) {
          const uncoveredSpots = sectorSpots.filter(s => s.isUncovered === true || s.isCovered === false);
          if (uncoveredSpots.length > 0) {
            sectorSpots = uncoveredSpots;
            console.log(`      ☀️ Filtrado para vagas DESCOBERTAS: ${uncoveredSpots.length} disponíveis`);
          } else {
            console.log(`      ⚠️ SEM vagas DESCOBERTAS no setor ${sector}, tentando próximo setor...`);
            continue; // Tentar próximo setor
          }
        }

        // Passo 2: Filtrar por andares preferidos
        if (participant.preferredFloors && participant.preferredFloors.length > 0) {
          const spotsInPreferredFloors = sectorSpots.filter(s =>
            participant.preferredFloors!.includes(s.floor)
          );
          if (spotsInPreferredFloors.length > 0) {
            sectorSpots = spotsInPreferredFloors;
            console.log(`      📍 Filtrado para andares preferidos: ${participant.preferredFloors.join(', ')}`);
          } else {
            console.log(`      ⚠️ Sem vagas nos andares preferidos (${participant.preferredFloors.join(', ')}), usando qualquer andar do setor`);
          }
        }

        if (sectorSpots.length > 0) {
          const randomSpot = sectorSpots[Math.floor(Math.random() * sectorSpots.length)];
          assignSpot(participant, randomSpot, `unique-sector-${sector}`);
          assignedParticipantIds.add(participant.id);
          spotFound = true;
          break;
        }
      }

      // ✅ FALLBACK: Se não achou em nenhum setor COM a preferência de cobertura, relaxar
      if (!spotFound && (wantsCovered || wantsUncovered)) {
        console.log(`      🔄 Relaxando preferência de cobertura para ${participant.name}...`);
        
        for (const sector of sectorPriority) {
          let sectorSpots = availableSpots.filter(s =>
            !assignedSpotIds.has(s.id) &&
            !isSpotPcD(s) &&
            getSpotSector(s) === sector
          );
          
          if (participant.preferredFloors && participant.preferredFloors.length > 0) {
            const spotsInPreferredFloors = sectorSpots.filter(s =>
              participant.preferredFloors!.includes(s.floor)
            );
            if (spotsInPreferredFloors.length > 0) {
              sectorSpots = spotsInPreferredFloors;
            }
          }

          if (sectorSpots.length > 0) {
            const randomSpot = sectorSpots[Math.floor(Math.random() * sectorSpots.length)];
            assignSpot(participant, randomSpot, `unique-sector-${sector}-relaxed`);
            assignedParticipantIds.add(participant.id);
            spotFound = true;
            console.log(`      ⚠️ ${participant.name} alocado SEM respeitar preferência de cobertura (não havia disponível)`);
            break;
          }
        }
      }

      if (!spotFound) {
        const anySpot = availableSpots.find(s => !assignedSpotIds.has(s.id) && !isSpotPcD(s));
        if (anySpot) {
          assignSpot(participant, anySpot, 'unique-any');
          assignedParticipantIds.add(participant.id);
        }
      }
    }

    await new Promise(r => setTimeout(r, 300));

    // ============ ETAPA 3: Vaga Dupla ============
    console.log('\n🚗🚗 ETAPA 3: SORTEIO VAGA DUPLA');
    setCurrentStep('Etapa 3: Sorteando vagas duplas...');
    setProgress(50);

    const doubleParticipants = shuffleArray(
      buildingParticipants.filter(p =>
        !assignedParticipantIds.has(p.id) &&
        !p.hasSpecialNeeds &&
        ((p.numberOfSpots || 1) > 1 || p.prefersLinkedSpot) &&
        !isDefaulter(p)
      )
    );
    console.log(`   📊 Participantes vaga dupla: ${doubleParticipants.length}`);

    for (const participant of doubleParticipants) {
      const numberOfSpots = Math.max(2, participant.numberOfSpots || 2);
      const participantSector = getParticipantSector(participant);
      const sectorPriority = participantSector ? config.sectorMapping[participantSector] : ['A', 'B', 'C'];

      // ✅ NOVO: Determinar preferência estrita de coberta/descoberta
      const wantsCovered = participant.prefersCovered && !participant.prefersUncovered;
      const wantsUncovered = participant.prefersUncovered && !participant.prefersCovered;

      console.log(`   👤 ${participant.name} - Precisa de ${numberOfSpots} vagas - Cobertura: ${wantsCovered ? 'COBERTA' : wantsUncovered ? 'DESCOBERTA' : 'sem preferência'}`);

      for (let i = 0; i < numberOfSpots; i++) {
        let spotFound = false;

        for (const sector of sectorPriority) {
          let sectorSpots = availableSpots.filter(s =>
            !assignedSpotIds.has(s.id) &&
            !isSpotPcD(s) &&
            getSpotSector(s) === sector
          );

          // ✅ NOVO: Aplicar filtro de cobertura PRIMEIRO
          if (wantsCovered) {
            const coveredSpots = sectorSpots.filter(s => s.isCovered === true);
            if (coveredSpots.length > 0) {
              sectorSpots = coveredSpots;
            } else {
              continue; // Tentar próximo setor
            }
          } else if (wantsUncovered) {
            const uncoveredSpots = sectorSpots.filter(s => s.isUncovered === true || s.isCovered === false);
            if (uncoveredSpots.length > 0) {
              sectorSpots = uncoveredSpots;
            } else {
              continue; // Tentar próximo setor
            }
          }

          // Filtrar por andares preferidos
          if (participant.preferredFloors && participant.preferredFloors.length > 0) {
            const spotsInPreferredFloors = sectorSpots.filter(s =>
              participant.preferredFloors!.includes(s.floor)
            );
            if (spotsInPreferredFloors.length > 0) {
              sectorSpots = spotsInPreferredFloors;
            }
          }

          if (sectorSpots.length > 0) {
            const randomSpot = sectorSpots[Math.floor(Math.random() * sectorSpots.length)];
            assignSpot(participant, randomSpot, `double-sector-${sector}`);
            spotFound = true;
            break;
          }
        }

        // ✅ FALLBACK: Se não achou COM preferência de cobertura, relaxar
        if (!spotFound && (wantsCovered || wantsUncovered)) {
          for (const sector of sectorPriority) {
            let sectorSpots = availableSpots.filter(s =>
              !assignedSpotIds.has(s.id) &&
              !isSpotPcD(s) &&
              getSpotSector(s) === sector
            );

            if (participant.preferredFloors && participant.preferredFloors.length > 0) {
              const spotsInPreferredFloors = sectorSpots.filter(s =>
                participant.preferredFloors!.includes(s.floor)
              );
              if (spotsInPreferredFloors.length > 0) {
                sectorSpots = spotsInPreferredFloors;
              }
            }

            if (sectorSpots.length > 0) {
              const randomSpot = sectorSpots[Math.floor(Math.random() * sectorSpots.length)];
              assignSpot(participant, randomSpot, `double-sector-${sector}-relaxed`);
              spotFound = true;
              console.log(`      ⚠️ Vaga alocada SEM respeitar preferência de cobertura`);
              break;
            }
          }
        }

        if (!spotFound) {
          const anySpot = availableSpots.find(s => !assignedSpotIds.has(s.id) && !isSpotPcD(s));
          if (anySpot) {
            assignSpot(participant, anySpot, 'double-any');
          }
        }
      }

      const assignedCount = newResults.filter(r => r.participantId === participant.id).length;
      if (assignedCount >= numberOfSpots) {
        assignedParticipantIds.add(participant.id);
      }
    }

    await new Promise(r => setTimeout(r, 300));

    // ============ ETAPA 4: Aleatório (restantes sem inadimplentes) ============
    console.log('\n🎲 ETAPA 4: SORTEIO ALEATÓRIO');
    setCurrentStep('Etapa 4: Sorteando restantes...');
    setProgress(70);

    const remainingParticipants = shuffleArray(
      buildingParticipants.filter(p =>
        !assignedParticipantIds.has(p.id) &&
        !isDefaulter(p)
      )
    );
    console.log(`   📊 Participantes restantes (não inadimplentes): ${remainingParticipants.length}`);

    for (const participant of remainingParticipants) {
      const numberOfSpots = Math.max(1, participant.numberOfSpots || 1);
      const alreadyAssigned = newResults.filter(r => r.participantId === participant.id).length;
      const needed = numberOfSpots - alreadyAssigned;

      // ✅ NOVO: Determinar preferência estrita de coberta/descoberta
      const wantsCovered = participant.prefersCovered && !participant.prefersUncovered;
      const wantsUncovered = participant.prefersUncovered && !participant.prefersCovered;
      console.log(`   👤 ${participant.name} - Cobertura: ${wantsCovered ? 'COBERTA' : wantsUncovered ? 'DESCOBERTA' : 'sem preferência'}`);

      for (let i = 0; i < needed; i++) {
        let eligibleSpots = availableSpots.filter(s => !assignedSpotIds.has(s.id));
        
        // ✅ NOVO: Aplicar filtro de cobertura PRIMEIRO
        if (wantsCovered) {
          const coveredSpots = eligibleSpots.filter(s => s.isCovered === true);
          if (coveredSpots.length > 0) {
            eligibleSpots = coveredSpots;
            console.log(`      🏠 Usando vagas COBERTAS: ${coveredSpots.length} disponíveis`);
          } else {
            console.log(`      ⚠️ SEM vagas COBERTAS disponíveis`);
          }
        } else if (wantsUncovered) {
          const uncoveredSpots = eligibleSpots.filter(s => s.isUncovered === true || s.isCovered === false);
          if (uncoveredSpots.length > 0) {
            eligibleSpots = uncoveredSpots;
            console.log(`      ☀️ Usando vagas DESCOBERTAS: ${uncoveredSpots.length} disponíveis`);
          } else {
            console.log(`      ⚠️ SEM vagas DESCOBERTAS disponíveis`);
          }
        }
        
        // Filtrar por andares preferidos
        if (participant.preferredFloors && participant.preferredFloors.length > 0) {
          const spotsInPreferredFloors = eligibleSpots.filter(s =>
            participant.preferredFloors!.includes(s.floor)
          );
          if (spotsInPreferredFloors.length > 0) {
            eligibleSpots = spotsInPreferredFloors;
          }
        }

        const selectedSpot = eligibleSpots[Math.floor(Math.random() * eligibleSpots.length)];
        if (selectedSpot) {
          assignSpot(participant, selectedSpot, 'random');
        }
      }

      const assignedCount = newResults.filter(r => r.participantId === participant.id).length;
      if (assignedCount >= numberOfSpots) {
        assignedParticipantIds.add(participant.id);
      }
    }

    await new Promise(r => setTimeout(r, 300));

    // ============ ETAPA 5: Inadimplentes (últimos) ============
    console.log('\n⚠️ ETAPA 5: SORTEIO INADIMPLENTES');
    setCurrentStep('Etapa 5: Sorteando inadimplentes...');
    setProgress(90);

    const defaulterParticipants = shuffleArray(
      buildingParticipants.filter(p =>
        !assignedParticipantIds.has(p.id) &&
        isDefaulter(p)
      )
    );
    console.log(`   📊 Inadimplentes: ${defaulterParticipants.length}`);

    for (const participant of defaulterParticipants) {
      const numberOfSpots = Math.max(1, participant.numberOfSpots || 1);
      const alreadyAssigned = newResults.filter(r => r.participantId === participant.id).length;
      const needed = numberOfSpots - alreadyAssigned;

      for (let i = 0; i < needed; i++) {
        const anySpot = availableSpots.find(s => !assignedSpotIds.has(s.id));
        if (anySpot) {
          assignSpot(participant, anySpot, 'defaulter');
        }
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
      description: `${newResults.length} vaga(s) sorteadas em 5 etapas.`,
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
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-amber-500/10 rounded-lg">
              <div className="text-3xl font-bold text-amber-600">{stats.sectorA}</div>
              <div className="text-sm text-muted-foreground">Setor A</div>
            </div>
            <div className="text-center p-4 bg-emerald-500/10 rounded-lg">
              <div className="text-3xl font-bold text-emerald-600">{stats.sectorB}</div>
              <div className="text-sm text-muted-foreground">Setor B</div>
            </div>
            <div className="text-center p-4 bg-sky-500/10 rounded-lg">
              <div className="text-3xl font-bold text-sky-600">{stats.sectorC}</div>
              <div className="text-sm text-muted-foreground">Setor C</div>
            </div>
          </div>
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
                  Este sorteio segue 5 etapas: PcDs → Vaga Única (por setor) → Vaga Dupla → Aleatório → Inadimplentes
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
          <CardContent>
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Participante</TableHead>
                    <TableHead>Bloco/Unidade</TableHead>
                    <TableHead>Vaga</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredResults.map((result, index) => {
                    const spotSector = result.spotSnapshot?.number ?
                      result.spotSnapshot.number.charAt(0).toUpperCase() : '-';

                    return (
                      <TableRow key={result.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>{result.participantSnapshot?.name || '-'}</TableCell>
                        <TableCell>
                          <span className="font-medium">{result.participantSnapshot?.block}</span>
                          {' / '}
                          <span>{result.participantSnapshot?.unit}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {result.spotSnapshot?.number || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              spotSector === 'A' ? 'bg-amber-500/10 text-amber-600 border-amber-500' :
                                spotSector === 'B' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500' :
                                  spotSector === 'C' ? 'bg-sky-500/10 text-sky-600 border-sky-500' :
                                    ''
                            }
                          >
                            {spotSector}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {result.spotSnapshot?.type?.map((t, i) => (
                            <Badge key={i} variant="secondary" className="mr-1 text-xs">
                              {t}
                            </Badge>
                          ))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
              <Label>Mapeamento de Setores</Label>
              <p className="text-xs text-muted-foreground">
                Define a ordem de prioridade dos setores para cada bloco
              </p>

              {(['A', 'B', 'C'] as SectorType[]).map((block) => (
                <div key={block} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                  <span className="font-medium w-20">Bloco {block}:</span>
                  <span className="text-sm text-muted-foreground">
                    {config.sectorMapping[block].join(' → ')}
                  </span>
                </div>
              ))}
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