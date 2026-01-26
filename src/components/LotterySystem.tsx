import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Play, Settings, Users, Car, Trophy, Clock, AlertCircle, CheckCircle,
  ListOrdered, Building, RotateCcw, ParkingSquare
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Participant, ParkingSpot, LotteryResult, LotterySession, Priority } from '@/types/lottery';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { generateLotteryPDF } from '@/utils/pdfGenerator';
import { savePublicResults } from '@/utils/publicResults';

// ============================================================================
// 🎲 FUNÇÃO DE EMBARALHAMENTO (Fisher-Yates Shuffle)
// ============================================================================
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Adiciona timestamp para garantir aleatoriedade entre execuções
    const randomSeed = Math.random() + (Date.now() % 1000) / 1000000;
    const j = Math.floor(randomSeed * (i + 1)) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================================
// 🎯 HIERARQUIA DE PRIORIDADES (NÃO-NEGOCIÁVEL)
// ============================================================================
const PRIORITY = {
  PCD: 1,
  IDOSO: 2,
  VEICULO_GRANDE: 3,
  VAGA_PEQUENA: 4,
  VAGA_COBERTA: 5,
  VAGA_DESCOBERTA: 6,
  VAGA_PRESA: 7,
  VAGA_LIVRE: 8,
  MOTOCICLETA: 9,
  VAGA_COMUM: 10,     // ✅ MUDANÇA: Renomear para consistência
  INADIMPLENTE: 11,
} as const;

type PriorityValue = typeof PRIORITY[keyof typeof PRIORITY];

// ============================================================================
// 🔧 TIPOS ADICIONAIS
// ============================================================================
interface ParticipantWithFilters extends Participant {
  filters: PriorityValue[];
  mainPriority: PriorityValue;
}

interface SpotWithFilters extends ParkingSpot {
  filters: PriorityValue[];
}

interface Queue {
  [key: number]: ParticipantWithFilters[];
}

interface AllocationResult {
  participantId: string;
  spotId: string;
  usedFilters: PriorityValue[];
  relaxedFilters: PriorityValue[];
}

// ============================================================================
// 🛠️ FUNÇÕES AUXILIARES DE FILTROS
// ============================================================================
function extractParticipantFilters(participant: Participant): PriorityValue[] {
  const filters: PriorityValue[] = [];

  if (participant.hasSpecialNeeds) filters.push(PRIORITY.PCD);
  if (participant.isElderly) filters.push(PRIORITY.IDOSO);
  if (participant.hasLargeCar) filters.push(PRIORITY.VEICULO_GRANDE);

  // ✅ Adiciona filtro se tem carro pequeno OU prefere vaga pequena
  if (participant.hasSmallCar || participant.prefersSmallSpot) {
    filters.push(PRIORITY.VAGA_PEQUENA);
  }

  if (participant.prefersCovered) filters.push(PRIORITY.VAGA_COBERTA);
  if (participant.prefersUncovered) filters.push(PRIORITY.VAGA_DESCOBERTA);
  if (participant.prefersLinkedSpot) filters.push(PRIORITY.VAGA_PRESA);
  if (participant.prefersUnlinkedSpot) filters.push(PRIORITY.VAGA_LIVRE);

  // ✅ NOVO: Adicionar filtro de motocicleta
  if (participant.hasMotorcycle) filters.push(PRIORITY.MOTOCICLETA);

  if (!participant.isUpToDate) filters.push(PRIORITY.INADIMPLENTE);

  if (filters.length === 0) {
    filters.push(PRIORITY.VAGA_COMUM);  // ✅ Nome novo
  }

  return filters.sort((a, b) => a - b);
}

function extractSpotFilters(spot: ParkingSpot): PriorityValue[] {
  const filters: PriorityValue[] = [];
  const typeArray = Array.isArray(spot.type) ? spot.type : [spot.type];

  if (typeArray.includes('Vaga PcD')) filters.push(PRIORITY.PCD);
  if (typeArray.includes('Vaga Idoso')) filters.push(PRIORITY.IDOSO);
  if (typeArray.includes('Vaga Grande') || spot.size === 'G' || spot.size === 'XG') {
    filters.push(PRIORITY.VEICULO_GRANDE);
  }
  if (typeArray.includes('Vaga Pequena') || spot.size === 'P') {
    filters.push(PRIORITY.VAGA_PEQUENA);
  }

  // ✅ MUDANÇA CRÍTICA: Agora busca no array de tipos
  if (typeArray.includes('Vaga Coberta')) {
    filters.push(PRIORITY.VAGA_COBERTA);
  }
  if (typeArray.includes('Vaga Descoberta')) {
    filters.push(PRIORITY.VAGA_DESCOBERTA);
  }

  if (typeArray.includes('Vaga Presa')) filters.push(PRIORITY.VAGA_PRESA);
  if (typeArray.includes('Vaga Livre')) filters.push(PRIORITY.VAGA_LIVRE);
  if (typeArray.includes('Vaga Motocicleta')) filters.push(PRIORITY.MOTOCICLETA);

  // ✅ MUDANÇA: Vaga Comum agora é um tipo explícito
  if (typeArray.includes('Vaga Comum')) {
    filters.push(PRIORITY.VAGA_COMUM);
  }

  // ✅ Fallback se não tem NENHUM tipo
  if (filters.length === 0) {
    filters.push(PRIORITY.VAGA_COMUM);
  }

  return filters;
}

function spotMatchesFloors(spot: ParkingSpot, preferredFloors?: string[]): boolean {
  // Se participante não tem preferência de andar, qualquer vaga serve
  if (!preferredFloors || preferredFloors.length === 0) {
    return true;
  }

  // Verifica se o andar da vaga está na lista de andares preferidos
  return preferredFloors.includes(spot.floor);
}

function findHighestPriority(filters: PriorityValue[]): PriorityValue {
  if (filters.length === 0) return PRIORITY.VAGA_COMUM;

  let highest = filters[0];
  for (const filter of filters) {
    if (filter < highest) {
      highest = filter;
    }
  }
  return highest;
}

function compareBySecondaryFilters(a: ParticipantWithFilters, b: ParticipantWithFilters): number {
  // ✅ REGRA 1: Quem tem MAIS filtros vai PRIMEIRO (mais específico = maior prioridade)
  if (a.filters.length !== b.filters.length) {
    return b.filters.length - a.filters.length; // Decrescente: mais filtros = vem antes
  }

  // ✅ REGRA 2: Se têm a mesma quantidade de filtros, compara filtro por filtro
  for (let i = 1; i < a.filters.length; i++) {
    const filterA = a.filters[i];
    const filterB = b.filters[i];

    if (filterA !== filterB) {
      return filterA - filterB; // Menor número = maior prioridade
    }
  }

  // ✅ REGRA 3: Se são idênticos, sorteia aleatoriamente para justiça
  return Math.random() - 0.5;
}

function spotHasAllFilters(spot: SpotWithFilters, requiredFilters: PriorityValue[]): boolean {
  return requiredFilters.every(filter => spot.filters.includes(filter));
}

function findCompatibleSpots(
  availableSpots: SpotWithFilters[],
  requiredFilters: PriorityValue[],
  preferredFloors?: string[],
  strictCoverageFilter?: 'covered' | 'uncovered' | null
): SpotWithFilters[] {
  return availableSpots.filter(spot => {
    // ✅ NOVA REGRA: Vagas de motocicleta são EXCLUSIVAS
    // ✅ REGRA: Vagas de motocicleta são EXCLUSIVAS
    const typeArray = Array.isArray(spot.type) ? spot.type : [spot.type];
    const isMotorcycleSpot = typeArray.includes('Vaga Motocicleta');

    // Se a vaga é de motocicleta, o participante PRECISA ter o filtro MOTOCICLETA (9)
    if (isMotorcycleSpot) {
      const hasMotorcycleFilter = requiredFilters.includes(PRIORITY.MOTOCICLETA);
      if (!hasMotorcycleFilter) {
        return false; // ❌ Vaga de moto só serve para quem tem moto
      }
    }

    // Se o participante tem moto, só aceita vagas de motocicleta
    const participantHasMotorcycle = requiredFilters.includes(PRIORITY.MOTOCICLETA);
    if (participantHasMotorcycle && !isMotorcycleSpot) {
      return false; // ❌ Quem tem moto só pode pegar vaga de moto
    }

    // ✅ Ignorar filtro COMUM (9) e filtros de COBERTURA dos requiredFilters
    // ✅ NOVO: Não ignora mais nenhum filtro - todos são tratados igualmente
    const hasFilters = requiredFilters.length === 0
      ? true
      : spotHasAllFilters(spot, requiredFilters);

    // Vaga está em um dos andares preferidos?
    const matchesFloor = spotMatchesFloors(spot, preferredFloors);

    // ✅ NOVO: Cobertura agora é verificada nos filtros normais, não separadamente
    // Se o participante precisa de coberta/descoberta, isso já está nos requiredFilters
    // e será verificado em spotHasAllFilters()

    return hasFilters && matchesFloor;
  });
}

function randomSpot(spots: SpotWithFilters[]): SpotWithFilters | null {
  if (spots.length === 0) return null;
  if (spots.length === 1) return spots[0];

  // ✅ Embaralhar array antes de pegar o primeiro
  const shuffled = shuffleArray(spots);
  return shuffled[0];
}


function generateFilterCombinations(filters: PriorityValue[]): PriorityValue[][] {
  const combinations: PriorityValue[][] = [];

  if (filters.length === 0) {
    return [[]];
  }

  // ✅ REGRA 1: SEMPRE TENTA A COMBINAÇÃO COMPLETA PRIMEIRO
  combinations.push([...filters]);

  // ✅ REGRA 2: Só relaxa filtros de MENOR prioridade (números maiores)
  // Remove filtros um por vez, do menos importante para o mais importante
  if (filters.length > 1) {
    const sortedByPriority = [...filters].sort((a, b) => b - a); // Maior número = menor prioridade

    for (const filterToRemove of sortedByPriority) {
      const relaxed = filters.filter(f => f !== filterToRemove);
      if (relaxed.length > 0) {
        combinations.push(relaxed);
      }
    }
  }

  // ✅ REGRA 3: Testar filtros individuais (mantém apenas os MAIS prioritários)
  const sortedByPriority = [...filters].sort((a, b) => a - b); // Menor número = maior prioridade
  for (const filter of sortedByPriority) {
    combinations.push([filter]);
  }

  // ✅ REGRA 4: Fallback final (sem nenhum filtro)
  combinations.push([]);

  // Remove duplicatas mantendo a ordem
  const unique: PriorityValue[][] = [];
  const seen = new Set<string>();

  for (const combo of combinations) {
    const key = combo.sort((a, b) => a - b).join(',');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(combo);
    }
  }

  return unique;
}

// ============================================================================
// 🔗 FUNÇÕES AUXILIARES DE GRUPOS DE VAGAS
// ============================================================================
interface SpotGroup {
  groupId?: string;           // ✅ NOVO: ID do grupo de vagas
  spotIds: string[];
  size: number;
  spots: SpotWithFilters[];   // ✅ NOVO: Array completo de vagas
  mainSpot: SpotWithFilters;
}

function buildSpotGroups(spots: SpotWithFilters[]): SpotGroup[] {
  const groups: SpotGroup[] = [];
  const processedSpotIds = new Set<string>();

  for (const spot of spots) {
    if (processedSpotIds.has(spot.id)) continue;

    // ✅ NOVO: Verificar se tem groupId (grupo de vagas)
    if (spot.groupId) {
      const groupSpots = [spot];
      const groupSpotIds = [spot.id];

      // Buscar TODAS as vagas do mesmo grupo
      // ✅ CÓDIGO NOVO:
      // Buscar TODAS as vagas com o MESMO groupId
      spots.forEach(otherSpot => {
        if (otherSpot.id !== spot.id &&
          otherSpot.groupId === spot.groupId &&
          !processedSpotIds.has(otherSpot.id)) {
          groupSpots.push(otherSpot);
          groupSpotIds.push(otherSpot.id);
          processedSpotIds.add(otherSpot.id);
        }
      });

      groups.push({
        groupId: spot.groupId,  // ✅ ADICIONAR groupId
        spotIds: groupSpotIds,
        size: groupSpots.length,
        spots: groupSpots,      // ✅ ADICIONAR array de spots
        mainSpot: spot,
      });

      processedSpotIds.add(spot.id);
    } else {
      // Vaga individual (sem grupo)
      groups.push({
        groupId: undefined,     // ✅ Sem grupo
        spotIds: [spot.id],
        size: 1,
        spots: [spot],          // ✅ ADICIONAR array
        mainSpot: spot,
      });
      processedSpotIds.add(spot.id);
    }
  }

  return groups;
}

