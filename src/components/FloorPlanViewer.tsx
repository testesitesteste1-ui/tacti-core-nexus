import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, ZoomIn, ZoomOut, RotateCcw, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { database } from '@/config/firebase';
import { ref, onValue } from 'firebase/database';
import { ChoiceLotteryLiveData } from '@/utils/publicResults';

interface FloorPlanData {
  imageUrl: string;
  markers: Record<string, { x: number; y: number }>;
}

interface Props {
  buildingId: string;
  liveData?: ChoiceLotteryLiveData | null;
}

export const FloorPlanViewer: React.FC<Props> = ({ buildingId, liveData }) => {
  const [floorPlans, setFloorPlans] = useState<Record<string, FloorPlanData>>({});
  const [selectedFloor, setSelectedFloor] = useState<string>('');
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [parkingSpots, setParkingSpots] = useState<any[]>([]);
  const [markerSize, setMarkerSize] = useState(36);

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

  useEffect(() => {
    if (!buildingId) return;
    const sizeRef = ref(database, `buildings/${buildingId}/markerSize`);
    const unsub = onValue(sizeRef, (snapshot) => {
      if (snapshot.exists()) setMarkerSize(snapshot.val());
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

  const currentPlan = floorPlans[selectedFloor];
  const availableFloors = Object.keys(floorPlans);

  const getSpotStatus = (spotId: string): 'available' | 'occupied' | 'chosen' | 'reserved' => {
    const spot = parkingSpots.find((s: any) => s.id === spotId);
    if (!spot) return 'available';
    if (chosenSpotNumbers.has(spot.number)) return 'chosen';
    return spot.status || 'available';
  };

  const getMarkerColor = (status: string) => {
    switch (status) {
      case 'chosen': return 'bg-red-500 border-red-700';
      case 'occupied': return 'bg-orange-500 border-orange-700';
      case 'reserved': return 'bg-yellow-500 border-yellow-700';
      default: return 'bg-green-500 border-green-700';
    }
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.3, Math.min(5, z + delta)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  }, [panOffset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return;
    setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  }, [isPanning, panStart]);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  if (availableFloors.length === 0) return null;

  const chosenCount = Object.keys(currentPlan?.markers || {}).filter(
    id => getSpotStatus(id) === 'chosen'
  ).length;
  const totalMarkers = Object.keys(currentPlan?.markers || {}).length;
  const fontSize = Math.max(7, Math.round(markerSize * 0.3));

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="w-5 h-5" />
          Planta Visual do Estacionamento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Select value={selectedFloor} onValueChange={setSelectedFloor}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableFloors.map(floor => (
                <SelectItem key={floor} value={floor}>{floor}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(5, z + 0.1))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleResetView}>
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Hand className="h-3 w-3" />
            <span>Arraste para mover</span>
          </div>

          {liveData && (
            <div className="flex gap-2 text-xs">
              <Badge className="bg-red-500 text-white">{chosenCount} escolhidas</Badge>
              <Badge variant="outline">{totalMarkers - chosenCount} disponíveis</Badge>
            </div>
          )}
        </div>

        {currentPlan?.imageUrl ? (
          <div
            className={`overflow-hidden max-h-[60vh] rounded-lg border ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
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

              {Object.entries(currentPlan.markers || {}).map(([spotId, pos]) => {
                const spot = parkingSpots.find((s: any) => s.id === spotId);
                if (!spot) return null;
                const status = getSpotStatus(spotId);
                return (
                  <div
                    key={spotId}
                    className={`absolute flex items-center justify-center rounded-full border-2 shadow-lg text-white font-bold
                      ${getMarkerColor(status)}
                      ${status === 'chosen' ? 'ring-2 ring-red-300 animate-pulse' : ''}
                    `}
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      transform: 'translate(-50%, -50%)',
                      width: `${markerSize}px`,
                      height: `${markerSize}px`,
                      fontSize: `${fontSize}px`,
                    }}
                    title={`Vaga ${spot.number} - ${status === 'chosen' ? 'Escolhida' : status === 'available' ? 'Disponível' : 'Ocupada'}`}
                  >
                    {spot.number}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhuma planta disponível para este pavimento
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 items-center justify-center text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500 border border-green-700" />
            <span>Disponível</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500 border border-red-700" />
            <span>Escolhida</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-orange-500 border border-orange-700" />
            <span>Ocupada</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};