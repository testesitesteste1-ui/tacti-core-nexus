// utils/publicResults.ts
import { ref, set, get } from 'firebase/database';
import { database } from '@/config/firebase';
import { LotterySession, Participant, ParkingSpot } from '@/types/lottery';

/**
 * Interface para dados públicos do sorteio
 */
export interface PublicLotteryData {
    building: string;
    buildingName: string;
    sessionName: string;
    date: string;
    totalParticipants: number;
    totalSpots: number;
    company?: string;
    publishedAt: string;
    publishedBy: string;
    results: Array<{
        id: string;
        participantSnapshot: {
            block: string;
            unit: string;
            name: string;
            hasLargeCar?: boolean;
            prefersCovered?: boolean;
            prefersUncovered?: boolean;
            prefersLinkedSpot?: boolean;
            prefersUnlinkedSpot?: boolean;
            numberOfSpots?: number;
        };
        spotSnapshot: {
            number: string;
            floor: string;
            type: string[];
            size: string;
            isCovered: boolean;
            isUncovered: boolean;
        } | null;
        priority: 'normal' | 'elderly' | 'special-needs' | 'up-to-date';
        timestamp: string;
    }>;
}

/**
 * Tipo de retorno para operações assíncronas
 */
export interface OperationResult {
    success: boolean;
    error?: string;
    data?: any;
}

/**
 * Busca informações de um participante pelo ID
 */
const findParticipantData = (
    participantId: string,
    participants: Participant[]
) => {
    const participant = participants.find(p => p.id === participantId);
    return {
        block: participant?.block || '',
        unit: participant?.unit || '',
        name: participant?.name || 'N/A',
        hasLargeCar: participant?.hasLargeCar || false,
        prefersCovered: participant?.prefersCovered || false,
        prefersUncovered: participant?.prefersUncovered || false,
        prefersLinkedSpot: participant?.prefersLinkedSpot || false,
        prefersUnlinkedSpot: participant?.prefersUnlinkedSpot || false,
        numberOfSpots: participant?.numberOfSpots || 1,
    };
};

/**
 * Valida os dados da sessão antes de salvar
 */
const validateSessionData = (session: LotterySession): OperationResult => {
    if (!session.buildingId) {
        return {
            success: false,
            error: 'ID do condomínio não encontrado'
        };
    }

    if (!session.results || session.results.length === 0) {
        return {
            success: false,
            error: 'Nenhum resultado para publicar'
        };
    }

    return { success: true };
};

/**
 * Normaliza a prioridade para o padrão correto
 * Agrupa 'up-to-date' com 'normal' para simplificar filtros
 */
const normalizePriority = (priority: string): 'normal' | 'elderly' | 'special-needs' => {
    if (priority === 'elderly') return 'elderly';
    if (priority === 'special-needs') return 'special-needs';
    // 'up-to-date' e 'normal' são tratados como 'normal'
    return 'normal';
};

/**
 * Salva os resultados públicos no Firebase
 * Esta função deve ser chamada após concluir um sorteio
 * 
 * @param session - Sessão do sorteio com todos os resultados
 * @param buildingName - Nome do condomínio
 * @param participants - Lista de participantes
 * @param parkingSpots - Lista de vagas disponíveis
 * @param company - Nome da empresa (opcional)
 * @returns Promise com resultado da operação
 */
