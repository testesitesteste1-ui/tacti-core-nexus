import React, { useEffect, useState, useMemo } from 'react';
import { fetchPublicResults, PublicLotteryData, formatLotteryDate, ChoiceLotteryLiveData } from '@/utils/publicResults';
import { generateLotteryPDF } from '@/utils/pdfGenerator';
import { ParkingSpot, SpotType } from '@/types/lottery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  MapPin,
  Users,
  Trophy,
  Clock,
  Building2,
  Download,
  Share2,
  Search,
  Filter,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  TrendingUp,
  Grid3x3,
  User,
  ParkingCircle,
  Radio,
  Loader2
} from 'lucide-react';
import exeventosLogo from '@/assets/exeventos-logo.png';
import mageventosLogo from '@/assets/mageventos-logo.jpg';

interface Props {
  buildingId?: string;
}

type PriorityType = 'normal' | 'elderly' | 'special-needs' | 'up-to-date';
type ParticipantFilter = 'all' | 'special-needs' | 'elderly' | 'others';
type SpotTypeFilter = 'all' | 'pcd' | 'idoso' | 'others';

export const PublicResultsPage: React.FC<Props> = ({ buildingId }) => {
  const [data, setData] = useState<PublicLotteryData | null>(null);
  const [liveData, setLiveData] = useState<ChoiceLotteryLiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState<ParticipantFilter>('all');
  const [filterSpotType, setFilterSpotType] = useState<SpotTypeFilter>('all');
  const [filterBlock, setFilterBlock] = useState<string>('all');

  useEffect(() => {
    if (!buildingId) return;

    setLoading(true);
    setError(null);

    let unsubscribeResults: (() => void) | null = null;
    let unsubscribeLive: (() => void) | null = null;

    // 🔥 Configurar listeners em tempo real
    const setupListeners = async () => {
      const { database } = await import('@/config/firebase');
      const { ref, onValue } = await import('firebase/database');

      // Listener para resultados finais
      const publicRef = ref(database, `public/results/${buildingId}`);
      unsubscribeResults = onValue(publicRef, (snapshot) => {
        if (snapshot.exists()) {
          const publicData = snapshot.val() as PublicLotteryData;
          console.log('🔥 RESULTADOS ATUALIZADOS:', {
            publishedAt: publicData.publishedAt,
            resultsCount: publicData.results.length
          });
          setData(publicData);
          setError(null);
        } else {
          setData(null);
        }
        setLoading(false);
      }, (error) => {
        console.error('❌ Erro no listener de resultados:', error);
        setLoading(false);
      });

      // Listener para sorteio ao vivo
      const liveRef = ref(database, `public/live/${buildingId}`);
      unsubscribeLive = onValue(liveRef, (snapshot) => {
        if (snapshot.exists()) {
          const live = snapshot.val() as ChoiceLotteryLiveData;
          console.log('📡 SORTEIO AO VIVO:', {
            status: live.status,
            currentTurn: live.currentTurnIndex + 1,
            completed: live.completedCount,
            total: live.totalParticipants
          });
          setLiveData(live);
          setError(null);
        } else {
          setLiveData(null);
        }
        setLoading(false);
      }, (error) => {
        console.error('❌ Erro no listener ao vivo:', error);
      });
    };

    setupListeners();

    // Cleanup - remove os listeners quando o componente desmontar
    return () => {
      if (unsubscribeResults) {
        console.log('🧹 Removendo listener de resultados');
        unsubscribeResults();
      }
      if (unsubscribeLive) {
        console.log('🧹 Removendo listener ao vivo');
        unsubscribeLive();
      }
    };
  }, [buildingId]);

  // Extrair blocos únicos para filtro
  const uniqueBlocks = useMemo(() => {
    if (!data) return [];
    const blocks = new Set(
      data.results.map(r => r.participantSnapshot.block).filter(Boolean)
    );
    return Array.from(blocks).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true })
    );
  }, [data]);

  // Filtrar e buscar resultados
  const filteredResults = useMemo(() => {
    if (!data) return [];

    let filtered = [...data.results];

    // Filtro por prioridade e preferências
    if (filterPriority !== 'all') {
      filtered = filtered.filter(r => {
        switch (filterPriority) {
          case 'special-needs':
            return r.priority === 'special-needs';
          case 'elderly':
            return r.priority === 'elderly';
          case 'others':
            return r.priority !== 'special-needs' && r.priority !== 'elderly';
          default:
            return true;
        }
      });
    }

    // Filtro por tipo de vaga
    if (filterSpotType !== 'all') {
      filtered = filtered.filter(r => {
        if (!r.spotSnapshot) return false;
        
        switch (filterSpotType) {
          case 'pcd':
            return r.spotSnapshot.type.includes('Vaga PcD');
          case 'idoso':
            return r.spotSnapshot.type.includes('Vaga Idoso');
          case 'others':
            return !r.spotSnapshot.type.includes('Vaga PcD') && !r.spotSnapshot.type.includes('Vaga Idoso');
          default:
            return true;
        }
      });
    }

    // Filtro por bloco
    if (filterBlock !== 'all') {
      filtered = filtered.filter(r => r.participantSnapshot.block === filterBlock);
    }

    // Busca por nome, bloco ou unidade
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.participantSnapshot.name.toLowerCase().includes(term) ||
        r.participantSnapshot.block.toLowerCase().includes(term) ||
        r.participantSnapshot.unit.toLowerCase().includes(term) ||
        r.spotSnapshot?.number.toLowerCase().includes(term)
      );
    }

    // Ordenar por bloco e unidade
    return filtered.sort((a, b) => {
      const blockCompare = a.participantSnapshot.block.localeCompare(
        b.participantSnapshot.block,
        'pt-BR',
        { numeric: true }
      );
      if (blockCompare !== 0) return blockCompare;

      return a.participantSnapshot.unit.localeCompare(
        b.participantSnapshot.unit,
        'pt-BR',
        { numeric: true }
      );
    });
  }, [data, searchTerm, filterPriority, filterSpotType, filterBlock]);

  // Estatísticas
  const stats = useMemo(() => {
    if (!data) return null;

    return {
      total: data.results.length,
      withSpots: data.results.filter(r => r.spotSnapshot !== null).length,
      pcd: data.results.filter(r => r.priority === 'special-needs').length,
      elderly: data.results.filter(r => r.priority === 'elderly').length,
      // "Comum" inclui tanto 'normal' quanto 'up-to-date'
      normal: data.results.filter(r => r.priority === 'normal' || r.priority === 'up-to-date').length,
      upToDate: data.results.filter(r => r.priority === 'up-to-date').length,
    };
  }, [data]);

  // Tema da empresa
  const companyTheme = useMemo(() => {
    const company = data?.company || 'exvagas';

    if (company === 'mageventos') {
      return {
        name: 'Mag Eventos',
        logo: mageventosLogo,
        gradient: 'from-purple-600 via-pink-600 to-rose-600',
        accent: 'purple',
        bgPattern: 'bg-purple-50',
      };
    }

    // Default: exvagas ou exeventos
    return {
      name: 'Ex Eventos',
      logo: exeventosLogo,
      gradient: 'from-blue-600 via-indigo-600 to-purple-600',
      accent: 'blue',
      bgPattern: 'bg-blue-50',
    };
  }, [data?.company]);

  // Função para obter badge de prioridade
  const getPriorityBadge = (priority: PriorityType) => {
    const badges = {
      'special-needs': {
        label: 'PcD',
        variant: 'pcd' as const,
        icon: <AlertCircle className="w-3 h-3" />,
      },
      'elderly': {
        label: 'Idoso',
        variant: 'elderly' as const,
        icon: <User className="w-3 h-3" />,
      },
    };

    const badge = badges[priority as keyof typeof badges];
    
    if (!badge) {
      return null;
    }
    
    return (
      <Badge variant={badge.variant} className="inline-flex items-center gap-1">
        {badge.icon}
        {badge.label}
      </Badge>
    );
  };

  // Função de compartilhar
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Resultados do Sorteio - ${data?.buildingName}`,
          text: `Confira os resultados do sorteio de vagas`,
          url: url,
        });
      } catch (err) {
        console.log('Compartilhamento cancelado');
      }
    } else {
      navigator.clipboard.writeText(url);
      alert('Link copiado para a área de transferência!');
    }
  };

  // Função de download PDF
  const handleDownload = () => {
    if (!data) return;

    // Preparar os dados para o PDF no formato esperado
    const resultsForPDF = data.results.map((result, index) => ({
      id: result.id,
      participantId: result.id,
      parkingSpotId: result.spotSnapshot ? `spot-${index}` : null,
      priority: result.priority,
      timestamp: new Date(result.timestamp),
      participantSnapshot: {
        name: result.participantSnapshot.name,
        block: result.participantSnapshot.block,
        unit: result.participantSnapshot.unit,
      },
      spotSnapshot: result.spotSnapshot ? {
        number: result.spotSnapshot.number,
        floor: result.spotSnapshot.floor as ParkingSpot['floor'],
        type: result.spotSnapshot.type,
        size: result.spotSnapshot.size as ParkingSpot['size'],
        isCovered: result.spotSnapshot.isCovered,
        isUncovered: result.spotSnapshot.isUncovered,
      } : null,
    } as any));

    // Preparar participantes no formato esperado
    const participantsForPDF = data.results.map(result => ({
      id: result.id,
      buildingId: data.building,
      name: result.participantSnapshot.name,
      block: result.participantSnapshot.block,
      unit: result.participantSnapshot.unit,
      hasSpecialNeeds: result.priority === 'special-needs',
      isElderly: result.priority === 'elderly',
      isUpToDate: result.priority === 'up-to-date',
      priority: result.priority,
      hasLargeCar: result.participantSnapshot.hasLargeCar || false,
      prefersCovered: result.participantSnapshot.prefersCovered || false,
      prefersUncovered: result.participantSnapshot.prefersUncovered || false,
      prefersLinkedSpot: result.participantSnapshot.prefersLinkedSpot || false,
      prefersUnlinkedSpot: result.participantSnapshot.prefersUnlinkedSpot || false,
      numberOfSpots: result.participantSnapshot.numberOfSpots || 1,
      createdAt: new Date(result.timestamp),
    } as any));

    // Preparar vagas no formato esperado
    const spotsForPDF = data.results
      .filter(result => result.spotSnapshot)
      .map((result, index) => ({
        id: `spot-${index}`,
        buildingId: data.building,
        number: result.spotSnapshot!.number,
        floor: result.spotSnapshot!.floor as ParkingSpot['floor'],
        type: result.spotSnapshot!.type as SpotType[],
        size: result.spotSnapshot!.size as ParkingSpot['size'],
        status: 'occupied' as const,
        isCovered: result.spotSnapshot!.isCovered,
        isUncovered: result.spotSnapshot!.isUncovered,
        position: { x: 0, y: 0 },
        createdAt: new Date(),
      }));

    generateLotteryPDF(
      data.sessionName,
      resultsForPDF,
      participantsForPDF,
      spotsForPDF,
      (data.company || 'exvagas') as 'exvagas' | 'mageventos',
      data.buildingName
    );
  };

  // Estados de loading e erro
  if (!buildingId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              ID não fornecido
            </h3>
            <p className="text-gray-600">
              O ID do condomínio não foi fornecido na URL.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header Skeleton */}
          <div className="bg-gradient-to-r from-gray-300 to-gray-400 rounded-2xl h-64 mb-8 animate-pulse" />

          {/* Stats Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-xl h-24 animate-pulse" />
            ))}
          </div>

          {/* Results Skeleton */}
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl h-32 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 📡 MOSTRAR SORTEIO AO VIVO (prioridade sobre resultados finais)
  if (liveData && liveData.status === 'in_progress') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200">
        {/* Header Ao Vivo */}
        <div className="bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }} />
          </div>

          <div className="max-w-7xl mx-auto px-6 py-12 relative">
            <div className="flex flex-col items-center text-center">
              {/* Logo da Empresa */}
              <div className="bg-white rounded-xl p-3 mb-6 shadow-lg">
                <img 
                  src={liveData.company === 'mageventos' ? mageventosLogo : exeventosLogo}
                  alt={`Logo ${liveData.company === 'mageventos' ? 'Mageventos' : 'ExEventos'}`}
                  className="h-12 md:h-16 object-contain"
                />
              </div>

              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full mb-4 animate-pulse">
                <Radio className="w-4 h-4" />
                <span className="text-sm font-bold uppercase tracking-wider">Ao Vivo</span>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold mb-3 drop-shadow-lg">
                Sorteio em Andamento
              </h1>

              <div className="flex items-center gap-2 text-white/90">
                <Building2 className="w-5 h-5" />
                <span className="text-xl font-semibold">{liveData.buildingName}</span>
              </div>

              <p className="mt-4 text-white/80 text-sm">
                {liveData.sessionName}
              </p>
            </div>
          </div>
        </div>

        {/* Progresso */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          <Card className="mb-6 border-red-200 bg-gradient-to-r from-red-50 to-orange-50">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-red-500 p-3 rounded-full animate-pulse">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-red-900">
                      Vez: {liveData.currentTurnIndex + 1}º participante
                    </p>
                    <p className="text-sm text-red-700">
                      {liveData.completedCount} de {liveData.totalParticipants} já escolheram
                    </p>
                  </div>
                </div>
                <div className="w-full md:w-64">
                  <div className="w-full bg-red-200 rounded-full h-3">
                    <div 
                      className="bg-red-500 h-3 rounded-full transition-all duration-500" 
                      style={{ width: `${(liveData.completedCount / liveData.totalParticipants) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-red-600 mt-1 text-right">
                    {Math.round((liveData.completedCount / liveData.totalParticipants) * 100)}% concluído
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Participantes ao Vivo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Ordem do Sorteio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {liveData.drawnOrder.map((participant, index) => (
                  <div 
                    key={participant.id}
                    className={`p-4 rounded-lg border transition-all ${
                      participant.status === 'choosing' 
                        ? 'bg-red-50 border-red-300 ring-2 ring-red-400 animate-pulse' 
                        : participant.status === 'completed'
                        ? 'bg-green-50 border-green-200'
                        : participant.status === 'skipped'
                        ? 'bg-orange-50 border-orange-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`font-bold text-lg w-8 h-8 rounded-full flex items-center justify-center ${
                          participant.status === 'choosing'
                            ? 'bg-red-500 text-white'
                            : participant.status === 'completed'
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-300 text-gray-700'
                        }`}>
                          {participant.drawOrder}
                        </span>
                        <div>
                          <p className="font-medium">
                            {participant.block && `Bloco ${participant.block} - `}Unidade {participant.unit}
                          </p>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {/* Prioridades - Inadimplente é OCULTO visualmente */}
                            {participant.hasSpecialNeeds && <Badge variant="pcd" className="text-xs">PcD</Badge>}
                            {participant.isElderly && <Badge variant="elderly" className="text-xs">Idoso</Badge>}
                            {/* Veículos */}
                            {participant.hasSmallCar && <Badge variant="small" className="text-xs">Veículo Pequeno</Badge>}
                            {participant.hasLargeCar && <Badge variant="large" className="text-xs">Veículo Grande</Badge>}
                            {participant.hasMotorcycle && <Badge variant="motorcycle" className="text-xs">Motocicleta</Badge>}
                            {/* Preferências */}
                            {participant.prefersCommonSpot && <Badge variant="common" className="text-xs">Pref. Vaga Comum</Badge>}
                            {participant.prefersCovered && <Badge variant="covered" className="text-xs">Pref. Coberta</Badge>}
                            {participant.prefersUncovered && <Badge variant="uncovered" className="text-xs">Pref. Descoberta</Badge>}
                            {participant.prefersLinkedSpot && <Badge variant="linked" className="text-xs">Pref. Presa</Badge>}
                            {participant.prefersUnlinkedSpot && <Badge variant="unlinked" className="text-xs">Pref. Livre</Badge>}
                            {participant.prefersSmallSpot && <Badge variant="small" className="text-xs">Pref. Pequena</Badge>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {participant.status === 'choosing' && (
                          <Badge className="bg-red-500 text-white animate-pulse">
                            Escolhendo...
                          </Badge>
                        )}
                        {participant.status === 'completed' && participant.allocatedSpots.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {participant.allocatedSpots.map((spot, i) => (
                              <Badge key={i} variant="secondary" className="bg-green-100 text-green-800">
                                🅿️ {spot.number}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {participant.status === 'skipped' && (
                          <Badge variant="outline" className="border-orange-400 text-orange-600">
                            Ausente
                          </Badge>
                        )}
                        {participant.status === 'waiting' && (
                          <Badge variant="outline" className="text-gray-500">
                            Aguardando
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || (!data && !liveData)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Aguardando próximo sorteio
            </h3>
            <p className="text-gray-600">
              Os resultados do sorteio para este condomínio ainda não foram publicados.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Aguardando próximo sorteio
            </h3>
            <p className="text-gray-600">
              Os resultados do sorteio para este condomínio ainda não foram publicados.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200">
      {/* Hero Header */}
      <div className={`bg-gradient-to-r ${companyTheme.gradient} text-white relative overflow-hidden`}>
        {/* Pattern Background */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="max-w-7xl mx-auto px-6 py-12 relative">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
            {/* Logo */}
            <div className="flex-shrink-0">
              <img
                src={companyTheme.logo}
                alt={companyTheme.name}
                className="h-24 w-auto rounded-xl p-4 shadow-2xl mix-blend-multiply"
              />
            </div>

            {/* Info */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full mb-4">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium">Resultados Oficiais</span>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold mb-3 drop-shadow-lg">
                Sorteio de Vagas
              </h1>

              <div className="flex flex-col md:flex-row items-center gap-4 text-white/90">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  <span className="text-xl font-semibold">{data.buildingName}</span>
                </div>
                <span className="hidden md:block">•</span>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  <span>{formatLotteryDate(data.date)}</span>
                </div>
              </div>

              <p className="mt-4 text-white/80 text-sm">
                {data.sessionName}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleShare}
                className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm px-4 py-2 rounded-lg transition-all"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden md:inline">Compartilhar</span>
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 bg-white hover:bg-white/90 text-gray-900 px-4 py-2 rounded-lg transition-all font-medium"
              >
                <Download className="w-4 h-4" />
                <span className="hidden md:inline">Baixar PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium mb-1">Total</p>
                  <p className="text-3xl font-bold text-blue-900">{stats?.total}</p>
                </div>
                <div className="bg-blue-500 p-3 rounded-xl">
                  <Users className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600 font-medium mb-1">Com Vagas</p>
                  <p className="text-3xl font-bold text-green-900">{stats?.withSpots}</p>
                </div>
                <div className="bg-green-500 p-3 rounded-xl">
                  <ParkingCircle className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-600 font-medium mb-1">PcD</p>
                  <p className="text-3xl font-bold text-red-900">{stats?.pcd}</p>
                </div>
                <div className="bg-red-500 p-3 rounded-xl">
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-600 font-medium mb-1">Idosos</p>
                  <p className="text-3xl font-bold text-amber-900">{stats?.elderly}</p>
                </div>
                <div className="bg-amber-500 p-3 rounded-xl">
                  <User className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium mb-1">Comum</p>
                  <p className="text-3xl font-bold text-gray-900">{stats?.normal}</p>
                </div>
                <div className="bg-gray-500 p-3 rounded-xl">
                  <Users className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, bloco, unidade ou vaga..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Filter Block */}
              <div className="relative">
                <Grid3x3 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={filterBlock}
                  onChange={(e) => setFilterBlock(e.target.value)}
                  className="pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white cursor-pointer"
                >
                  <option value="all">BLOCOS</option>
                  {uniqueBlocks.map(block => (
                    <option key={block} value={block}>Bloco {block}</option>
                  ))}
                </select>
              </div>

              {/* Filter Priority & Preferences */}
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value as ParticipantFilter)}
                  className="pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white cursor-pointer"
                >
                  <option value="all">UNIDADES</option>
                  <option value="special-needs">PcD</option>
                  <option value="elderly">Idoso</option>
                  <option value="others">Outros</option>
                </select>
              </div>

              {/* Filter Spot Type */}
              <div className="relative">
                <ParkingCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={filterSpotType}
                  onChange={(e) => setFilterSpotType(e.target.value as SpotTypeFilter)}
                  className="pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white cursor-pointer"
                >
                  <option value="all">VAGAS</option>
                  <option value="pcd">Vaga PcD</option>
                  <option value="idoso">Vaga Idoso</option>
                  <option value="others">Outros</option>
                </select>
              </div>
            </div>

            {/* Active Filters Info */}
            {(searchTerm || filterPriority !== 'all' || filterSpotType !== 'all' || filterBlock !== 'all') && (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                <Filter className="w-4 h-4" />
                <span>
                  Mostrando {filteredResults.length} de {data.results.length} resultados
                </span>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterPriority('all');
                    setFilterSpotType('all');
                    setFilterBlock('all');
                  }}
                  className="ml-auto text-blue-600 hover:text-blue-700 font-medium"
                >
                  Limpar filtros
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {filteredResults.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Nenhum resultado encontrado
              </h3>
              <p className="text-gray-600">
                Tente ajustar os filtros ou a busca para ver mais resultados.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredResults.map((result, index) => (
              <Card
                key={result.id}
                className="hover:shadow-md transition-all duration-200 border-l-4 border-l-blue-500"
              >
                <CardContent className="py-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    {/* Position Number */}
                    <div className="flex-shrink-0">
                      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base shadow-md">
                        {index + 1}°
                      </div>
                    </div>

                    {/* Participant Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-base font-bold text-gray-900 truncate">
                          {result.participantSnapshot.name}
                        </h3>
                        {getPriorityBadge(result.priority)}
                        
                        {/* Badges de preferências e características */}
                        {result.participantSnapshot.hasSmallCar && (
                          <Badge variant="small" className="text-xs">
                            Veículo Pequeno
                          </Badge>
                        )}
                        {result.participantSnapshot.hasLargeCar && (
                          <Badge variant="large" className="text-xs">
                            Veículo Grande
                          </Badge>
                        )}
                        {result.participantSnapshot.hasMotorcycle && (
                          <Badge variant="motorcycle" className="text-xs">
                            Motocicleta
                          </Badge>
                        )}
                        {result.participantSnapshot.prefersCommonSpot && (
                          <Badge variant="common" className="text-xs">
                            Pref. Vaga Comum
                          </Badge>
                        )}
                        {result.participantSnapshot.prefersCovered && (
                          <Badge variant="covered" className="text-xs">
                            Pref. Coberta
                          </Badge>
                        )}
                        {result.participantSnapshot.prefersUncovered && (
                          <Badge variant="uncovered" className="text-xs">
                            Pref. Descoberta
                          </Badge>
                        )}
                        {result.participantSnapshot.prefersLinkedSpot && (
                          <Badge variant="linked" className="text-xs">
                            Pref. Presa
                          </Badge>
                        )}
                        {result.participantSnapshot.prefersUnlinkedSpot && (
                          <Badge variant="unlinked" className="text-xs">
                            Pref. Livre
                          </Badge>
                        )}
                        {result.participantSnapshot.prefersSmallSpot && (
                          <Badge variant="small" className="text-xs">
                            Pref. Pequena
                          </Badge>
                        )}
                        {result.participantSnapshot.numberOfSpots && result.participantSnapshot.numberOfSpots > 1 && (
                          <Badge variant="outline" className="text-xs">
                            {result.participantSnapshot.numberOfSpots} Vagas
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                        <div className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5" />
                          <span>Bloco {result.participantSnapshot.block}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Grid3x3 className="w-3.5 h-3.5" />
                          <span>Unidade {result.participantSnapshot.unit}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatLotteryDate(result.timestamp)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Spot Info */}
                    <div className="flex-shrink-0">
                      {result.spotSnapshot ? (
                        <div className="bg-gradient-to-br from-emerald-100 to-emerald-200 border-2 border-emerald-400 rounded-lg p-3 min-w-[160px]">
                          <div className="flex items-center gap-1.5 mb-1">
                            <ParkingCircle className="w-4 h-4 text-emerald-700" />
                            <span className="text-xs font-medium text-emerald-800">Vaga Sorteada</span>
                          </div>
                          <div className="text-3xl font-extrabold text-emerald-950 mb-0.5">
                            {result.spotSnapshot.number}
                          </div>
                          <div className="text-xs text-green-700">
                            <div className="flex items-center gap-1 mb-1">
                              <MapPin className="w-3 h-3" />
                              {result.spotSnapshot.floor}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {result.spotSnapshot.type.map((type, i) => (
                                <Badge 
                                  key={i} 
                                  variant={
                                    type === 'Vaga Idoso' ? 'elderly' :
                                    type === 'Vaga PcD' ? 'pcd' :
                                    type === 'Vaga Grande' ? 'large' :
                                    type === 'Vaga Pequena' ? 'small' :
                                    type === 'Vaga Motocicleta' ? 'motorcycle' :
                                    type === 'Vaga Presa' ? 'linked' :
                                    type === 'Vaga Livre' ? 'unlinked' :
                                    type === 'Vaga Comum' ? 'common' :
                                    'secondary'
                                  }
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {type}
                                </Badge>
                              ))}
                              {result.spotSnapshot.isCovered && (
                                <Badge variant="covered" className="text-[10px] px-1.5 py-0">
                                  Vaga Coberta
                                </Badge>
                              )}
                              {result.spotSnapshot.isUncovered && (
                                <Badge variant="uncovered" className="text-[10px] px-1.5 py-0">
                                  Vaga Descoberta
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-3 min-w-[160px] text-center">
                          <AlertCircle className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                          <span className="text-xs text-gray-600">Sem vaga</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Footer */}
        <Card className="mt-8 bg-gradient-to-r from-gray-50 to-gray-100">
          <CardContent className="pt-6 text-center">
            <div className="mb-4">
              <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Sorteio Realizado com Sucesso
              </h3>
              <p className="text-sm text-gray-600 max-w-2xl mx-auto">
                Este sorteio foi realizado de forma transparente e aleatória, respeitando as prioridades legais.
                Todos os participantes tiveram oportunidade igual dentro de sua categoria.
              </p>
            </div>

            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="text-xs text-gray-500">
                Publicado por {data.publishedBy} em {data.publishedAt ? formatLotteryDate(data.publishedAt) : 'Data não disponível'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Sistema de Sorteio Eletrônico - {companyTheme.name}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PublicResultsPage;