function findAvailableSpotGroup(
  groups: SpotGroup[],
  neededSize: number,
  assignedSpots: Set<string>,
  requireLinked: boolean = false
): SpotGroup | null {
  for (const group of groups) {
    if (group.size === neededSize) {
      const allAvailable = group.spotIds.every(id => !assignedSpots.has(id));
      if (allAvailable && (!requireLinked || group.size > 1)) {
        return group;
      }
    }
  }

  if (requireLinked) {
    for (const group of groups) {
      if (group.size > neededSize && group.size > 1) {
        const availableInGroup = group.spotIds.filter(id => !assignedSpots.has(id)).length;
        if (availableInGroup >= neededSize) {
          return group;
        }
      }
    }
  }

  return null;
}

function buildPriorityQueues(participants: Participant[]): Queue {
  console.log('📊 ========== FASE 1: CONSTRUÇÃO DAS FILAS ==========');

  const queues: Queue = {};

  Object.values(PRIORITY).forEach(priority => {
    queues[priority] = [];
  });

  participants.forEach(participant => {
    // ✅ NOVO: PULAR participantes que estão em grupos
    if (participant.groupId && !participant.groupId.startsWith('multi-spot-')) {
      console.log(`   ⏭️ ${participant.name} [${participant.block}/${participant.unit}]`);
      console.log(`      Faz parte do grupo ${participant.groupId} - será processado separadamente`);
      return; // NÃO entra nas filas normais
    }

    const filters = extractParticipantFilters(participant);
    const mainPriority = findHighestPriority(filters);

    const participantWithFilters: ParticipantWithFilters = {
      ...participant,
      filters,
      mainPriority,
    };

    queues[mainPriority].push(participantWithFilters);

    console.log(`   👤 ${participant.name} [${participant.block}/${participant.unit}]`);
    console.log(`      Filtros: ${filters.join(', ')} → Fila: ${mainPriority}`);
  });

  Object.keys(queues).forEach(priorityKey => {
    const priority = parseInt(priorityKey) as PriorityValue;

    if (queues[priority].length > 0) {
      console.log(`\n   🔄 Ordenando fila ${priority} (${queues[priority].length} participantes)`);

      queues[priority].sort(compareBySecondaryFilters);

      queues[priority].forEach((p, index) => {
        console.log(`      ${index + 1}º: ${p.name} - Filtros: ${p.filters.join(', ')}`);
      });
    }
  });

  console.log('\n✅ FASE 1 CONCLUÍDA: Filas construídas e ordenadas\n');

  return queues;
}

// ============================================================================
// 🎯 FUNÇÕES DE MATCHING PARA GRUPOS
// ============================================================================

function calculateFilterMatchScore(participantFilters: PriorityValue[], spotFilters: PriorityValue[]): number {
  let score = 0;

  participantFilters.forEach(filter => {
    if (spotFilters.includes(filter)) {
      score += 10; // +10 pontos por filtro atendido
    }
  });

  return score;
}

function findBestSpotGroupForParticipantGroup(
  members: ParticipantWithFilters[],
  spotGroups: SpotGroup[],
  assignedSpots: Set<string>
): { spotGroup: SpotGroup; matches: { participantId: string; spotId: string; score: number }[] } | null {

  const totalNeeded = members.reduce((sum, m) => sum + (m.numberOfSpots || 1), 0);

  // ✅ NOVO: Identificar preferências de cobertura do grupo
  const coveragePreferences = {
    needsCovered: members.some(m => m.prefersCovered && !m.prefersUncovered),
    needsUncovered: members.some(m => m.prefersUncovered && !m.prefersCovered),
    flexible: members.some(m => !m.prefersCovered && !m.prefersUncovered)
  };

  console.log(`   🔍 Preferências de cobertura do grupo:`, {
    needsCovered: coveragePreferences.needsCovered,
    needsUncovered: coveragePreferences.needsUncovered,
    flexible: coveragePreferences.flexible
  });

  // 1. Filtrar APENAS grupos com todas as vagas disponíveis E que atendem cobertura
  const candidateGroups = spotGroups.filter(g => {
    // Verificações básicas
    if (!g.groupId) return false;
    if (g.size < totalNeeded) return false;
    if (!g.spotIds.every(id => !assignedSpots.has(id))) return false;

    // ✅ NOVO: Verificar COBERTURA ANTES de qualquer outra coisa
    // ✅ NOVO: Verificar COBERTURA no array de tipos
    if (coveragePreferences.needsCovered) {
      // Pelo menos UMA vaga do grupo deve ter "Vaga Coberta" no array de tipos
      const hasCoveredSpot = g.spots.some(spot => {
        const typeArray = Array.isArray(spot.type) ? spot.type : [spot.type];
        return typeArray.includes('Vaga Coberta');
      });
      if (!hasCoveredSpot) {
        console.log(`      ❌ Grupo ${g.groupId} rejeitado: precisa coberta mas não tem`);
        return false;
      }
    }

    if (coveragePreferences.needsUncovered) {
      // Pelo menos UMA vaga do grupo deve ter "Vaga Descoberta" no array de tipos
      const hasUncoveredSpot = g.spots.some(spot => {
        const typeArray = Array.isArray(spot.type) ? spot.type : [spot.type];
        return typeArray.includes('Vaga Descoberta');
      });
      if (!hasUncoveredSpot) {
        console.log(`      ❌ Grupo ${g.groupId} rejeitado: precisa descoberta mas não tem`);
        return false;
      }
    }

    // ✅ Verificar preferência de andar dos membros do grupo
    const membersWithFloorPref = members.filter(m =>
      m.preferredFloors &&
      m.preferredFloors.length > 0
    );

    // Se nenhum membro tem preferência de andar, aceita qualquer grupo
    if (membersWithFloorPref.length === 0) return true;

    // Se tem membros com preferência de andar, verificar se o grupo atende
    for (const member of membersWithFloorPref) {
      const spotsInPreferredFloor = g.spots.filter(spot =>
        spotMatchesFloors(spot, member.preferredFloors)
      );

      // Se não tem nenhuma vaga no andar preferido deste membro, rejeita o grupo
      if (spotsInPreferredFloor.length === 0) return false;
    }

    return true;
  });

  if (candidateGroups.length === 0) {
    console.log(`   ⚠️ Nenhum grupo candidato após filtros de cobertura`);
    return null;
  }

  console.log(`   ✅ ${candidateGroups.length} grupos candidatos após filtros de cobertura`);

  // 2. Calcular score para cada grupo de vagas
  const scored = candidateGroups.map(spotGroup => {
    let totalScore = 0;
    const matches: { participantId: string; spotId: string; score: number }[] = [];
    let randomTieBreaker: number = 0; // ✅ ADICIONAR ESTA LINHA
    const usedSpotIds = new Set<string>();

    // Tentar encaixar cada morador em uma vaga deste grupo
    members.forEach(member => {
      let bestSpotScore = -1;
      let bestSpot: SpotWithFilters | null = null;

      spotGroup.spots.forEach(spot => {
        if (usedSpotIds.has(spot.id)) return; // Já atribuída

        // Calcular score base (compatibilidade de filtros)
        let score = calculateFilterMatchScore(member.filters, spot.filters);

        // ✅ BONUS: +50 pontos se a vaga está em um dos andares preferidos
        if (member.preferredFloors &&
          member.preferredFloors.length > 0 &&
          spotMatchesFloors(spot, member.preferredFloors)) {
          score += 50;
        }

        // ✅ NOVO: BONUS EXTRA para cobertura correta
        // ✅ NOVO: BONUS EXTRA para cobertura correta (verifica no array de tipos)
        if (member.prefersCovered && !member.prefersUncovered) {
          const typeArray = Array.isArray(spot.type) ? spot.type : [spot.type];
          if (typeArray.includes('Vaga Coberta')) {
            score += 100;
          }
        }
        if (member.prefersUncovered && !member.prefersCovered) {
          const typeArray = Array.isArray(spot.type) ? spot.type : [spot.type];
          if (typeArray.includes('Vaga Descoberta')) {
            score += 100;
          }
        }

        if (score > bestSpotScore) {
          bestSpotScore = score;
          bestSpot = spot;
        }
      });

      if (bestSpot && bestSpotScore >= 0) {
        matches.push({
          participantId: member.id,
          spotId: bestSpot.id,
          score: bestSpotScore
        });
        usedSpotIds.add(bestSpot.id);
        totalScore += bestSpotScore;
      }
    });

    // Só válido se TODOS os moradores tiveram match
    const isValid = matches.length === members.length;

    return {
      spotGroup,
      totalScore: isValid ? totalScore : -1,
      matches: isValid ? matches : [],
      randomTieBreaker: 0  
    };
  });

  // 3. Filtrar grupos válidos
  const validGroups = scored.filter(s => s.totalScore >= 0);
  if (validGroups.length === 0) return null;

  // 4. Atribuir tie-breaker aleatório ANTES de ordenar
  validGroups.forEach(group => {
    group.randomTieBreaker = Math.random();
  });

  // 5. Ordenar por score (maior primeiro) e depois por tie-breaker
  validGroups.sort((a, b) => {
    // Primeiro critério: score (maior = melhor)
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    // Segundo critério: tie-breaker aleatório (maior = melhor)
    return b.randomTieBreaker - a.randomTieBreaker;
  });

  // 6. Pegar o primeiro grupo (já ordenado aleatoriamente em caso de empate)
  const chosenGroup = validGroups[0];
  const maxScore = chosenGroup.totalScore;

  // Contar quantos grupos tinham o mesmo score
  const tiedGroupsCount = validGroups.filter(g => g.totalScore === maxScore).length;

  if (tiedGroupsCount === 1) {
    console.log(`   🎯 Único grupo perfeito encontrado: ${chosenGroup.spotGroup.groupId} (score: ${maxScore})`);
  } else {
    console.log(`   🎲 ${tiedGroupsCount} grupos empatados com score ${maxScore}, sorteado: ${chosenGroup.spotGroup.groupId} (tie-breaker: ${chosenGroup.randomTieBreaker.toFixed(4)})`);
  }

  return chosenGroup;
}

