import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MapPin, Maximize2, Minimize2, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { database } from '@/config/firebase';
import { ref, onValue } from 'firebase/database';
import { ChoiceLotteryLiveData } from '@/utils/publicResults';
import { cn } from '@/lib/utils';

interface FloorPlanData {
  imageUrl: string;
  markers: Record<string, { x: number; y: number }>;
}

interface Props {
  buildingId: string;
  liveData: ChoiceLotteryLiveData;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}

export const LiveFloorPlanMiniMap: React.FC<Props> = ({
  buildingId,
  liveData,
  onToggleFullscreen,
  isFullscreen = false,
}) => {
  const [floorPlans, setFloorPlans] = useState<Record<string, FloorPlanData>>({});
  const [selectedFloor, setSelectedFloor] = useState<string>('');
  const [parkingSpots, setParkingSpots] = useState<any[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [markerSize, setMarkerSize] = useState(36);

  // Load marker size
  useEffect(() => {
    if (!buildingId) return;
    const sizeRef = ref(database, `buildings/${buildingId}/markerSize`);
    const unsub = onValue(sizeRef, (snapshot) => {
      if (snapshot.exists()) setMarkerSize(snapshot.val());
    });
    return () => unsub();
  }, [buildingId]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.3, Math.min(5, z + delta)));
  }, []);

  const handlePanDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  }, [panOffset]);

  const handlePanMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return;
    setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  }, [isPanning, panStart]);

  const handlePanUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!buildingId) return;
    const plansRef = ref(database, `buildings/${buildingId}/floorPlans`);
    const unsub = onValue(plansRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setFloorPlans(data);
        const floors = Object.keys(data);
        if (floors.length > 0 && !selectedFloor) {
          setSelectedFloor(floors[0]);
        }
      }
    });
    return () => unsub();
  }, [buildingId]);

  useEffect(() => {
    if (!buildingId) return;
    const spotsRef = ref(database, `buildings/${buildingId}/parkingSpots`);
    const unsub = onValue(spotsRef, (snapshot) => {
      if (snapshot.exists()) {
        setParkingSpots(Object.values(snapshot.val()));
      }
    });
    return () => unsub();
  }, [buildingId]);

  const chosenSpotNumbers = useMemo(() => {
    if (!liveData) return new Set<string>();
    const chosen = new Set<string>();
    liveData.drawnOrder.forEach(p => {
      if (p.status === 'completed' && p.allocatedSpots) {
        p.allocatedSpots.forEach(s => {
          if (s.number) chosen.add(s.number);
        });
      }
    });
    return chosen;
  }, [liveData]);

  // Map spot number -> participant who chose it
  const spotToParticipant = useMemo(() => {
    if (!liveData) return new Map<string, { name: string; block: string; unit: string }>();
    const map = new Map<string, { name: string; block: string; unit: string }>();
    liveData.drawnOrder.forEach(p => {
      if ((p.status === 'completed' || p.status === 'choosing') && p.allocatedSpots) {
        p.allocatedSpots.forEach(s => {
          if (s.number) map.set(s.number, { name: p.name, block: p.block, unit: p.unit });
        });
      }
    });
    return map;
  }, [liveData]);

  // Spot being chosen RIGHT NOW
  const choosingSpotNumbers = useMemo(() => {
    if (!liveData) return new Set<string>();
    const choosing = new Set<string>();
    liveData.drawnOrder.forEach(p => {
      if (p.status === 'choosing' && p.allocatedSpots) {
        p.allocatedSpots.forEach(s => {
          if (s.number) choosing.add(s.number);
        });
      }
    });
    return choosing;
  }, [liveData]);

  const currentPlan = floorPlans[selectedFloor];
  const availableFloors = Object.keys(floorPlans);

  const getSpotStatus = (spotId: string) => {
    const spot = parkingSpots.find((s: any) => s.id === spotId);
    if (!spot) return 'available';
    // During live lottery, liveData is the source of truth
    if (choosingSpotNumbers.has(spot.number)) return 'choosing';
    if (chosenSpotNumbers.has(spot.number)) return 'chosen';
    // Reserved spots (pre-allocated or manually reserved)
    if (spot.status === 'reserved') return 'reserved';
    // If liveData exists (active session), don't trust parkingSpots status — it may lag
    if (liveData) return 'available';
    return spot.status || 'available';
  };

  const getSpotLabels = (spot: any): string[] => {
    const labels: string[] = [];
    if (spot.isCovered) labels.push('Coberta');
    if (spot.isUncovered) labels.push('Descoberta');
    const types: string[] = spot.type || [];
    if (types.includes('Vaga Presa') || types.includes('presa')) labels.push('Presa');
    if (types.includes('Vaga Livre') || types.includes('livre')) labels.push('Livre');
    if (types.includes('Vaga Idoso') || types.includes('idoso')) labels.push('Idoso');
    if (types.includes('Vaga PcD') || types.includes('pcd')) labels.push('PCD');
    if (types.includes('Vaga Motocicleta') || types.includes('moto')) labels.push('Moto');
    if (types.includes('Vaga Grande') || types.includes('grande')) labels.push('Grande');
    if (types.includes('Vaga Pequena') || types.includes('pequena')) labels.push('Pequena');
    if (types.includes('Vaga Comum') || types.includes('comum')) labels.push('Comum');
    return labels;
  };

  const getSpotTypeColor = (spot: any): string | null => {
    const types: string[] = spot.type || [];
    if (types.includes('Vaga PcD') || types.includes('pcd')) return 'bg-blue-700 border-blue-900';
    if (types.includes('Vaga Idoso') || types.includes('idoso')) return 'bg-orange-500 border-orange-700';
    if (types.includes('Vaga Motocicleta') || types.includes('moto')) return 'bg-rose-500 border-rose-700';
    if (types.includes('Vaga Presa') || types.includes('presa')) return 'bg-purple-500 border-purple-700';
    if (types.includes('Vaga Livre') || types.includes('livre')) return 'bg-teal-500 border-teal-700';
    if (types.includes('Vaga Grande') || types.includes('grande')) return 'bg-indigo-500 border-indigo-700';
    if (types.includes('Vaga Pequena') || types.includes('pequena')) return 'bg-cyan-500 border-cyan-700';
    if (types.includes('Vaga Comum') || types.includes('comum')) return 'bg-green-500 border-green-700';
    return null;
  };

  const getMarkerColor = (status: string, spot?: any) => {
    switch (status) {
      case 'choosing': return 'bg-yellow-400 border-yellow-600 animate-pulse';
      case 'chosen': return 'bg-red-500 border-red-700';
      case 'reserved': return 'bg-blue-500 border-blue-700';
      case 'occupied': return 'bg-orange-500 border-orange-700';
      default: return 'bg-green-500 border-green-700';
    }
  };

  if (availableFloors.length === 0) return null;

  const chosenCount = Object.keys(currentPlan?.markers || {}).filter(
    id => getSpotStatus(id) === 'chosen'
  ).length;
  const totalMarkers = Object.keys(currentPlan?.markers || {}).length;

  // PiP mini-map (bottom-right floating)
  if (!isFullscreen) {
    if (isCollapsed) {
      return (
        <div className="fixed bottom-4 right-4 z-50">
          <Button
            onClick={() => setIsCollapsed(false)}
            className="rounded-full shadow-2xl gap-2 bg-white text-foreground border border-border hover:bg-gray-50 h-12 px-4"
          >
            <MapPin className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium">Mapa ao Vivo</span>
            <Badge className="bg-red-500 text-white text-[10px] px-1.5">{chosenCount}/{totalMarkers}</Badge>
          </Button>
        </div>
      );
    }

    return (
      <div className="fixed bottom-2 right-2 left-2 md:left-auto md:bottom-4 md:right-4 z-50 w-auto md:w-[380px] bg-white rounded-xl shadow-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-semibold">Mapa ao Vivo</span>
            <Badge className="bg-red-500 text-white text-[10px] px-1.5">{chosenCount}/{totalMarkers}</Badge>
          </div>
          <div className="flex items-center gap-1">
            {onToggleFullscreen && (
              <Button variant="ghost" size="icon" className="h-7 w-7 md:h-6 md:w-6" onClick={onToggleFullscreen}>
                <Maximize2 className="h-3.5 w-3.5 md:h-3 md:w-3" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 md:h-6 md:w-6" onClick={() => setIsCollapsed(true)}>
              <Minimize2 className="h-3.5 w-3.5 md:h-3 md:w-3" />
            </Button>
          </div>
        </div>

        {/* Floor selector */}
        {availableFloors.length > 1 && (
          <div className="px-3 py-1.5 border-b">
            <Select value={selectedFloor} onValueChange={setSelectedFloor}>
              <SelectTrigger className="h-8 md:h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableFloors.map(floor => (
                  <SelectItem key={floor} value={floor} className="text-xs">{floor}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Map */}
        {currentPlan?.imageUrl ? (
          <div className="overflow-hidden max-h-[200px] md:max-h-[240px]">
            <div className="relative select-none">
              <img
                src={currentPlan.imageUrl}
                alt={`Planta - ${selectedFloor}`}
                className="w-full h-auto block"
                draggable={false}
              />
              {Object.entries(currentPlan.markers || {}).map(([spotId, pos]) => {
                const spot = parkingSpots.find((s: any) => s.id === spotId);
                if (!spot) return null;
                const status = getSpotStatus(spotId);
                return (
                  <div
                    key={spotId}
                    className={cn(
                      'absolute flex items-center justify-center rounded-full border text-white font-bold',
                      'w-3.5 h-3.5 text-[5px] md:w-4 md:h-4 md:text-[6px]',
                      getMarkerColor(status, spot),
                    )}
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    {spot.number}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Nenhuma planta disponível
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-3 items-center justify-center px-3 py-2 border-t bg-gray-50 text-[10px] flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span>Livre</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Reservada</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span>Escolhida</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
            <span>Escolhendo</span>
          </div>
        </div>
      </div>
    );
  }

  // ===== FULLSCREEN MODE (70/30 split — handled by parent) =====
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-red-500" />
          <span className="font-semibold text-sm">Planta ao Vivo</span>
          <Badge className="bg-red-500 text-white text-xs">{chosenCount}/{totalMarkers}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {availableFloors.length > 1 && (
            <Select value={selectedFloor} onValueChange={setSelectedFloor}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {availableFloors.map(floor => (
                  <SelectItem key={floor} value={floor} className="text-xs">{floor}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[10px] text-muted-foreground w-8 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(5, z + 0.1))}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleResetView}>
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
          {onToggleFullscreen && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleFullscreen}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Map */}
      <div
        className={cn("flex-1 overflow-hidden bg-gray-100", isPanning ? "cursor-grabbing" : "cursor-grab")}
        onWheel={handleWheel}
        onPointerDown={handlePanDown}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanUp}
      >
        {currentPlan?.imageUrl ? (
          <div
            className="relative select-none"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: 'top left',
            }}
          >
            <img
              src={currentPlan.imageUrl}
              alt={`Planta - ${selectedFloor}`}
              className="w-full h-auto block"
              draggable={false}
            />
            <>
              {Object.entries(currentPlan.markers || {}).map(([spotId, pos]) => {
                const spot = parkingSpots.find((s: any) => s.id === spotId);
                if (!spot) return null;
                const status = getSpotStatus(spotId);
                const labels = getSpotLabels(spot);
                return (
                  <Popover key={spotId}>
                    <PopoverTrigger asChild>
                      <div
                        className="absolute flex flex-col items-center cursor-pointer group"
                        style={{
                          left: `${pos.x}%`,
                          top: `${pos.y}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                      >
                        <div
                          className={cn(
                            'flex items-center justify-center rounded-full border-2 text-white font-bold shadow-lg transition-transform',
                            'group-hover:scale-125 group-hover:z-10',
                            getMarkerColor(status, spot),
                            status === 'chosen' && 'ring-2 ring-red-300',
                            status === 'choosing' && 'ring-2 ring-yellow-300 scale-110',
                          )}
                          style={{
                            width: `${markerSize}px`,
                            height: `${markerSize}px`,
                            fontSize: `${Math.max(7, Math.round(markerSize * 0.3))}px`,
                          }}
                        >
                          {spot.number}
                        </div>
                      </div>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      className="bg-gray-900 text-white border-gray-700 px-3 py-2 max-w-[220px] z-[300] w-auto"
                      sideOffset={5}
                    >
                      <p className="font-bold text-xs mb-1">Vaga {spot.number}</p>
                      <div className="flex flex-wrap gap-1">
                        {labels.map((label) => (
                          <span
                            key={label}
                            className={cn(
                              'text-[9px] px-1.5 py-0.5 rounded font-medium',
                              label === 'Coberta' && 'bg-blue-500/80',
                              label === 'Descoberta' && 'bg-amber-500/80',
                              label === 'Comum' && 'bg-gray-500/80',
                              label === 'Presa' && 'bg-purple-500/80',
                              label === 'Livre' && 'bg-teal-500/80',
                              label === 'Idoso' && 'bg-orange-500/80',
                              label === 'PCD' && 'bg-blue-700/80',
                              label === 'Moto' && 'bg-rose-500/80',
                              label === 'Pequena' && 'bg-cyan-500/80',
                              label === 'Média' && 'bg-emerald-500/80',
                              label === 'Grande' && 'bg-indigo-500/80',
                              label === 'Extra Grande' && 'bg-violet-500/80',
                            )}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      {(() => {
                        const participant = spotToParticipant.get(spot.number);
                        if (participant) {
                          return (
                            <p className="text-[10px] text-blue-300 mt-1 font-medium">
                              🏠 Bloco {participant.block} - Unid. {participant.unit}
                            </p>
                          );
                        }
                        return null;
                      })()}
                      <p className="text-[9px] text-gray-400 mt-1">
                        {status === 'chosen' ? '🔴 Escolhida' : status === 'choosing' ? '🟡 Escolhendo agora' : status === 'reserved' ? '🔵 Reservada' : '🟢 Disponível'}
                      </p>
                    </PopoverContent>
                  </Popover>
                );
              })}
            </>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Nenhuma planta disponível
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 items-center justify-center px-4 py-2.5 border-t bg-white text-xs flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500 border border-green-700" />
          <span>Disponível</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500 border border-blue-700" />
          <span>Reservada</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500 border border-red-700" />
          <span>Escolhida</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-400 border border-yellow-600 animate-pulse" />
          <span>Escolhendo agora</span>
        </div>
      </div>
    </div>
  );
};