export const savePublicResults = async (
    session: LotterySession,
    buildingName: string,
    participants: Participant[],
    parkingSpots: ParkingSpot[],
    company?: string
): Promise<OperationResult> => {
    try {
        // Validar dados da sessão
        const validation = validateSessionData(session);
        if (!validation.success) {
            console.error('❌ Validação falhou:', validation.error);
            return validation;
        }

        // Validar autenticação
        const { auth } = await import('@/config/firebase');
        const currentUser = auth.currentUser;

        if (!currentUser) {
            console.error('❌ Usuário não autenticado');
            return {
                success: false,
                error: 'Você precisa estar autenticado para publicar resultados'
            };
        }

        console.log('📋 Dados recebidos:', {
            buildingId: session.buildingId,
            buildingName,
            resultsCount: session.results?.length || 0,
            hasParticipants: participants?.length > 0,
            hasParkingSpots: parkingSpots?.length > 0
        });

        // Preparar dados públicos com validações rigorosas
        const publicData: PublicLotteryData = {
            building: session.buildingId || '',
            buildingName: buildingName || 'Condomínio',
            sessionName: session.name || 'Sorteio',
            date: session.date ? session.date.toISOString() : new Date().toISOString(),
            totalParticipants: session.participants?.length || 0,
            totalSpots: session.availableSpots?.length || 0,
            publishedAt: new Date().toISOString(),
            publishedBy: currentUser.email || 'unknown',
            ...(company && { company }),
            results: session.results.map((result) => {
                // Buscar dados completos do participante
                const participant = participants.find(p => p.id === result.participantId);
                
                // Validar e normalizar participantSnapshot com todas as preferências
                const participantSnapshotBase = participant ? {
                    block: participant.block || '',
                    unit: participant.unit || '',
                    name: participant.name || 'N/A',
                    hasLargeCar: participant.hasLargeCar || false,
                    prefersCovered: participant.prefersCovered || false,
                    prefersUncovered: participant.prefersUncovered || false,
                    prefersLinkedSpot: participant.prefersLinkedSpot || false,
                    prefersUnlinkedSpot: participant.prefersUnlinkedSpot || false,
                    numberOfSpots: participant.numberOfSpots || 1,
                } : (result.participantSnapshot ? {
                    block: result.participantSnapshot.block || '',
                    unit: result.participantSnapshot.unit || '',
                    name: result.participantSnapshot.name || 'N/A',
                    hasLargeCar: false,
                    prefersCovered: false,
                    prefersUncovered: false,
                    prefersLinkedSpot: false,
                    prefersUnlinkedSpot: false,
                    numberOfSpots: 1,
                } : findParticipantData(result.participantId, participants));

                // Montar snapshot da vaga SEMPRE a partir do parkingSpotId atual
                let spotSnapshot = null;

                // Tentar pegar a vaga atualizada pela parkingSpotId
                const currentSpot = parkingSpots.find(s => s.id === result.parkingSpotId);

                if (currentSpot) {
                    const normalizedType = Array.isArray(currentSpot.type)
                        ? currentSpot.type
                        : currentSpot.type
                            ? [currentSpot.type as any]
                            : ['Vaga Comum'];

                    spotSnapshot = {
                        number: currentSpot.number || '',
                        floor: currentSpot.floor || 'Piso Único',
                        type: normalizedType,
                        size: currentSpot.size || 'M',
                        isCovered: Boolean(currentSpot.isCovered),
                        isUncovered: Boolean(currentSpot.isUncovered),
                    };
                } else if (result.spotSnapshot) {
                    // Fallback: usar snapshot antigo se não encontrar a vaga atual
                    let normalizedType: string[];

                    if (result.spotSnapshot.type) {
                        if (Array.isArray(result.spotSnapshot.type)) {
                            normalizedType = result.spotSnapshot.type;
                        } else if (typeof result.spotSnapshot.type === 'string') {
                            normalizedType = [result.spotSnapshot.type];
                        } else {
                            normalizedType = ['Vaga Comum'];
                        }
                    } else {
                        normalizedType = ['Vaga Comum'];
                    }

                    const isCovered = Boolean(result.spotSnapshot.isCovered);
                    const isUncovered = Boolean((result.spotSnapshot as any).isUncovered);

                    spotSnapshot = {
                        number: result.spotSnapshot.number || '',
                        floor: result.spotSnapshot.floor || '',
                        type: normalizedType,
                        size: result.spotSnapshot.size || 'M',
                        isCovered,
                        isUncovered,
                    };
                }

                // Manter a prioridade original (não normalizar ao salvar)
                const originalPriority = result.priority || 'normal';

                return {
                    id: result.id || `result-${Date.now()}-${Math.random()}`,
                    participantSnapshot: participantSnapshotBase,
                    spotSnapshot,
                    priority: originalPriority,
                    timestamp: result.timestamp
                        ? (result.timestamp instanceof Date
                            ? result.timestamp.toISOString()
                            : new Date(result.timestamp).toISOString())
                        : new Date().toISOString(),
                };
            }),
        };

        // Validação final antes de salvar
        if (!publicData.building) {
            console.error('❌ Building ID está vazio após preparação');
            return {
                success: false,
                error: 'ID do condomínio inválido'
            };
        }

        console.log('📤 Salvando resultados públicos...', {
            buildingId: publicData.building,
            resultsCount: publicData.results.length,
            userEmail: currentUser.email,
            sampleResult: publicData.results[0],
            priorities: publicData.results.map(r => r.priority)
        });

        // Salvar no caminho público
        const publicRef = ref(database, `public/results/${session.buildingId}`);
        await set(publicRef, publicData);

        console.log('✅ Resultados públicos salvos com sucesso');
        return {
            success: true,
            data: { buildingId: session.buildingId }
        };

    } catch (error: any) {
        console.error('❌ Erro ao salvar resultados públicos:', error);
        console.error('Stack trace:', error.stack);

        // Tratar erros específicos do Firebase
        if (error.code === 'PERMISSION_DENIED') {
            return {
                success: false,
                error: 'Sem permissão para publicar. Verifique as regras do Firebase.'
            };
        }

        if (error.code === 'NETWORK_ERROR') {
            return {
                success: false,
                error: 'Erro de conexão. Verifique sua internet e tente novamente.'
            };
        }

        return {
            success: false,
            error: error.message || 'Erro desconhecido ao publicar resultados'
        };
    }
};