// ============================================================================
// 🎲 FASE 2: SORTEIO SEQUENCIAL COM MATCHING PROGRESSIVO E GRUPOS
// ============================================================================
async function runSequentialLottery(
  queues: Queue,
  availableSpots: ParkingSpot[],
  allOriginalParticipants: Participant[],
  onProgress: (step: string, progress: number) => void
): Promise<AllocationResult[]> {
  console.log('🎲 ========== FASE 2: SORTEIO SEQUENCIAL ==========');

  const results: AllocationResult[] = [];
  const assignedParticipants = new Set<string>();
  const assignedSpots = new Set<string>();
  const assignedSpotGroups = new Set<string>();

  // ✅ DELAY INICIAL: Dar tempo para UI atualizar

  const spotsWithFilters: SpotWithFilters[] = availableSpots.map(spot => ({
    ...spot,
    filters: extractSpotFilters(spot),
  }));

  const spotGroups = buildSpotGroups(spotsWithFilters);

  // ✅ NOVO: Identificar vagas que estão em grupos (reservadas para moradores em grupo)
  const reservedSpotIds = new Set<string>();
  spotGroups.forEach(group => {
    if (group.groupId) {
      // Vaga tem groupId = está em um grupo de vagas
      group.spotIds.forEach(id => reservedSpotIds.add(id));
    }
  });

  console.log(`🔒 Vagas reservadas para grupos: ${reservedSpotIds.size}`);

  // ============================================================================
  // 🆕 FASE 2A: PROCESSAR GRUPOS DE MORADORES PRIMEIRO
  // ============================================================================
  console.log('\n👥 ========== PROCESSANDO GRUPOS DE MORADORES ==========');

  // ✅ DELAY: Simular análise de grupos

  const groupedParticipants = new Map<string, ParticipantWithFilters[]>();

  // ✅ NOVO: Processar TODOS os participantes originais (não só das filas)
  allOriginalParticipants.forEach(participant => {
    const filters = extractParticipantFilters(participant);
    const mainPriority = findHighestPriority(filters);

    const p: ParticipantWithFilters = {
      ...participant,
      filters,
      mainPriority,
    };

    if (p.groupId && !p.groupId.startsWith('multi-spot-')) {
      // ✅ APENAS grupos REAIS de moradores vinculados
      if (!groupedParticipants.has(p.groupId)) {
        groupedParticipants.set(p.groupId, []);
      }
      groupedParticipants.get(p.groupId)!.push(p);
    }
  });

  // ✅ Remover "grupos" com apenas 1 membro (não são grupos reais)
  for (const [groupId, members] of Array.from(groupedParticipants.entries())) {
    if (members.length < 2) {
      console.log(`   ⚠️ Ignorando "${groupId}" - apenas 1 membro (não é um grupo real)`);
      groupedParticipants.delete(groupId);
    }
  }

  

  // Processar cada grupo de moradores
  for (const [groupId, members] of groupedParticipants.entries()) {
    console.log(`\n👥 Grupo: ${groupId} (${members.length} moradores)`);
    const coverageInfo = members.map(m => {
      const prefs = [];
      if (m.prefersCovered) prefs.push('COBERTA');
      if (m.prefersUncovered) prefs.push('DESCOBERTA');
      return prefs.length > 0 ? prefs.join('/') : 'SEM PREF';
    });
    console.log(`   📋 Preferências de cobertura: ${coverageInfo.join(', ')}`);
    members.forEach(m => console.log(`   - ${m.name}: ${m.filters.join(', ')}`));
    console.log(`\n👥 Grupo: ${groupId} (${members.length} moradores)`);
    members.forEach(m => console.log(`   - ${m.name}: ${m.filters.join(', ')}`));

    const totalSpotsNeeded = members.reduce((sum, m) => sum + (m.numberOfSpots || 1), 0);

    // ✅ DELAY: Simular processamento de cada grupo

    // 1️⃣ TENTAR MATCH PERFEITO (com filtros)
    const result = findBestSpotGroupForParticipantGroup(
      members,
      spotGroups,
      assignedSpots
    );

    if (result) {
      console.log(`   ✅ Grupo de vagas PERFEITO: ${result.spotGroup.groupId}`);

      result.matches.forEach(match => {
        const member = members.find(m => m.id === match.participantId)!;
        const spot = result.spotGroup.spots.find(s => s.id === match.spotId)!;

        results.push({
          participantId: match.participantId,
          spotId: match.spotId,
          usedFilters: member.filters,
          relaxedFilters: []
        });

        assignedParticipants.add(match.participantId);
        assignedSpots.add(match.spotId);

        console.log(`   → ${member.name} → Vaga ${spot.number}`);
      });

      assignedSpotGroups.add(result.spotGroup.groupId!);
    } else {
      // 2️⃣ FALLBACK: PEGAR QUALQUER GRUPO DISPONÍVEL DO TAMANHO CERTO
      console.log(`   ⚠️ Nenhum match perfeito, buscando qualquer grupo disponível...`);

      // ✅ NOVO: Primeiro tentar com o andar preferido
      let anyAvailableGroup = spotGroups.find(g => {
        if (!g.groupId || g.size < totalSpotsNeeded) return false;
        if (!g.spotIds.every(id => !assignedSpots.has(id))) return false;
        if (assignedSpotGroups.has(g.groupId)) return false;

        // ✅ Verificar se tem vagas no andar preferido dos membros
        const membersWithFloorPref = members.filter(m =>
          m.preferredFloors &&
          m.preferredFloors.length > 0
        );

        if (membersWithFloorPref.length > 0) {
          return membersWithFloorPref.every(member =>
            g.spots.some(spot => spotMatchesFloors(spot, member.preferredFloors))
          );
        }

        return true;
      });

      // ✅ NOVO: Se não achou com andar preferido, tentar sem essa restrição
      if (!anyAvailableGroup) {
        console.log(`      ⚠️ Não encontrou grupo no andar preferido, tentando sem restrição de andar...`);

        anyAvailableGroup = spotGroups.find(g =>
          g.groupId &&
          g.size >= totalSpotsNeeded &&
          g.spotIds.every(id => !assignedSpots.has(id)) &&
          !assignedSpotGroups.has(g.groupId)
        );
      }

      if (anyAvailableGroup) {
        console.log(`   ✅ Grupo de vagas FALLBACK: ${anyAvailableGroup.groupId} (sem match de filtros)`);

        // Alocar membros do grupo nas vagas disponíveis
        // ✅ NOVO: Tentar priorizar vagas no andar preferido ao alocar
        const availableSpotsInGroup = anyAvailableGroup.spots.filter(s =>
          !assignedSpots.has(s.id)
        );

        members.forEach((member, index) => {
          let spot = null;

          // ✅ NOVO: Primeiro tentar pegar vaga em um dos andares preferidos
          if (member.preferredFloors && member.preferredFloors.length > 0) {
            spot = availableSpotsInGroup.find(s =>
              spotMatchesFloors(s, member.preferredFloors) &&
              !assignedSpots.has(s.id)
            );
          }

          // Se não achou no andar preferido, pega qualquer disponível
          if (!spot) {
            spot = availableSpotsInGroup.find(s => !assignedSpots.has(s.id));
          }

          if (spot) {
            results.push({
              participantId: member.id,
              spotId: spot.id,
              usedFilters: [], // Sem filtros (fallback)
              relaxedFilters: member.filters // Todos os filtros foram relaxados
            });

            assignedParticipants.add(member.id);
            assignedSpots.add(spot.id);

            console.log(`   → ${member.name} → Vaga ${spot.number} (fallback)`);
          }
        });

        assignedSpotGroups.add(anyAvailableGroup.groupId);
      } else {
        console.log(`   ❌ Nenhum grupo de vagas disponível (nem fallback)`);
      }
    }
  }

  console.log('\n✅ GRUPOS DE MORADORES PROCESSADOS\n');

  // ✅ NOVO: Liberar vagas de grupos não utilizadas para o sorteio normal
  spotGroups.forEach(group => {
    if (group.groupId && !assignedSpotGroups.has(group.groupId)) {
      // Grupo de vagas não foi usado
      console.log(`🔓 Liberando vagas do grupo ${group.groupId} para sorteio normal`);
      group.spotIds.forEach(id => reservedSpotIds.delete(id));
    }
  });

  console.log(`🔓 Vagas ainda reservadas: ${reservedSpotIds.size}`);

  // ============================================================================
  // FASE 2B: SORTEIO NORMAL (PARTICIPANTES INDIVIDUAIS)
  // ============================================================================
  let totalParticipants = 0;
  Object.values(queues).forEach(queue => {
    totalParticipants += queue.length;
  });

  let processedCount = 0;

  // ✅ DELAY: Transição entre fases

  for (let priorityLevel = 1; priorityLevel <= 10; priorityLevel++) {
    const queue = queues[priorityLevel];

    if (!queue || queue.length === 0) {
      console.log(`\n⏭️ Fila ${priorityLevel}: Vazia, pulando...`);
      continue;
    }

    console.log(`\n🎯 PROCESSANDO FILA ${priorityLevel} (${queue.length} participantes)`);

    // ✅ DELAY: Simular análise da fila

    const notAllocated: ParticipantWithFilters[] = [];

    for (const participant of queue) {
      // ✅ NOVO: Pular se já foi processado em grupo
      if (assignedParticipants.has(participant.id)) {
        console.log(`   ⏭️ ${participant.name}: Já alocado em grupo, pulando...`);
        continue;
      }

      processedCount++;
      const progressPercent = (processedCount / totalParticipants) * 100;
      onProgress(
        `Processando: ${participant.name} (${processedCount}/${totalParticipants})`,
        progressPercent
      );

      // ✅ DELAY ESTRATÉGICO: Mais lento no início, mais rápido depois
      // ✅ DELAY MÍNIMO: Apenas para UI atualizar
      const delayTime = processedCount <= 3 ? 100 : 10;
      await new Promise(resolve => setTimeout(resolve, delayTime));

      console.log(`\n   👤 Processando: ${participant.name}`);
      console.log(`      Filtros originais: ${participant.filters.join(', ')}`);

      const numberOfSpots = Math.max(1, participant.numberOfSpots || 1);
      console.log(`      Precisa de: ${numberOfSpots} vaga(s)`);

      const allocatedSpots: SpotWithFilters[] = [];

      // Se precisa de múltiplas vagas, primeiro tenta um grupo
      if (numberOfSpots > 1) {
        const needsGroup = participant.prefersLinkedSpot || numberOfSpots > 1;
        const availableGroup = findAvailableSpotGroup(
          spotGroups,
          numberOfSpots,
          assignedSpots,
          needsGroup
        );

        if (availableGroup) {
          console.log(`   🔗 Encontrado grupo com ${availableGroup.size} vagas ligadas`);

          const groupSpotsToAllocate = availableGroup.spotIds
            .filter(id => !assignedSpots.has(id))
            .slice(0, numberOfSpots)
            .map(id => spotsWithFilters.find(s => s.id === id))
            .filter(Boolean) as SpotWithFilters[];

          groupSpotsToAllocate.forEach(spot => {
            allocatedSpots.push(spot);
            assignedSpots.add(spot.id);

            results.push({
              participantId: participant.id,
              spotId: spot.id,
              usedFilters: participant.filters,
              relaxedFilters: [],
            });

            console.log(`      ✅ Alocado: Vaga ${spot.number} (do grupo)`);
          });

          if (allocatedSpots.length === numberOfSpots) {
            assignedParticipants.add(participant.id);
            console.log(`   ✔️ ${participant.name} totalmente alocado via grupo (${allocatedSpots.length}/${numberOfSpots})`);
            continue;
          }
        }
      }

      // ============================================================================
      // LÓGICA: TESTA TODAS AS COMBINAÇÕES DE FILTROS
      // ============================================================================
      for (let spotIndex = allocatedSpots.length; spotIndex < numberOfSpots; spotIndex++) {
        let foundSpot: SpotWithFilters | null = null;
        let usedFilters: PriorityValue[] = [];

        const filterCombinations = generateFilterCombinations(participant.filters);

        console.log(`      🔍 Tentativa ${spotIndex + 1}/${numberOfSpots} - Testando ${filterCombinations.length} combinações`);

        // ✅ NOVO: Determinar preferência estrita de coberta/descoberta
        // ✅ Determinar preferência estrita de coberta/descoberta
        let strictCoverageFilter: 'covered' | 'uncovered' | null = null;
        if (participant.prefersCovered && !participant.prefersUncovered) {
          strictCoverageFilter = 'covered';
        } else if (participant.prefersUncovered && !participant.prefersCovered) {
          strictCoverageFilter = 'uncovered';
        }

        console.log(`      🏠 Preferência cobertura: ${strictCoverageFilter || 'sem preferência'}`);

        // ============================================================================
        // ESTRATÉGIA DE BUSCA: Testar combinações em ordem de prioridade
        // ============================================================================

        // 1️⃣ FASE 1: COM filtros + andar preferido + cobertura preferida
        for (const combination of filterCombinations) {
          if (combination.length > 0) {
            console.log(`         → Testando filtros: [${combination.join(', ')}] + andar + cobertura`);
          } else {
            console.log(`         → Testando sem filtros + andar + cobertura`);
          }

          let compatibleSpots = findCompatibleSpots(
            spotsWithFilters.filter(s =>
              !assignedSpots.has(s.id) &&
              !reservedSpotIds.has(s.id)
            ),
            combination,
            participant.preferredFloors,
            strictCoverageFilter
          );

          console.log(`            Vagas compatíveis: ${compatibleSpots.length}`);

          if (compatibleSpots.length > 0) {
            foundSpot = randomSpot(compatibleSpots);
            usedFilters = combination;
            console.log(`            ✅ Vaga encontrada: ${foundSpot?.number}`);
            break;
          }
        }

        // 2️⃣ FASE 2: Se não achou, relaxar ANDAR mas manter filtros + cobertura
        if (!foundSpot && participant.preferredFloors && participant.preferredFloors.length > 0) {
          console.log(`      🔄 Relaxando preferência de andar, mas mantendo filtros e cobertura...`);

          for (const combination of filterCombinations) {
            console.log(`         → Tentando filtros [${combination.join(', ')}] sem andar mas com cobertura`);

            let compatibleSpots = findCompatibleSpots(
              spotsWithFilters.filter(s =>
                !assignedSpots.has(s.id) &&
                !reservedSpotIds.has(s.id)
              ),
              combination,
              undefined, // SEM filtro de andar
              strictCoverageFilter // MANTÉM cobertura
            );

            if (compatibleSpots.length > 0) {
              foundSpot = randomSpot(compatibleSpots);
              usedFilters = combination;
              console.log(`            ⚠️ Vaga ${foundSpot?.number} alocada sem andar preferido`);
              break;
            }
          }
        }

        // 3️⃣ FASE 3: Relaxar COBERTURA mas manter filtros essenciais
        if (!foundSpot && strictCoverageFilter) {
          console.log(`      🔄 ÚLTIMO RECURSO: Relaxando cobertura (${strictCoverageFilter})...`);

          // Manter apenas filtros ESSENCIAIS (PCD, Idoso, Veículo Grande)
          const essentialFilters = participant.filters.filter(f =>
            f === PRIORITY.PCD ||
            f === PRIORITY.IDOSO ||
            f === PRIORITY.VEICULO_GRANDE
          );

          if (essentialFilters.length > 0) {
            console.log(`         → Mantendo filtros essenciais: [${essentialFilters.join(', ')}]`);

            // Tentar COM andar preferido primeiro
            let compatibleSpots = findCompatibleSpots(
              spotsWithFilters.filter(s =>
                !assignedSpots.has(s.id) &&
                !reservedSpotIds.has(s.id)
              ),
              essentialFilters,
              participant.preferredFloors,
              null // SEM filtro de cobertura
            );

            if (compatibleSpots.length === 0 && participant.preferredFloors) {
              // Tentar SEM andar também
              compatibleSpots = findCompatibleSpots(
                spotsWithFilters.filter(s =>
                  !assignedSpots.has(s.id) &&
                  !reservedSpotIds.has(s.id)
                ),
                essentialFilters,
                undefined,
                null
              );
            }

            if (compatibleSpots.length > 0) {
              foundSpot = randomSpot(compatibleSpots);
              usedFilters = essentialFilters;
              console.log(`            ⚠️ Vaga ${foundSpot?.number} alocada sem cobertura preferida`);
            }
          }
        }

        // 4️⃣ FASE 4: FALLBACK ABSOLUTO - qualquer vaga disponível
        if (!foundSpot) {
          console.log(`         → Tentativa final: QUALQUER vaga disponível...`);

          const anySpots = spotsWithFilters.filter(s =>
            !assignedSpots.has(s.id) &&
            !reservedSpotIds.has(s.id)
          );

          if (anySpots.length > 0) {
            foundSpot = randomSpot(anySpots);
            usedFilters = [];
            console.log(`            ⚠️ Vaga ${foundSpot?.number} alocada SEM NENHUM FILTRO`);
          }
        }

        // ============================================================================
        // ALOCAR A VAGA ENCONTRADA
        // ============================================================================
        if (foundSpot) {
          allocatedSpots.push(foundSpot);
          assignedSpots.add(foundSpot.id);

          const relaxedFilters = participant.filters.filter(f => !usedFilters.includes(f));

          results.push({
            participantId: participant.id,
            spotId: foundSpot.id,
            usedFilters: usedFilters,
            relaxedFilters: relaxedFilters,
          });

          console.log(`      ✅ Alocado: Vaga ${foundSpot.number}`);
          if (relaxedFilters.length > 0) {
            console.log(`         ⚠️ Filtros relaxados: [${relaxedFilters.join(', ')}]`);
          }
        } else {
          console.log(`      ❌ Não foi possível alocar vaga ${spotIndex + 1}`);
        }

        await new Promise(resolve => setTimeout(resolve, 10));
      }

      if (allocatedSpots.length >= numberOfSpots) {
        assignedParticipants.add(participant.id);
        console.log(`   ✔️ ${participant.name} totalmente alocado (${allocatedSpots.length}/${numberOfSpots})`);
      } else {
        console.log(`   ⚠️ ${participant.name} parcialmente alocado (${allocatedSpots.length}/${numberOfSpots})`);

        if (allocatedSpots.length === 0) {
          notAllocated.push(participant);
        } else {
          assignedParticipants.add(participant.id);
        }
      }
    }

    if (notAllocated.length > 0) {
      console.log(`\n   🔄 REPROCESSANDO ${notAllocated.length} participantes não alocados`);

      // ✅ DELAY FINAL: Compilar resultados
      await new Promise(resolve => setTimeout(resolve, 800));

      for (const participant of notAllocated) {
        const newFilters = participant.filters.filter(f => f !== priorityLevel);

        if (newFilters.length > 0) {
          const newMainPriority = findHighestPriority(newFilters);

          console.log(`      → ${participant.name}: Movendo para fila ${newMainPriority}`);

          const reprocessed: ParticipantWithFilters = {
            ...participant,
            filters: newFilters,
            mainPriority: newMainPriority,
          };

          if (!queues[newMainPriority]) {
            queues[newMainPriority] = [];
          }
          queues[newMainPriority].push(reprocessed);
        } else {
          console.log(`      → ${participant.name}: Movendo para fila COMUM`);

          const reprocessed: ParticipantWithFilters = {
            ...participant,
            filters: [PRIORITY.VAGA_COMUM],
            mainPriority: PRIORITY.VAGA_COMUM,
          };

          if (!queues[PRIORITY.VAGA_COMUM]) {
            queues[PRIORITY.VAGA_COMUM] = [];
          }
          queues[PRIORITY.VAGA_COMUM].push(reprocessed);
        }
      }

}
  }

// ✅ DELAY FINAL: Compilar resultados
await new Promise(resolve => setTimeout(resolve, 800));

console.log('\n🎊 ========== FASE 2 CONCLUÍDA ==========');

  console.log(`   ✅ Total de alocações: ${results.length}`);
  console.log(`   👥 Participantes alocados: ${assignedParticipants.size}/${totalParticipants}`);
  console.log(`   🔗 Grupos de vagas utilizados: ${assignedSpotGroups.size}`);

  return results;
}

// ============================================================================
// 🎯 COMPONENTE PRINCIPAL
// ============================================================================
export const LotterySystem = () => {
  const {
    participants,
    parkingSpots,
    selectedParticipants,
    setSelectedParticipants,
    selectedSpots,
    setSelectedSpots,
    saveLotterySession,
    selectedBuilding,
    addParticipant,
    addParkingSpot,
    deleteParticipant,
    deleteParkingSpot,
  } = useAppContext();

  const { toast } = useToast();

  // Estados principais
  const [preAllocations, setPreAllocations] = useState<Map<string, string[]>>(new Map());
  const [isPreAllocationOpen, setIsPreAllocationOpen] = useState(false);
  const [selectedPreParticipant, setSelectedPreParticipant] = useState<string>('');
  const [selectedPreSpot, setSelectedPreSpot] = useState<string>('');

  const [isRunning, setIsRunning] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [results, setResults] = useState<LotteryResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'participant' | 'spot'>('participant');

  const [config, setConfig] = useState({
    sessionName: `Sorteio ${new Date().toLocaleDateString('pt-BR')}`,
    prioritizeElders: true,
    prioritizeSpecialNeeds: true,
  });

  // Restaurar resultados do localStorage ao montar/trocar de prédio
  useEffect(() => {
    if (selectedBuilding?.id) {
      const saved = localStorage.getItem(`lotteryResults-${selectedBuilding.id}`);
      const savedSessionId = localStorage.getItem(`currentSessionId-${selectedBuilding.id}`);

      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setResults(parsed);
          setShowResults(true);

          if (savedSessionId) {
            setCurrentSessionId(savedSessionId);
          }
        } catch (e) {
          console.error('Erro ao restaurar resultados do sorteio:', e);
        }
      }
    }
  }, [selectedBuilding?.id]);

  // Salvar resultados em localStorage sempre que mudam
  useEffect(() => {
    if (selectedBuilding?.id && results.length > 0) {
      localStorage.setItem(
        `lotteryResults-${selectedBuilding.id}`,
        JSON.stringify(results)
      );
    }
  }, [results, selectedBuilding?.id]);

  // Salvar ID da sessão atual
  useEffect(() => {
    if (selectedBuilding?.id && currentSessionId) {
      localStorage.setItem(
        `currentSessionId-${selectedBuilding.id}`,
        currentSessionId
      );
    }
  }, [currentSessionId, selectedBuilding?.id]);

  // Filtrar participantes e vagas elegíveis
  const eligibleParticipants = participants.filter(p =>
    p.buildingId === selectedBuilding?.id && !preAllocations.has(p.id)
  );

  const availableSpots = parkingSpots.filter(spot => {
    const allocatedSpots = Array.from(preAllocations.values()).flat();
    return (
      spot.status === 'available' &&
      spot.buildingId === selectedBuilding?.id &&
      !allocatedSpots.includes(spot.id)
    );
  });

  // Maps para busca rápida
  const participantMap = useMemo(() => {
    const map = new Map<string, Participant>();
    participants.forEach((p) => map.set(p.id, p));
    return map;
  }, [participants]);

  const spotMap = useMemo(() => {
    const map = new Map<string, ParkingSpot>();
    parkingSpots.forEach((s) => map.set(s.id, s));
    return map;
  }, [parkingSpots]);

  // Atualizar seleções quando mudar prédio
  useEffect(() => {
    const currentEligibleIds = eligibleParticipants.map(p => p.id);
    const currentAvailableIds = availableSpots.map(s => s.id);

    setSelectedParticipants(currentEligibleIds);
    setSelectedSpots(currentAvailableIds);
  }, [eligibleParticipants.length, availableSpots.length, setSelectedParticipants, setSelectedSpots]);

  // Salvar e restaurar pré-alocações
  useEffect(() => {
    if (selectedBuilding?.id) {
      const saved = localStorage.getItem(`preAllocations-${selectedBuilding.id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const map = new Map<string, string[]>();
          parsed.forEach(([key, value]: [string, unknown]) => {
            map.set(key, Array.isArray(value) ? value : [value]);
          });
          setPreAllocations(map);
        } catch (e) {
          console.error('Erro ao restaurar pré-alocações:', e);
        }
      }
    }
  }, [selectedBuilding?.id]);

  useEffect(() => {
    if (selectedBuilding?.id && preAllocations.size > 0) {
      localStorage.setItem(
        `preAllocations-${selectedBuilding.id}`,
        JSON.stringify(Array.from(preAllocations.entries()))
      );
    }
  }, [preAllocations, selectedBuilding?.id]);

  const getPriorityLevel = (participant: Participant): Priority => {
    if (participant.hasSpecialNeeds) return 'special-needs';
    if (participant.isElderly) return 'elderly';
    if (participant.isUpToDate) return 'up-to-date';
    return 'normal';
  };

  const savePublicResultsAsync = async (session: LotterySession) => {
    try {
      const result = await savePublicResults(
        session,
        selectedBuilding?.name || '',
        participants,
        parkingSpots,
        selectedBuilding?.company
      );

      if (result && result.success) {
        toast({
          title: "Sorteio concluído e publicado",
          description: "Os resultados estão disponíveis publicamente via QR Code.",
        });
      } else {
        toast({
          title: "Sorteio salvo (não publicado)",
          description: result?.error || "Erro ao publicar resultados públicos.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Erro ao publicar resultados:', error);
      toast({
        title: "Sorteio salvo localmente",
        description: "Os resultados foram salvos mas não publicados.",
        variant: "destructive",
      });
    }
  };

  const runLottery = async () => {
    setIsRunning(true);
    setProgress(0);
    setResults([]);
    setShowResults(false);
    setCurrentSessionId(null);

    const selectedParticipantsData = eligibleParticipants.filter(p =>
      selectedParticipants.includes(p.id)
    );
    const selectedSpotsData = availableSpots.filter(s =>
      selectedSpots.includes(s.id)
    );

    console.log('🎲 ========== INICIANDO NOVO SORTEIO ==========');
    console.log(`   Prédio: ${selectedBuilding?.name}`);
    console.log(`   Participantes: ${selectedParticipantsData.length}`);
    console.log(`   Vagas: ${selectedSpotsData.length}`);

    if (selectedParticipantsData.length === 0) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos um participante.",
        variant: "destructive",
      });
      setIsRunning(false);
      return;
    }

    if (selectedSpotsData.length === 0) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos uma vaga.",
        variant: "destructive",
      });
      setIsRunning(false);
      return;
    }

    try {
      setCurrentStep('Construindo filas de prioridade...');
      setProgress(10);

      // ✅ DELAY: Dar tempo para UI mostrar o início
      await new Promise(resolve => setTimeout(resolve, 800));

      // FASE 1: Construir filas
      const queues = buildPriorityQueues(selectedParticipantsData);

      setCurrentStep('Executando sorteio...');
      setProgress(20);



      // FASE 1.5: PROCESSAR PRÉ-ALOCAÇÕES

      // ============================================================================
      // 🆕 FASE 1.5: PROCESSAR PRÉ-ALOCAÇÕES
      // ============================================================================
      const preAllocationResults: AllocationResult[] = [];
      const assignedParticipants = new Set<string>();  // ✅ MOVER PARA ANTES
      const assignedSpots = new Set<string>();         // ✅ MOVER PARA ANTES

      if (preAllocations.size > 0) {
        console.log('🔒 ========== PROCESSANDO PRÉ-ALOCAÇÕES ==========');

        for (const [participantId, spotIds] of preAllocations.entries()) {
          const participant = participantMap.get(participantId);

          if (participant) {
            const filters = extractParticipantFilters(participant);

            spotIds.forEach(spotId => {
              const spot = spotMap.get(spotId);

              if (spot) {
                preAllocationResults.push({
                  participantId: participantId,
                  spotId: spotId,
                  usedFilters: filters,
                  relaxedFilters: [],
                });

                // ✅ ADICIONE ESTAS LINHAS:
                assignedParticipants.add(participantId);
                assignedSpots.add(spotId);

                console.log(`   ✅ Pré-alocado: ${participant.name} → Vaga ${spot.number}`);
              }
            });
          }
        }

        console.log(`✅ ${preAllocationResults.length} pré-alocações processadas\n`);
      }
      // ============================================================================

      // FASE 2: Sorteio sequencial
      const allocationResults = await runSequentialLottery(
        queues,
        selectedSpotsData,
        selectedParticipantsData,
        (step, prog) => {
          setCurrentStep(step);
          setProgress(20 + (prog * 0.7)); // 20% a 90%
        }
      );

      setCurrentStep('Finalizando resultados...');
      setProgress(95);

      // 🔄 COMBINAR pré-alocações + sorteio normal
      const combinedResults = [...preAllocationResults, ...allocationResults];

      // Converter resultados para formato LotteryResult
      const finalResults: LotteryResult[] = combinedResults.map((allocation, index) => {
        const participant = participantMap.get(allocation.participantId);
        const spot = spotMap.get(allocation.spotId);

        return {
          id: `result-${Date.now()}-${index}`,
          participantId: allocation.participantId,
          parkingSpotId: allocation.spotId,
          timestamp: new Date(),
          priority: participant ? getPriorityLevel(participant) : 'normal',
          participantSnapshot: participant ? {
            name: participant.name,
            block: participant.block,
            unit: participant.unit,
          } : undefined,
          spotSnapshot: spot ? {
            number: spot.number,
            floor: spot.floor,
            type: Array.isArray(spot.type) ? spot.type : [spot.type],
            size: spot.size,
            isCovered: spot.isCovered,
            isUncovered: spot.isUncovered,
          } : undefined,
        };
      });

      setResults(finalResults);
      setProgress(100);
      setCurrentStep('Sorteio concluído!');

      await new Promise(resolve => setTimeout(resolve, 500));

      setIsRunning(false);
      setShowResults(true);

      // Salvar sessão
      const sessionId = `session-${Date.now()}`;
      const session: LotterySession = {
        id: sessionId,
        buildingId: selectedBuilding?.id || '',
        name: config.sessionName,
        date: new Date(),
        participants: selectedParticipants,
        availableSpots: selectedSpots,
        results: finalResults,
        status: 'completed',
        settings: {
          allowSharedSpots: false,
          prioritizeElders: config.prioritizeElders,
          prioritizeSpecialNeeds: config.prioritizeSpecialNeeds,
          zoneByProximity: false,
        },
      };
      saveLotterySession(session);
      setCurrentSessionId(sessionId);

      savePublicResultsAsync(session);

      toast({
        title: "Sorteio concluído",
        description: `${finalResults.length} vaga(s) sorteadas com sucesso!`,
      });

    } catch (error) {
      console.error('Erro no sorteio:', error);
      toast({
        title: "Erro no sorteio",
        description: "Ocorreu um erro durante o sorteio. Tente novamente.",
        variant: "destructive",
      });
      setIsRunning(false);
    }
  };


  const handleNewLottery = () => {
    setResults([]);
    setShowResults(false);
    setProgress(0);
    setCurrentStep('');
    setCurrentSessionId(null);
    // Limpar localStorage dos resultados
    if (selectedBuilding?.id) {
      localStorage.removeItem(`lotteryResults-${selectedBuilding.id}`);
      localStorage.removeItem(`currentSessionId-${selectedBuilding.id}`);
    }

    setConfig({
      ...config,
      sessionName: `Sorteio ${new Date().toLocaleDateString('pt-BR')}`,
    });

    toast({
      title: "Novo sorteio",
      description: "Sistema pronto para um novo sorteio.",
    });
  };
  const handleGeneratePDF = () => {
    // ✅ FILTRAR resultados válidos primeiro
    const validResults = results.filter(r => {
      const participant = participantMap.get(r.participantId);
      const spot = spotMap.get(r.parkingSpotId);
      return participant && spot;
    });

    console.log(`📊 Total results: ${results.length}, Valid: ${validResults.length}`);

    // Ordenar resultados baseado no modo de visualização atual
    let sortedResults: LotteryResult[];

    if (viewMode === 'participant') {
      sortedResults = [...validResults].sort((a, b) => {
        const participantA = participantMap.get(a.participantId);
        const participantB = participantMap.get(b.participantId);

        const blockA = participantA?.block || '';
        const blockB = participantB?.block || '';
        if (blockA !== blockB) {
          return blockA.localeCompare(blockB, 'pt-BR', { numeric: true });
        }

        const unitA = participantA?.unit || '';
        const unitB = participantB?.unit || '';
        return unitA.localeCompare(unitB, 'pt-BR', { numeric: true });
      });
    } else {
      sortedResults = [...validResults].sort((a, b) => {
        const spotA = spotMap.get(a.parkingSpotId);
        const spotB = spotMap.get(b.parkingSpotId);

        const numA = spotA?.number || '';
        const numB = spotB?.number || '';

        return numA.localeCompare(numB, 'pt-BR', { numeric: true });
      });
    }

    console.log('🔍 VIEW MODE:', viewMode);
    console.log('🔍 SORTED RESULTS (primeiros 5):', sortedResults.slice(0, 5).map(r => ({
      participant: participantMap.get(r.participantId)?.name,
      block: participantMap.get(r.participantId)?.block,
      unit: participantMap.get(r.participantId)?.unit,
      spot: spotMap.get(r.parkingSpotId)?.number
    })));

    generateLotteryPDF(
      config.sessionName,
      sortedResults,
      participants,
      parkingSpots,
      selectedBuilding?.company || 'exvagas',
      selectedBuilding?.name,
      viewMode  // ✅ ADICIONAR ESTA LINHA (passa o modo de visualização atual)
    );

    toast({
      title: "Relatório gerado",
      description: `PDF gerado na ordem: ${viewMode === 'participant' ? 'Por Morador' : 'Por Vaga'}`,
    });
  };

  const handleAddPreAllocation = () => {
    if (!selectedPreParticipant || !selectedPreSpot) {
      toast({
        title: "Erro",
        description: "Selecione um participante e uma vaga.",
        variant: "destructive",
      });
      return;
    }
    const newPreAllocations = new Map(preAllocations);
    const currentSpots = newPreAllocations.get(selectedPreParticipant) || [];
    newPreAllocations.set(selectedPreParticipant, [...currentSpots, selectedPreSpot]);
    setPreAllocations(newPreAllocations);

    setSelectedPreSpot('');

    toast({
      title: "Pré-alocação adicionada",
      description: "A vaga foi reservada para o participante.",
    });
  };
  const handleRemovePreAllocation = (participantId: string, spotId?: string) => {
    const newPreAllocations = new Map(preAllocations);
    if (spotId) {
      const currentSpots = newPreAllocations.get(participantId) || [];
      const updatedSpots = currentSpots.filter(id => id !== spotId);
      if (updatedSpots.length > 0) {
        newPreAllocations.set(participantId, updatedSpots);
      } else {
        newPreAllocations.delete(participantId);
      }
    } else {
      newPreAllocations.delete(participantId);
    }

    setPreAllocations(newPreAllocations);

    if (selectedBuilding?.id) {
      if (newPreAllocations.size === 0) {
        localStorage.removeItem(`preAllocations-${selectedBuilding.id}`);
      } else {
        localStorage.setItem(
          `preAllocations-${selectedBuilding.id}`,
          JSON.stringify(Array.from(newPreAllocations.entries()))
        );
      }
    }

    toast({
      title: "Pré-alocação removida",
      description: "A vaga voltou a estar disponível para o sorteio.",
    });
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'special-needs':
        return <Badge variant="pcd">PcD</Badge>;
      case 'elderly':
        return <Badge variant="elderly">Idoso</Badge>;
      case 'up-to-date':
        return <Badge variant="outline">Em dia</Badge>;
      default:
        return null;
    }
  };

  const getResultCharacteristics = (participantId: string) => {
    const participant = participantMap.get(participantId);
    if (!participant) return [];

    const badges = [];

    // Prioridades principais
    if (participant.hasSpecialNeeds) badges.push({ label: 'PcD', variant: 'pcd' });
    if (participant.isElderly) badges.push({ label: 'Idoso', variant: 'elderly' });

    // Características do veículo
    if (participant.hasLargeCar) badges.push({ label: 'Veículo Grande', variant: 'large' });
    if (participant.hasSmallCar) badges.push({ label: 'Veículo Pequeno', variant: 'small' });
    if (participant.hasMotorcycle) badges.push({ label: 'Motocicleta', variant: 'motorcycle' });

    // Preferências de vaga
    if (participant.prefersCovered) badges.push({ label: 'Prefere Coberta', variant: 'covered' });
    if (participant.prefersUncovered) badges.push({ label: 'Prefere Descoberta', variant: 'uncovered' });
    if (participant.prefersLinkedSpot) badges.push({ label: 'Prefere Presa', variant: 'linked' });
    if (participant.prefersUnlinkedSpot) badges.push({ label: 'Prefere Livre', variant: 'unlinked' });
    if (participant.prefersSmallSpot) badges.push({ label: 'Prefere Pequena', variant: 'small' });

    // Nota: Inadimplência NÃO é exibida nos resultados (informação sensível/privada)

    return badges;
  };


  const getParticipantCharacteristics = (participant: Participant | undefined) => {

    if (!participant) return [];
    const badges = [];
    if (participant.hasSpecialNeeds) badges.push({ label: 'PcD', variant: 'pcd' });
    if (participant.isElderly) badges.push({ label: 'Idoso', variant: 'elderly' });
    if (participant.hasLargeCar) badges.push({ label: 'Veículo Grande', variant: 'large' });
    if (participant.hasSmallCar) badges.push({ label: 'Veículo Pequeno', variant: 'small' }); // ✅ NOVO
    if (participant.hasMotorcycle) badges.push({ label: 'Motocicleta', variant: 'motorcycle' });
    if (participant.prefersCovered) badges.push({ label: 'Pref. por Vaga Coberta', variant: 'covered' });
    if (participant.prefersUncovered) badges.push({ label: 'Pref. por Vaga Descoberta', variant: 'uncovered' });
    if (participant.prefersLinkedSpot) badges.push({ label: 'Pref. por Vaga Presa', variant: 'linked' });
    if (participant.prefersUnlinkedSpot) badges.push({ label: 'Pref. por Vaga Livre', variant: 'unlinked' });
    if (participant.prefersSmallSpot) badges.push({ label: 'Pref. Pequena', variant: 'small' });

    // ✅ ADICIONAR ESTAS LINHAS AQUI:
    // Adicionar "Pref. por Vaga Comum" apenas se não tem NENHUMA preferência específica
    const hasAnyPreference = participant.prefersCovered || participant.prefersUncovered ||
      participant.prefersLinkedSpot || participant.prefersUnlinkedSpot ||
      participant.prefersSmallSpot;
    if (!hasAnyPreference && !participant.hasSpecialNeeds && !participant.isElderly &&
      !participant.hasLargeCar && !participant.hasSmallCar && !participant.hasMotorcycle) {
      badges.push({ label: 'Pref. por Vaga Comum', variant: 'common' });
    }

    return badges;
  };

  const groupResultsBySpot = () => {
    const grouped = new Map<string, {
      spot: ParkingSpot | undefined,
      participants: (Participant | undefined)[],
      isPreAllocated: boolean
    }>();

    results.forEach((result) => {
      const participantCtx = participantMap.get(result.participantId);
      const spotCtx = spotMap.get(result.parkingSpotId);
      const participant = participantCtx || (result.participantSnapshot as unknown as Participant | undefined);
      const spot = spotCtx || (result.spotSnapshot as unknown as ParkingSpot | undefined);
      const isPreAllocated = preAllocations.get(result.participantId)?.includes(result.parkingSpotId) || false;

      if (!grouped.has(result.parkingSpotId)) {
        grouped.set(result.parkingSpotId, {
          spot,
          participants: [participant],
          isPreAllocated
        });
      } else {
        const existing = grouped.get(result.parkingSpotId)!;
        existing.participants.push(participant);
      }
    });

    return Array.from(grouped.entries())
      .filter(([, data]) => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        const spotMatch = data.spot?.number?.toLowerCase().includes(search);
        const floorMatch = data.spot?.floor?.toLowerCase().includes(search);
        const participantMatch = data.participants.some(p =>
          p?.block?.toLowerCase().includes(search) ||
          p?.unit?.toLowerCase().includes(search) ||
          p?.name?.toLowerCase().includes(search)
        );
        return spotMatch || floorMatch || participantMatch;
      })
      .sort(([, a], [, b]) => {
        const numA = a.spot?.number || '';
        const numB = b.spot?.number || '';
        return numA.localeCompare(numB, 'pt-BR', { numeric: true });
      });
  };

  const generateTestData = () => {
    if (!selectedBuilding?.id) {
      toast({ title: "Erro", description: "Selecione um prédio primeiro.", variant: "destructive" });
      return;
    }
    // Gerar 20 participantes com características variadas - COMBINAÇÕES INTELIGENTES
    const names = ['João', 'Maria', 'José', 'Ana', 'Pedro', 'Paula', 'Carlos', 'Lucia', 'Fernando', 'Beatriz',
      'Roberto', 'Alice', 'Marcelo', 'Sophia', 'Ricardo', 'Camila', 'André', 'Fátima', 'Gustavo', 'Elena'];

    const newParticipants: Participant[] = [];
    let stats = {
      pcd: 0,
      elderly: 0,
      largeCar: 0,
      covered: 0,
      uncovered: 0,
      linked: 0,
      unlinked: 0,
      small: 0,
      multiSpots: 0
    };

    for (let i = 0; i < 20; i++) {
      let participant: Participant;

      // 0-2: PcD puros [1]
      if (i < 3) {
        participant = {
          id: `test-participant-${Date.now()}-${i}`,
          buildingId: selectedBuilding.id,
          name: `${names[i]} (Teste)`,
          block: String((i % 5) + 1),
          unit: String((i % 20) + 1),
          numberOfSpots: 1,
          hasSpecialNeeds: true,
          isElderly: false,
          hasLargeCar: false,
          prefersCovered: false,
          prefersUncovered: false,
          prefersLinkedSpot: false,
          prefersUnlinkedSpot: false,
          prefersSmallSpot: false,
          isUpToDate: true,
          groupId: undefined,
          createdAt: new Date(),
        };
        stats.pcd++;
      }
      // 3-5: Idosos puros [2]
      else if (i < 6) {
        participant = {
          id: `test-participant-${Date.now()}-${i}`,
          buildingId: selectedBuilding.id,
          name: `${names[i]} (Teste)`,
          block: String((i % 5) + 1),
          unit: String((i % 20) + 1),
          numberOfSpots: 1,
          hasSpecialNeeds: false,
          isElderly: true,
          hasLargeCar: false,
          prefersCovered: false,
          prefersUncovered: false,
          prefersLinkedSpot: false,
          prefersUnlinkedSpot: false,
          prefersSmallSpot: false,
          isUpToDate: true,
          groupId: undefined,
          createdAt: new Date(),
        };
        stats.elderly++;
      }
      // 6: Inadimplente [10]
      else if (i === 6) {
        participant = {
          id: `test-participant-${Date.now()}-${i}`,
          buildingId: selectedBuilding.id,
          name: `${names[i]} (Teste)`,
          block: String((i % 5) + 1),
          unit: String((i % 20) + 1),
          numberOfSpots: 1,
          hasSpecialNeeds: false,
          isElderly: false,
          hasLargeCar: false,
          prefersCovered: false,
          prefersUncovered: false,
          prefersLinkedSpot: false,
          prefersUnlinkedSpot: false,
          prefersSmallSpot: false,
          isUpToDate: false,
          groupId: undefined,
          createdAt: new Date(),
        };
      }
      // 7-11: Moradores com PREFERÊNCIAS ESPECÍFICAS (uma cada)
      // 7-11: Moradores com PREFERÊNCIAS ESPECÍFICAS (uma cada)
      else if (i < 12) {
        const prefs = [
          { hasLargeCar: true, hasSmallCar: false, prefersCovered: false, prefersUncovered: false, prefersLinkedSpot: false, prefersUnlinkedSpot: false, prefersSmallSpot: false },
          { hasLargeCar: false, hasSmallCar: false, prefersCovered: true, prefersUncovered: false, prefersLinkedSpot: false, prefersUnlinkedSpot: false, prefersSmallSpot: false },
          { hasLargeCar: false, hasSmallCar: false, prefersCovered: false, prefersUncovered: true, prefersLinkedSpot: false, prefersUnlinkedSpot: false, prefersSmallSpot: false },
          { hasLargeCar: false, hasSmallCar: false, prefersCovered: false, prefersUncovered: false, prefersLinkedSpot: true, prefersUnlinkedSpot: false, prefersSmallSpot: false },
          { hasLargeCar: false, hasSmallCar: true, prefersCovered: false, prefersUncovered: false, prefersLinkedSpot: false, prefersUnlinkedSpot: false, prefersSmallSpot: false }, // ✅ CORRIGIDO
        ];

        const pref = prefs[i - 7];

        participant = {
          id: `test-participant-${Date.now()}-${i}`,
          buildingId: selectedBuilding.id,
          name: `${names[i]} (Teste)`,
          block: String((i % 5) + 1),
          unit: String((i % 20) + 1),
          numberOfSpots: 1,
          hasSpecialNeeds: false,
          isElderly: false,
          hasLargeCar: pref.hasLargeCar,
          hasSmallCar: pref.hasSmallCar, // ✅ ADICIONAR
          prefersCovered: pref.prefersCovered,
          prefersUncovered: pref.prefersUncovered,
          prefersLinkedSpot: pref.prefersLinkedSpot,
          prefersUnlinkedSpot: pref.prefersUnlinkedSpot,
          prefersSmallSpot: pref.prefersSmallSpot,
          isUpToDate: true,
          groupId: undefined,
          createdAt: new Date(),
        };

        if (pref.hasLargeCar) stats.largeCar++;
        if (pref.prefersCovered) stats.covered++;
        if (pref.prefersUncovered) stats.uncovered++;
        if (pref.prefersLinkedSpot) stats.linked++;
        if (pref.prefersUnlinkedSpot) stats.unlinked++;
        if (pref.prefersSmallSpot) stats.small++;
      }
      // 12-15: Moradores com COMBINAÇÕES de preferências
      else if (i < 16) {
        const combos = [
          { hasLargeCar: true, prefersCovered: true, prefersUncovered: false, prefersLinkedSpot: false, prefersUnlinkedSpot: false, prefersSmallSpot: false },
          { hasLargeCar: true, prefersCovered: false, prefersUncovered: true, prefersLinkedSpot: false, prefersUnlinkedSpot: false, prefersSmallSpot: false },
          { hasLargeCar: false, prefersCovered: true, prefersUncovered: false, prefersLinkedSpot: true, prefersUnlinkedSpot: false, prefersSmallSpot: false },
          { hasLargeCar: false, prefersCovered: false, prefersUncovered: true, prefersLinkedSpot: false, prefersUnlinkedSpot: false, prefersSmallSpot: true },
        ];

        const combo = combos[i - 12];

        participant = {
          id: `test-participant-${Date.now()}-${i}`,
          buildingId: selectedBuilding.id,
          name: `${names[i]} (Teste)`,
          block: String((i % 5) + 1),
          unit: String((i % 20) + 1),
          numberOfSpots: 1,
          hasSpecialNeeds: false,
          isElderly: false,
          hasLargeCar: combo.hasLargeCar,
          prefersCovered: combo.prefersCovered,
          prefersUncovered: combo.prefersUncovered,
          prefersLinkedSpot: combo.prefersLinkedSpot,
          prefersUnlinkedSpot: combo.prefersUnlinkedSpot,
          prefersSmallSpot: combo.prefersSmallSpot,
          isUpToDate: true,
          groupId: undefined,
          createdAt: new Date(),
        };

        if (combo.hasLargeCar) stats.largeCar++;
        if (combo.prefersCovered) stats.covered++;
        if (combo.prefersUncovered) stats.uncovered++;
        if (combo.prefersLinkedSpot) stats.linked++;
        if (combo.prefersUnlinkedSpot) stats.unlinked++;
        if (combo.prefersSmallSpot) stats.small++;
      }
      // 16-19: Moradores com MÚLTIPLAS VAGAS mas SEM preferência (ficam por último)
      else {
        participant = {
          id: `test-participant-${Date.now()}-${i}`,
          buildingId: selectedBuilding.id,
          name: `${names[i]} (Teste)`,
          block: String((i % 5) + 1),
          unit: String((i % 20) + 1),
          numberOfSpots: 2,  // MÚLTIPLAS VAGAS
          hasSpecialNeeds: false,
          isElderly: false,
          hasLargeCar: false,
          prefersCovered: false,
          prefersUncovered: false,
          prefersLinkedSpot: false,
          prefersUnlinkedSpot: false,
          prefersSmallSpot: false,
          isUpToDate: true,
          groupId: undefined,
          createdAt: new Date(),
        };

        stats.multiSpots++;
      }

      newParticipants.push(participant);
      addParticipant(participant);
    }

    // Gerar vagas de forma PRECISA baseado nos moradores
    let spotIndex = 0;
    const createdSpots: any[] = [];

    // 1. VAGAS PCD - Criar uma para cada PCD + buffer
    const pcdSpots = Math.max(1, stats.pcd + 2);
    for (let i = 0; i < pcdSpots; i++) {
      const spot = createTestSpotObject(spotIndex, ['Vaga PcD']);
      createdSpots.push(spot);
      addParkingSpot(spot);
      spotIndex++;
    }

    // 2. VAGAS IDOSO - Criar uma para cada idoso + buffer
    const elderlySpots = Math.max(1, stats.elderly + 2);
    for (let i = 0; i < elderlySpots; i++) {
      const spot = createTestSpotObject(spotIndex, ['Vaga Idoso']);
      createdSpots.push(spot);
      addParkingSpot(spot);
      spotIndex++;
    }

    // 3. VAGAS GRANDE - Criar uma para cada veículo grande + buffer
    const largeSpots = Math.max(1, stats.largeCar + 2);
    for (let i = 0; i < largeSpots; i++) {
      const spot = createTestSpotObject(spotIndex, ['Vaga Grande']);
      createdSpots.push(spot);
      addParkingSpot(spot);
      spotIndex++;
    }

    // 4. VAGAS PEQUENA - Criar uma para cada preferência + buffer
    const smallSpots = Math.max(1, stats.small + 2);
    for (let i = 0; i < smallSpots; i++) {
      const spot = createTestSpotObject(spotIndex, ['Vaga Pequena']);
      createdSpots.push(spot);
      addParkingSpot(spot);
      spotIndex++;
    }

    // 5. VAGAS COBERTAS - Criar para quem prefere
    const coveredSpots = Math.max(2, stats.covered + 2);
    for (let i = 0; i < coveredSpots; i++) {
      const spot = createTestSpotObject(spotIndex, ['Vaga Comum'], true, false);
      createdSpots.push(spot);
      addParkingSpot(spot);
      spotIndex++;
    }

    // 6. VAGAS DESCOBERTAS - Criar para quem prefere
    const uncoveredSpots = Math.max(2, stats.uncovered + 2);
    for (let i = 0; i < uncoveredSpots; i++) {
      const spot = createTestSpotObject(spotIndex, ['Vaga Comum'], false, true);  // ← Segundo parâmetro é isCovered, terceiro é isUncovered
      createdSpots.push(spot);
      addParkingSpot(spot);
      spotIndex++;
    }

    // 7. VAGAS LIGADAS (para quem prefere vagas juntas) - Criar grupos de 2
    const linkedGroupsNeeded = Math.max(1, Math.ceil(stats.linked / 2));
    for (let g = 0; g < linkedGroupsNeeded; g++) {
      const mainSpotId = `test-spot-${Date.now()}-${spotIndex}`;
      const linkedSpotId = `test-spot-${Date.now()}-${spotIndex + 1}`;

      const mainSpot = createTestSpotObject(spotIndex, ['Vaga Presa'], false, false, [linkedSpotId]);
      createdSpots.push(mainSpot);
      addParkingSpot(mainSpot);
      spotIndex++;

      const linkedSpot = createTestSpotObject(spotIndex, ['Vaga Presa'], false, false, [mainSpotId]);
      createdSpots.push(linkedSpot);
      addParkingSpot(linkedSpot);
      spotIndex++;
    }

    // 8. VAGAS SOLTAS (para quem prefere não ligadas) - Vagas individuais
    const unlinkSpots = Math.max(2, stats.unlinked + 2);
    for (let i = 0; i < unlinkSpots; i++) {
      const spot = createTestSpotObject(spotIndex, ['Vaga Comum']);
      createdSpots.push(spot);
      addParkingSpot(spot);
      spotIndex++;
    }

    // 9. VAGAS COMUNS - Para remanescentes e múltiplos
    const commonSpots = Math.max(5, stats.multiSpots * 1.5 + 3);
    for (let i = 0; i < commonSpots; i++) {
      const spot = createTestSpotObject(spotIndex, ['Vaga Comum']);
      createdSpots.push(spot);
      addParkingSpot(spot);
      spotIndex++;
    }

    const totalSpots = spotIndex;
    const helper = (count: number) => count > 0 ? `${count}` : '0';

    toast({
      title: "Dados de teste criados",
      description: `20 moradores (${helper(stats.pcd)}PcD, ${helper(stats.elderly)}Idosos, ${helper(stats.largeCar)}Veí.Gdes, ${helper(stats.multiSpots)}Multi) e ${totalSpots} vagas geradas proporcionalmente.`,
    });
  };
  const createTestSpotObject = (
    index: number,
    typeArray: string[],
    isCovered = false,
    isUncovered = false,
    linkedSpotIds?: string[]
  ) => {
    const floors = ['Piso Único', 'Térreo', '1° SubSolo', '2° SubSolo', '3° SubSolo'];
    return {
      id: `test-spot-${Date.now()}-${index}`,
      buildingId: selectedBuilding?.id,
      number: String(index + 1).padStart(3, '0'),
      floor: floors[index % 5],
      type: typeArray,
      size: ['P', 'M', 'G'][index % 3],
      status: 'available',
      isCovered,
      isUncovered,
      position: { x: Math.random() * 100, y: Math.random() * 100 },
      linkedSpotIds: linkedSpotIds || undefined,
      groupId: linkedSpotIds ? `group-${index}` : undefined,
      createdAt: new Date(),
    } as any;
  };
  const clearAllTestData = () => {
    if (!selectedBuilding?.id) {
      toast({ title: "Erro", description: "Selecione um prédio primeiro.", variant: "destructive" });
      return;
    }
    const testParticipants = participants.filter(p => p.id.includes('test-participant'));
    const testSpots = parkingSpots.filter(s => s.id.includes('test-spot'));

    if (testParticipants.length === 0 && testSpots.length === 0) {
      toast({ title: "Nada para limpar", description: "Não há dados de teste neste prédio.", variant: "destructive" });
      return;
    }

    testParticipants.forEach(p => deleteParticipant(p.id));
    testSpots.forEach(s => deleteParkingSpot(s.id));

    toast({
      title: "Dados de teste removidos",
      description: `${testParticipants.length} moradores e ${testSpots.length} vagas foram removidos.`,
    });
  };
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 gradient-primary rounded-lg flex items-center justify-center">
            <Trophy className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Sistema de Sorteio</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Sorteio inteligente com filas de prioridade
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="secondary"
            onClick={() => setIsPreAllocationOpen(true)}
            disabled={isRunning}
            className="w-full sm:w-auto"
          >
            <Building className="mr-2 h-4 w-4" />
            Pré-alocar Vagas ({preAllocations.size})
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsConfigOpen(true)}
            disabled={isRunning}
            className="w-full sm:w-auto"
          >
            <Settings className="mr-2 h-4 w-4" />
            Configurações
          </Button>
          <Button
            onClick={runLottery}
            disabled={isRunning}
            className="gradient-primary text-white shadow-medium w-full sm:w-auto"
          >
            {isRunning ? (
              <>
                <Clock className="mr-2 h-4 w-4 animate-spin" />
                Executando...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Executar Sorteio
              </>
            )}
          </Button>

          {/* Botões de teste */}
          <div className="flex flex-col sm:flex-row gap-2 mt-2 sm:mt-0 border-t sm:border-t-0 sm:border-l pt-2 sm:pt-0 sm:pl-2">
            <Button
              onClick={generateTestData}
              variant="secondary"
              className="w-full sm:w-auto text-xs"
            >
              🧪 Gerar Dados Teste
            </Button>
            <Button
              onClick={clearAllTestData}
              variant="destructive"
              className="w-full sm:w-auto text-xs"
            >
              🗑️ Limpar Teste
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Participantes Elegíveis</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {selectedParticipants.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {eligibleParticipants.filter(p => p.hasSpecialNeeds && selectedParticipants.includes(p.id)).length} PcD, {' '}
              {eligibleParticipants.filter(p => p.isElderly && selectedParticipants.includes(p.id)).length} Idosos
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vagas Disponíveis</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-available">
              {selectedSpots.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {availableSpots.filter(s => {
                const typeArray = Array.isArray(s.type) ? s.type : [s.type];
                return typeArray.includes('Vaga PcD') && selectedSpots.includes(s.id);
              }).length} vagas PcD
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {selectedSpots.length > 0
                ? Math.min(100, Math.round((selectedSpots.length / selectedParticipants.length) * 100))
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Baseado na proporção vaga/participante
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {isRunning && (
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Sorteio em Andamento</CardTitle>
            <CardDescription>{currentStep}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} className="w-full" />
            <div className="flex items-center justify-center">
              <div className="w-8 h-8 animate-lottery-spin gradient-primary rounded-full flex items-center justify-center">
                <Trophy className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {showResults && results.length > 0 && (
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Trophy className="h-5 w-5 text-success" />
              <span>Resultados do Sorteio</span>
            </CardTitle>
            <CardDescription>
              {results.length} vaga(s) sorteada(s) com sucesso
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* BOTÕES DE TOGGLE */}
            <div className="mb-4 flex gap-2">
              <Button
                variant={viewMode === 'participant' ? 'default' : 'outline'}
                onClick={() => setViewMode('participant')}
                className="flex-1"
              >
                <Users className="mr-2 h-4 w-4" />
                Por Unidade
              </Button>
              <Button
                variant={viewMode === 'spot' ? 'default' : 'outline'}
                onClick={() => setViewMode('spot')}
                className="flex-1"
              >
                <ParkingSquare className="mr-2 h-4 w-4" />
                Por Vagas
              </Button>
            </div>

            {/* INPUT DE BUSCA */}
            <div className="mb-4">
              <Input
                placeholder={
                  viewMode === 'participant'
                    ? "Buscar por bloco, unidade ou número de vaga..."
                    : "Buscar por número de vaga, andar ou morador..."
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
            </div>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {viewMode === 'participant' ? (
                  // ========== VISUALIZAÇÃO POR MORADOR ==========
                  (() => {
                    const groupedResults = new Map<string, { participant: Participant | undefined, spots: (ParkingSpot | undefined)[], priority: Priority }>();
                    results.forEach((result) => {
                      const participantCtx = participantMap.get(result.participantId);
                      const spotCtx = spotMap.get(result.parkingSpotId);
                      const participant = participantCtx || (result.participantSnapshot as unknown as Participant | undefined);
                      const spot = spotCtx || (result.spotSnapshot as unknown as ParkingSpot | undefined);

                      if (!groupedResults.has(result.participantId)) {
                        groupedResults.set(result.participantId, {
                          participant,
                          spots: [spot],
                          priority: result.priority
                        });
                      } else {
                        const existing = groupedResults.get(result.participantId)!;
                        existing.spots.push(spot);
                      }
                    });

                    return Array.from(groupedResults.entries())
                      .filter(([, data]) => {
                        if (!searchTerm) return true;
                        const search = searchTerm.toLowerCase();
                        const blockMatch = data.participant?.block?.toLowerCase().includes(search);
                        const unitMatch = data.participant?.unit?.toLowerCase().includes(search);
                        const spotMatch = data.spots.some(spot =>
                          spot?.number?.toLowerCase().includes(search)
                        );
                        return blockMatch || unitMatch || spotMatch;
                      })
                      .sort(([, a], [, b]) => {
                        const blockA = a.participant?.block || '';
                        const blockB = b.participant?.block || '';
                        if (blockA !== blockB) {
                          return blockA.localeCompare(blockB, 'pt-BR', { numeric: true });
                        }
                        const unitA = a.participant?.unit || '';
                        const unitB = b.participant?.unit || '';
                        return unitA.localeCompare(unitB, 'pt-BR', { numeric: true });
                      })
                      .map(([participantId, data], index) => (
                        <div
                          key={participantId}
                          className="flex items-center justify-between p-4 bg-muted rounded-lg"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="w-8 h-8 bg-success rounded-full flex items-center justify-center text-success-foreground font-bold">
                              {index + 1}°
                            </div>
                            <div>
                              <div className="font-medium">
                                {data.participant?.block ? `Bloco ${data.participant.block} - ` : ''}Unidade {data.participant?.unit || 'N/A'}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {data.participant?.name || 'Nome não disponível'}
                              </div>
                              <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                                {getParticipantCharacteristics(data.participant).map((char, idx) => (
                                  <Badge
                                    key={idx}
                                    variant={char.variant as any}
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {char.label}
                                  </Badge>
                                ))}
                              </div>
                              <div className="space-y-1 mt-2">
                                {data.spots.filter(s => s).length > 0 ? (
                                  data.spots.filter(s => s).map((spot, spotIndex) => {
                                    const isPreAllocated = preAllocations.get(participantId)?.includes(spot!.id);
                                    return (
                                      <div key={`${participantId}-spot-${spotIndex}`} className="text-sm font-medium text-success">
                                        <div className="flex items-center gap-2">
                                          <span>Vaga {spot!.number} - {spot!.floor}</span>
                                          {isPreAllocated && (
                                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                              🔒 Pré-alocado
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                                          {spot?.type && (Array.isArray(spot.type) ? spot.type : [spot.type])
                                            .filter(type => {
                                              // Não mostrar "Vaga Comum" se for coberta ou descoberta
                                              if ((spot.isCovered || spot.isUncovered) && type === 'Vaga Comum') {
                                                return false;
                                              }
                                              // Não mostrar "Vaga Coberta" ou "Vaga Descoberta" do array de tipos
                                              // pois já é mostrado pelos badges separados de isCovered/isUncovered
                                              if (type === 'Vaga Coberta' || type === 'Vaga Descoberta') {
                                                return false;
                                              }
                                              return true;
                                            })
                                            .map((type, i) => (
                                              <Badge
                                                key={i}
                                                variant={
                                                  type === 'Vaga Idoso' ? 'elderly' :
                                                    type === 'Vaga PcD' ? 'pcd' :
                                                      type === 'Vaga Grande' ? 'large' :
                                                        type === 'Vaga Pequena' ? 'small' :
                                                          type === 'Vaga Presa' ? 'linked' :
                                                            type === 'Vaga Livre' ? 'unlinked' :
                                                              type === 'Vaga Motocicleta' ? 'motorcycle' :
                                                                type === 'Vaga Comum' ? 'common' :
                                                                  'destructive'
                                                }
                                                className="text-[10px] px-1.5 py-0"
                                              >
                                                {type}
                                              </Badge>
                                            ))}
                                          {spot?.isCovered && (
                                            <Badge variant="covered" className="text-[10px] px-1.5 py-0">
                                              Vaga Coberta
                                            </Badge>
                                          )}
                                          {spot?.isUncovered && (
                                            <Badge variant="uncovered" className="text-[10px] px-1.5 py-0">
                                              Vaga Descoberta
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="text-sm text-muted-foreground italic">
                                    Nenhuma vaga alocada
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 flex-wrap gap-1">
                            {getPriorityBadge(data.priority)}
                            {data.spots.length > 1 && (
                              <Badge variant="secondary">{data.spots.length} Vagas</Badge>
                            )}
                          </div>
                        </div>
                      ));
                  })()
                ) : (
                  // ========== VISUALIZAÇÃO POR VAGA ==========
                  groupResultsBySpot().map(([spotId, data], index) => (
                    <div
                      key={spotId}
                      className="flex items-center justify-between p-4 bg-muted rounded-lg"
                    >
                      <div className="flex items-center space-x-4 flex-1">
                        <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">
                          <ParkingSquare className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-lg">
                            Vaga {data.spot?.number || 'N/A'} - {data.spot?.floor || 'N/A'}
                          </div>

                          {/* Características da Vaga */}
                          <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                            {data.spot?.type && (Array.isArray(data.spot.type) ? data.spot.type : [data.spot.type])
                              .filter(type => {
                                // Não mostrar "Vaga Comum" se for coberta ou descoberta
                                if ((data.spot?.isCovered || data.spot?.isUncovered) && type === 'Vaga Comum') {
                                  return false;
                                }
                                // Não mostrar "Vaga Coberta" ou "Vaga Descoberta" do array de tipos
                                if (type === 'Vaga Coberta' || type === 'Vaga Descoberta') {
                                  return false;
                                }
                                return true;
                              })
                              .map((type, i) => (
                                <Badge
                                  key={i}
                                  variant={
                                    type === 'Vaga Idoso' ? 'elderly' :
                                      type === 'Vaga PcD' ? 'pcd' :
                                        type === 'Vaga Grande' ? 'large' :
                                          type === 'Vaga Pequena' ? 'small' :
                                            type === 'Vaga Presa' ? 'linked' :
                                              type === 'Vaga Livre' ? 'unlinked' :
                                                type === 'Vaga Motocicleta' ? 'motorcycle' :
                                                  type === 'Vaga Comum' ? 'common' :
                                                    'destructive'
                                  }
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {type}
                                </Badge>
                              ))}

                            {data.spot?.isCovered && (
                              <Badge variant="covered" className="text-[10px] px-1.5 py-0">
                                Vaga Coberta
                              </Badge>
                            )}
                            {data.spot?.isUncovered && (
                              <Badge variant="uncovered" className="text-[10px] px-1.5 py-0">
                                Vaga Descoberta
                              </Badge>
                            )}

                            {data.isPreAllocated && (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                🔒 Pré-alocado
                              </Badge>
                            )}
                          </div>

                          {/* Moradores Alocados */}
                          <div className="mt-3 space-y-2">
                            {data.participants.filter(p => p).map((participant, pIndex) => (
                              <div
                                key={`${spotId}-participant-${pIndex}`}
                                className="pl-4 border-l-2 border-success"
                              >
                                <div className="text-sm font-medium text-success">
                                  {participant?.block ? `Bloco ${participant.block} - ` : ''}
                                  Unidade {participant?.unit || 'N/A'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {participant?.name || 'Nome não disponível'}
                                </div>

                                {/* Características do Morador */}
                                <div className="mt-1 flex items-center gap-1 flex-wrap">
                                  {getParticipantCharacteristics(participant).map((char, idx) => (
                                    <Badge
                                      key={idx}
                                      variant={char.variant as any}
                                      className="text-[9px] px-1.5 py-0"
                                    >
                                      {char.label}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end space-y-1">
                        <Badge variant="outline" className="text-xs">
                          {data.participants.length} {data.participants.length === 1 ? 'Morador' : 'Moradores'}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            <div className="mt-6 flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  // Temporariamente define viewMode como 'participant' para gerar PDF por morador
                  const currentMode = viewMode;
                  setViewMode('participant');
                  setTimeout(() => {
                    handleGeneratePDF();
                    setViewMode(currentMode);
                  }, 100);
                }}
                disabled={results.length === 0}
              >
                📄 PDF por Participante
              </Button>

              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  // Temporariamente define viewMode como 'spot' para gerar PDF por vaga
                  const currentMode = viewMode;
                  setViewMode('spot');
                  setTimeout(() => {
                    handleGeneratePDF();
                    setViewMode(currentMode);
                  }, 100);
                }}
                disabled={results.length === 0}
              >
                🅿️ PDF por Vaga
              </Button>
              <Button
                className="flex-1 gradient-primary text-white"
                onClick={handleNewLottery}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Novo Sorteio
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog Pré-alocação */}
      <Dialog open={isPreAllocationOpen} onOpenChange={setIsPreAllocationOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Pré-alocar Vagas</DialogTitle>
            <DialogDescription>
              Atribua vagas específicas a participantes antes do sorteio
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/30">
              <div className="space-y-2">
                <Label>Participante</Label>
                <select
                  className="w-full p-2 border rounded-md bg-background"
                  value={selectedPreParticipant}
                  onChange={(e) => setSelectedPreParticipant(e.target.value)}
                >
                  <option value="">Selecione um participante</option>
                  {participants
                    .filter(p => p.buildingId === selectedBuilding?.id)
                    .sort((a, b) => {
                      const blockCompare = (a.block || '').localeCompare(b.block || '', 'pt-BR', { numeric: true });
                      if (blockCompare !== 0) return blockCompare;
                      return (a.unit || '').localeCompare(b.unit || '', 'pt-BR', { numeric: true });
                    })
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.block ? `Bl. ${p.block} - ` : ''}Un. {p.unit} - {p.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Vaga</Label>
                <select
                  className="w-full p-2 border rounded-md bg-background"
                  value={selectedPreSpot}
                  onChange={(e) => setSelectedPreSpot(e.target.value)}
                >
                  <option value="">Selecione uma vaga</option>
                  {parkingSpots
                    .filter(s => {
                      const allocatedSpots = Array.from(preAllocations.values()).flat();
                      return (
                        s.status === 'available' &&
                        s.buildingId === selectedBuilding?.id &&
                        !allocatedSpots.includes(s.id)
                      );
                    })
                    .sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }))
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        Vaga {s.number} - {s.floor}
                      </option>
                    ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <Button
                  onClick={handleAddPreAllocation}
                  className="w-full gradient-primary text-white"
                  disabled={!selectedPreParticipant || !selectedPreSpot}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Adicionar Pré-alocação
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-medium">
                Pré-alocações Confirmadas ({preAllocations.size})
              </Label>

              {preAllocations.size === 0 ? (
                <div className="p-8 text-center text-muted-foreground border rounded-lg bg-muted/10">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma pré-alocação definida</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px] border rounded-lg p-4">
                  <div className="space-y-2">
                    {Array.from(preAllocations.entries()).map(([participantId, spotIds]) => {
                      const participant = participants.find(p => p.id === participantId);

                      return (
                        <div
                          key={participantId}
                          className="border border-success/30 rounded-lg overflow-hidden"
                        >
                          <div className="p-3 bg-success/10">
                            <div className="flex items-center space-x-3">
                              <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
                              <div className="flex-1">
                                <div className="font-medium">
                                  {participant?.block ? `Bl. ${participant.block} - ` : ''}
                                  Un. {participant?.unit} - {participant?.name}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="divide-y divide-success/20">
                            {Array.isArray(spotIds) && spotIds.map(spotId => {
                              const spot = parkingSpots.find(s => s.id === spotId);
                              return (
                                <div
                                  key={spotId}
                                  className="p-2 px-3 bg-success/5 flex items-center justify-between text-sm"
                                >
                                  <div className="text-success">
                                    → Vaga {spot?.number} - {spot?.floor}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemovePreAllocation(participantId, spotId)}
                                    className="text-destructive hover:text-destructive h-6 w-6 p-0"
                                  >
                                    ✕
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {eligibleParticipants.length} participantes e {availableSpots.length} vagas disponíveis para sorteio
              </div>
              <Button onClick={() => setIsPreAllocationOpen(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Configurações do Sorteio</DialogTitle>
            <DialogDescription>
              Configure as regras e prioridades do sorteio
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="sessionName">Nome da Sessão</Label>
              <Input
                id="sessionName"
                value={config.sessionName}
                onChange={(e) => setConfig({ ...config, sessionName: e.target.value })}
              />
            </div>

            <div className="space-y-4">
              <Label className="text-base font-medium">Regras de Prioridade</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="prioritizeSpecialNeeds"
                    checked={config.prioritizeSpecialNeeds}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, prioritizeSpecialNeeds: !!checked })
                    }
                  />
                  <Label htmlFor="prioritizeSpecialNeeds">Priorizar PcD (Prioridade 1)</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="prioritizeElders"
                    checked={config.prioritizeElders}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, prioritizeElders: !!checked })
                    }
                  />
                  <Label htmlFor="prioritizeElders">Priorizar Idosos (Prioridade 2)</Label>
                </div>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">ℹ️ Como funciona</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Participantes são organizados em filas por prioridade</li>
                <li>• Testa TODAS as combinações de filtros antes do fallback</li>
                <li>• Reprocessamento automático quando esgota categoria</li>
                <li>• Sorteio aleatório quando há múltiplas vagas compatíveis</li>
              </ul>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsConfigOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => setIsConfigOpen(false)} className="gradient-primary text-white">
                Salvar Configurações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};