/**
 * Busca os resultados públicos de um condomínio
 * Esta função pode ser chamada sem autenticação
 * 
 * @param buildingId - ID do condomínio
 * @returns Promise com os dados públicos ou null se não existir
 */
export const fetchPublicResults = async (
    buildingId: string
): Promise<PublicLotteryData | null> => {
    try {
        if (!buildingId) {
            throw new Error('ID do condomínio é obrigatório');
        }

        console.log('🔍 Buscando resultados públicos para:', buildingId);

        const publicRef = ref(database, `public/results/${buildingId}`);
        const snapshot = await get(publicRef);

        if (snapshot.exists()) {
            const data = snapshot.val() as PublicLotteryData;
            console.log('✅ Resultados encontrados:', {
                totalResults: data.results.length,
                priorities: data.results.map(r => r.priority),
                sampleResult: data.results[0]
            });
            return data;
        }

        console.log('ℹ️ Nenhum resultado público encontrado');
        return null;

    } catch (error: any) {
        console.error('❌ Erro ao buscar resultados públicos:', error);
        throw new Error(
            `Falha ao buscar resultados: ${error.message || 'Erro desconhecido'}`
        );
    }
};

/**
 * Verifica se existem resultados públicos para um condomínio
 * 
 * @param buildingId - ID do condomínio
 * @returns Promise com boolean indicando se existem resultados
 */
export const hasPublicResults = async (buildingId: string): Promise<boolean> => {
    try {
        if (!buildingId) {
            return false;
        }

        const data = await fetchPublicResults(buildingId);
        return data !== null && data.results.length > 0;

    } catch (error) {
        console.error('❌ Erro ao verificar resultados públicos:', error);
        return false;
    }
};

/**
 * Formata a data para exibição no padrão brasileiro
 * 
 * @param dateString - String ISO da data
 * @returns Data formatada em pt-BR
 */
export const formatLotteryDate = (dateString: string): string => {
    try {
        const date = new Date(dateString);

        if (isNaN(date.getTime())) {
            return 'Data inválida';
        }

        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch (error) {
        console.error('❌ Erro ao formatar data:', error);
        return 'Data inválida';
    }
};

/**
 * Deleta os resultados públicos de um condomínio
 * Requer autenticação de administrador
 * 
 * @param buildingId - ID do condomínio
 * @returns Promise com resultado da operação
 */
export const deletePublicResults = async (
    buildingId: string
): Promise<OperationResult> => {
    try {
        const { auth } = await import('@/config/firebase');
        const currentUser = auth.currentUser;

        if (!currentUser) {
            return {
                success: false,
                error: 'Autenticação necessária para deletar resultados'
            };
        }

        const publicRef = ref(database, `public/results/${buildingId}`);
        await set(publicRef, null);

        console.log('🗑️ Resultados públicos deletados:', buildingId);
        return { success: true };

    } catch (error: any) {
        console.error('❌ Erro ao deletar resultados:', error);
        return {
            success: false,
            error: error.message || 'Erro ao deletar resultados'
        };
    }
};

/**
 * Obtém estatísticas de prioridades dos resultados
 * Ordem: PcD, Idoso, Comum
 * IMPORTANTE: 'normal' e 'up-to-date' são agrupados como 'comum'
 * 
 * @param results - Array de resultados
 * @returns Objeto com contagem de cada prioridade
 */
export const getPriorityStats = (results: PublicLotteryData['results']) => {
    const stats = {
        'special-needs': 0,
        'elderly': 0,
        'normal': 0,
    };

    results.forEach(result => {
        // Normalizar prioridade para consistência
        const priority = normalizePriority(result.priority);
        if (priority in stats) {
            stats[priority]++;
        }
    });

    return {
        pcd: stats['special-needs'],
        idoso: stats['elderly'],
        comum: stats['normal']
    };
};

/**
 * Verifica se um resultado pertence à categoria "comum"
 * Útil para filtros
 * 
 * @param priority - Prioridade do resultado
 * @returns true se for comum (normal ou up-to-date)
 */
export const isCommonPriority = (priority: string): boolean => {
    return priority === 'normal' || priority === 'up-to-date';
};

/**
 * Filtra resultados por prioridade
 * 
 * @param results - Array de resultados
 * @param priorityFilter - Filtro de prioridade ('all', 'special-needs', 'elderly', 'normal', 'comum')
 * @returns Array filtrado
 */
export const filterResultsByPriority = (
    results: PublicLotteryData['results'],
    priorityFilter: 'all' | 'special-needs' | 'elderly' | 'normal' | 'comum'
) => {
    if (priorityFilter === 'all') {
        return results;
    }

    // Se o filtro for 'comum', normalizar para 'normal'
    const filterToUse = priorityFilter === 'comum' ? 'normal' : priorityFilter;

    return results.filter(result => {
        const normalizedPriority = normalizePriority(result.priority);

        // Debug log para ver o que está sendo filtrado
        console.log('🔍 Filtrando:', {
            originalPriority: result.priority,
            normalizedPriority,
            filterToUse,
            match: normalizedPriority === filterToUse
        });

        return normalizedPriority === filterToUse;
    });
};

/**
 * Obtém o label correto para exibição da prioridade
 * 
 * @param priority - Prioridade do resultado
 * @returns Label formatado
 */
export const getPriorityLabel = (priority: string): string => {
    const normalized = normalizePriority(priority);

    switch (normalized) {
        case 'special-needs':
            return 'PcD';
        case 'elderly':
            return 'Idoso';
        case 'normal':
            return 'Comum';
        default:
            return 'Comum';
    }
};

/**
 * Interface para dados parciais do sorteio de escolha (em andamento)
 */
export interface ChoiceLotteryLiveData {
    building: string;
    buildingName: string;
    sessionName: string;
    company?: string;
    status: 'drawing' | 'in_progress' | 'completed';
    startedAt: string;
    updatedAt: string;
    currentTurnIndex: number;
    totalParticipants: number;
    completedCount: number;
    drawnOrder: Array<{
        id: string;
        drawOrder: number;
        block: string;
        unit: string;
        name: string;
        status: 'waiting' | 'choosing' | 'completed' | 'skipped';
        hasSpecialNeeds: boolean;
        isElderly: boolean;
        hasSmallCar?: boolean;
        hasLargeCar?: boolean;
        hasMotorcycle?: boolean;
        prefersCommonSpot?: boolean;
        prefersCovered?: boolean;
        prefersUncovered?: boolean;
        prefersLinkedSpot?: boolean;
        prefersUnlinkedSpot?: boolean;
        prefersSmallSpot?: boolean;
        numberOfSpots: number;
        allocatedSpots: Array<{
            id: string;
            number: string;
            floor: string;
            type: string[];
            size: string;
            isCovered: boolean;
            isUncovered: boolean;
        }>;
    }>;
}

/**
 * Salva os dados do sorteio de escolha em tempo real no Firebase
 * Chamado quando o sorteio inicia e a cada vaga selecionada
 */
export const saveChoiceLotteryLive = async (
    buildingId: string,
    buildingName: string,
    sessionName: string,
    drawnOrder: any[],
    currentTurnIndex: number,
    status: 'drawing' | 'in_progress' | 'completed',
    company?: string
): Promise<OperationResult> => {
    try {
        const { auth } = await import('@/config/firebase');
        const currentUser = auth.currentUser;

        if (!currentUser) {
            return {
                success: false,
                error: 'Usuário não autenticado'
            };
        }

        const completedCount = drawnOrder.filter(p => 
            p.status === 'completed' || (p.allocatedSpots && p.allocatedSpots.length > 0)
        ).length;

        const liveData: ChoiceLotteryLiveData = {
            building: buildingId,
            buildingName: buildingName,
            sessionName: sessionName || 'Sorteio de Escolha',
            company: company,
            status: status,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentTurnIndex: currentTurnIndex,
            totalParticipants: drawnOrder.length,
            completedCount: completedCount,
            drawnOrder: drawnOrder.map((p: any) => ({
                id: p.id,
                drawOrder: p.drawOrder,
                block: p.block || '',
                unit: p.unit || '',
                name: p.name || '',
                status: p.status,
                hasSpecialNeeds: p.hasSpecialNeeds || false,
                isElderly: p.isElderly || false,
                hasSmallCar: p.hasSmallCar || false,
                hasLargeCar: p.hasLargeCar || false,
                hasMotorcycle: p.hasMotorcycle || false,
                prefersCommonSpot: p.prefersCommonSpot || false,
                prefersCovered: p.prefersCovered || false,
                prefersUncovered: p.prefersUncovered || false,
                prefersLinkedSpot: p.prefersLinkedSpot || false,
                prefersUnlinkedSpot: p.prefersUnlinkedSpot || false,
                prefersSmallSpot: p.prefersSmallSpot || false,
                numberOfSpots: p.numberOfSpots || 1,
                allocatedSpots: (p.allocatedSpots || []).map((spot: any) => ({
                    id: spot.id,
                    number: spot.number || '',
                    floor: spot.floor || 'Piso Único',
                    type: Array.isArray(spot.type) ? spot.type : (spot.type ? [spot.type] : ['Vaga Comum']),
                    size: spot.size || 'M',
                    isCovered: Boolean(spot.isCovered),
                    isUncovered: Boolean(spot.isUncovered),
                })),
            })),
        };

        console.log('📡 Atualizando sorteio de escolha em tempo real:', {
            status,
            currentTurn: currentTurnIndex + 1,
            completed: completedCount,
            total: drawnOrder.length
        });

        const liveRef = ref(database, `public/live/${buildingId}`);
        await set(liveRef, liveData);

        return { success: true };
    } catch (error: any) {
        console.error('❌ Erro ao salvar sorteio ao vivo:', error);
        return {
            success: false,
            error: error.message || 'Erro ao salvar dados ao vivo'
        };
    }
};

/**
 * Remove os dados do sorteio ao vivo (quando finaliza)
 */
export const clearChoiceLotteryLive = async (buildingId: string): Promise<OperationResult> => {
    try {
        const liveRef = ref(database, `public/live/${buildingId}`);
        await set(liveRef, null);
        console.log('🧹 Dados ao vivo removidos');
        return { success: true };
    } catch (error: any) {
        console.error('❌ Erro ao limpar dados ao vivo:', error);
        return {
            success: false,
            error: error.message
        };
    }
};