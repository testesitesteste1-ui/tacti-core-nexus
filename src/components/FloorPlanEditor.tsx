import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Building, Upload, Save, Trash2, Move, ZoomIn, ZoomOut, RotateCcw, Eye, Edit3, MapPin, Car, Info, Image as ImageIcon, Loader2, GripVertical, CheckCircle2, Circle, Search } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { ParkingSpot } from '@/types/lottery';
import { cn } from '@/lib/utils';
import { database } from '@/config/firebase';
import { ref as dbRef, set, onValue } from 'firebase/database';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FloorPlanData {
  imageUrl: string;
  markers: Record<string, { x: number; y: number }>;
}

interface MarkerProps {
  spot: ParkingSpot;
  position: { x: number; y: number };
  isEditing: boolean;
  isDragging: boolean;
  isHighlighted: boolean;
  onDragStart: (spotId: string, e: React.PointerEvent) => void;
  onRemove?: (spotId: string) => void;
  status?: 'available' | 'occupied' | 'reserved' | 'chosen';
}

const SpotMarker: React.FC<MarkerProps> = ({ spot, position, isEditing, isDragging, isHighlighted, onDragStart, onRemove, status }) => {
  const spotStatus = status || spot.status;

  const getColor = () => {
    switch (spotStatus) {
      case 'chosen': return 'bg-red-500 border-red-700 text-white shadow-red-500/40';
      case 'occupied': return 'bg-orange-500 border-orange-700 text-white shadow-orange-500/40';
      case 'reserved': return 'bg-yellow-500 border-yellow-700 text-white shadow-yellow-500/40';
      case 'available':
      default: return 'bg-green-500 border-green-700 text-white shadow-green-500/40';
    }
  };

  const types = Array.isArray(spot.type) ? spot.type : [spot.type];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'absolute flex items-center justify-center rounded-full border-2 shadow-lg transition-all select-none',
              'w-7 h-7 text-[9px] font-bold',
              'md:w-9 md:h-9 md:text-[11px]',
              getColor(),
              isEditing && 'cursor-grab hover:scale-110 hover:shadow-xl',
              isDragging && 'cursor-grabbing scale-[1.35] z-50 opacity-90 ring-2 ring-white/60',
              isHighlighted && 'ring-2 ring-primary ring-offset-1 scale-110 z-40',
              !isEditing && 'pointer-events-none'
            )}
            style={{
              left: `${position.x}%`,
              top: `${position.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onPointerDown={(e) => {
              if (isEditing) {
                e.preventDefault();
                onDragStart(spot.id, e);
              }
            }}
            onDoubleClick={() => {
              if (isEditing && onRemove) {
                onRemove(spot.id);
              }
            }}
          >
            {spot.number}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="font-semibold">Vaga {spot.number}</div>
          <div className="text-muted-foreground">{types.join(', ')}</div>
          {spot.isCovered && <div>Coberta</div>}
          {isEditing && <div className="text-muted-foreground mt-1 italic">Duplo-clique para remover</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const FloorPlanEditor: React.FC = () => {
  const { parkingSpots, selectedBuilding } = useAppContext();
  const buildingSpots = parkingSpots.filter(s => s.buildingId === selectedBuilding?.id);

  const floorOrder: ParkingSpot['floor'][] = [
    'Piso Único', 'Térreo', '1° SubSolo', '2° SubSolo', '3° SubSolo', '4° SubSolo', '5° SubSolo',
    'Ed. Garagem (1° Andar)', 'Ed. Garagem (2° Andar)', 'Ed. Garagem (3° Andar)', 'Ed. Garagem (4° Andar)', 'Ed. Garagem (5° Andar)'
  ];

  const [selectedFloor, setSelectedFloor] = useState<string>(buildingSpots[0]?.floor || 'Térreo');
  const [floorPlans, setFloorPlans] = useState<Record<string, FloorPlanData>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggingSpotId, setDraggingSpotId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [unplacedFilter, setUnplacedFilter] = useState('');
  const [highlightedSpotId, setHighlightedSpotId] = useState<string | null>(null);
  const [placedFilter, setPlacedFilter] = useState('');

  // Floors that have spots assigned
  const floorsWithSpots: string[] = Array.from(new Set(buildingSpots.map(s => s.floor)));
  // Floors that have a plan uploaded already
  const floorsWithPlans = Object.keys(floorPlans);
  // In editing mode, show ALL possible floors; otherwise only show floors with spots or plans
  const availableFloors = (isEditing
    ? Array.from(new Set([...floorOrder, ...floorsWithSpots, ...floorsWithPlans]))
    : Array.from(new Set([...floorsWithSpots, ...floorsWithPlans]))
  ).sort((a, b) => {
    const ia = floorOrder.indexOf(a as any);
    const ib = floorOrder.indexOf(b as any);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPlan = floorPlans[selectedFloor];
  const floorSpots = buildingSpots.filter(s => s.floor === selectedFloor);
  const placedSpotIds = currentPlan ? Object.keys(currentPlan.markers ?? {}) : [];
  const unplacedSpots = floorSpots.filter(s => !placedSpotIds.includes(s.id));
  const filteredUnplaced = unplacedSpots.filter(s =>
    !unplacedFilter || s.number.toLowerCase().includes(unplacedFilter.toLowerCase())
  );

  // Load floor plans from Firebase
  useEffect(() => {
    if (!selectedBuilding?.id) return;
    const plansRef = dbRef(database, `buildings/${selectedBuilding.id}/floorPlans`);
    const unsub = onValue(plansRef, (snapshot) => {
      if (snapshot.exists()) {
        setFloorPlans(snapshot.val());
      } else {
        setFloorPlans({});
      }
    });
    return () => unsub();
  }, [selectedBuilding?.id]);

  useEffect(() => {
    if (availableFloors.length > 0 && !availableFloors.includes(selectedFloor as any)) {
      setSelectedFloor(availableFloors[0]);
    }
  }, [availableFloors]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBuilding?.id) return;

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('Selecione um arquivo de imagem ou PDF válido');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 5MB.');
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const updatedPlan: FloorPlanData = {
        imageUrl: dataUrl,
        markers: currentPlan?.markers || {},
      };

      await set(dbRef(database, `buildings/${selectedBuilding.id}/floorPlans/${selectedFloor}`), updatedPlan);
      toast.success('Planta enviada com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar imagem:', error);
      toast.error('Erro ao enviar imagem.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragStart = useCallback((spotId: string, e: React.PointerEvent) => {
    setDraggingSpotId(spotId);
    setHighlightedSpotId(spotId);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingSpotId || !mapContainerRef.current) return;

    const rect = mapContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));

    setFloorPlans(prev => ({
      ...prev,
      [selectedFloor]: {
        ...prev[selectedFloor],
        markers: {
          ...prev[selectedFloor]?.markers,
          [draggingSpotId]: { x: clampedX, y: clampedY },
        },
      },
    }));
  }, [draggingSpotId, selectedFloor]);

  const handlePointerUp = useCallback(() => {
    setDraggingSpotId(null);
  }, []);

  const handlePlaceSpot = (spot: ParkingSpot) => {
    if (!currentPlan?.imageUrl) {
      toast.error('Envie uma imagem da planta primeiro');
      return;
    }

    setFloorPlans(prev => ({
      ...prev,
      [selectedFloor]: {
        ...prev[selectedFloor],
        markers: {
          ...prev[selectedFloor]?.markers,
          [spot.id]: { x: 50, y: 50 },
        },
      },
    }));
    setHighlightedSpotId(spot.id);
    toast.success(`Vaga ${spot.number} adicionada. Arraste para posicionar.`);
  };

  const handleRemoveMarker = (spotId: string) => {
    const spot = buildingSpots.find(s => s.id === spotId);
    setFloorPlans(prev => {
      const updated = { ...prev };
      if (updated[selectedFloor]?.markers) {
        const markers = { ...updated[selectedFloor].markers };
        delete markers[spotId];
        updated[selectedFloor] = { ...updated[selectedFloor], markers };
      }
      return updated;
    });
    if (highlightedSpotId === spotId) setHighlightedSpotId(null);
    if (spot) toast.info(`Vaga ${spot.number} removida do mapa`);
  };

  const handlePlaceAll = () => {
    if (!currentPlan?.imageUrl) {
      toast.error('Envie uma imagem da planta primeiro');
      return;
    }

    const newMarkers = { ...(currentPlan.markers ?? {}) };
    const cols = Math.ceil(Math.sqrt(unplacedSpots.length));
    unplacedSpots.forEach((spot, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      newMarkers[spot.id] = {
        x: 10 + (col / Math.max(cols - 1, 1)) * 80,
        y: 10 + (row / Math.max(Math.ceil(unplacedSpots.length / cols) - 1, 1)) * 80,
      };
    });

    setFloorPlans(prev => ({
      ...prev,
      [selectedFloor]: { ...prev[selectedFloor], markers: newMarkers },
    }));
    toast.success(`${unplacedSpots.length} vagas posicionadas. Arraste para ajustar.`);
  };
  const handleResetMarkers = () => {
    if (!currentPlan) return;
    const count = Object.keys(currentPlan.markers ?? {}).length;
    setFloorPlans(prev => ({
      ...prev,
      [selectedFloor]: { ...prev[selectedFloor], markers: {} },
    }));
    setHighlightedSpotId(null);
    toast.info(`${count} marcador(es) removido(s). Posicione novamente.`);
  };

  const handleSave = async () => {
    if (!selectedBuilding?.id) return;
    setSaving(true);
    try {
      await set(dbRef(database, `buildings/${selectedBuilding.id}/floorPlans/${selectedFloor}`), floorPlans[selectedFloor]);
      toast.success('Planta salva com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar planta');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveImage = async () => {
    if (!selectedBuilding?.id) return;
    try {
      await set(dbRef(database, `buildings/${selectedBuilding.id}/floorPlans/${selectedFloor}`), null);
      setFloorPlans(prev => {
        const updated = { ...prev };
        delete updated[selectedFloor];
        return updated;
      });
      toast.success('Planta removida');
    } catch (error) {
      toast.error('Erro ao remover planta');
    }
  };

  const placedSpotsFiltered = placedSpotIds
    .map(id => buildingSpots.find(s => s.id === id))
    .filter((s): s is ParkingSpot => !!s)
    .filter(s => !placedFilter || s.number.toLowerCase().includes(placedFilter.toLowerCase()))
    .sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }));

  if (!selectedBuilding) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Building className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Selecione um condomínio</h3>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPlaced = placedSpotIds.length;
  const totalSpots = floorSpots.length;
  const progressPercent = totalSpots > 0 ? Math.round((totalPlaced / totalSpots) * 100) : 0;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <MapPin className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Planta Digital Visual</h1>
            <p className="text-sm text-muted-foreground">
              Faça upload da planta e posicione as vagas arrastando
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={isEditing ? 'default' : 'outline'}
            onClick={() => setIsEditing(!isEditing)}
            className="gap-2"
          >
            {isEditing ? <Eye className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
            {isEditing ? 'Visualizar' : 'Editar'}
          </Button>
          {placedSpotIds.length > 0 && (
            <Button
              variant="destructive"
              onClick={handleResetMarkers}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Resetar ({placedSpotIds.length})
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Main Map Area */}
        <div className="lg:col-span-3 space-y-4">
          {/* Floor Selector + Upload */}
          <Card className="shadow-soft">
            <CardContent className="pt-4 space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label className="text-sm font-medium mb-2 block">Pavimento</Label>
                  <Select value={selectedFloor} onValueChange={setSelectedFloor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o pavimento" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFloors.map(floor => {
                        const hasImage = !!floorPlans[floor]?.imageUrl;
                        const hasSpots = floorsWithSpots.includes(floor);
                        return (
                          <SelectItem key={floor} value={floor}>
                            {floor}
                            {hasImage && ' ✅'}
                            {!hasImage && hasSpots && ' 📋'}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {isEditing && (
                  <div className="flex items-end gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="gap-2"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploading ? 'Enviando...' : 'Upload Planta'}
                    </Button>

                    {currentPlan?.imageUrl && (
                      <>
                        <Button variant="default" onClick={handleSave} disabled={saving} className="gap-2">
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Salvar
                        </Button>
                        <Button variant="destructive" size="icon" onClick={handleRemoveImage}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Zoom Controls + Progress */}
              {currentPlan?.imageUrl && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground w-14 text-center font-mono">{Math.round(zoom * 100)}%</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(3, z + 0.1))}>
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(1)}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>

                  {isEditing && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            progressPercent === 100 ? "bg-green-500" : "bg-primary"
                          )}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground font-medium">
                        {totalPlaced}/{totalSpots}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Map Canvas */}
          <Card className="shadow-soft overflow-hidden">
            <CardContent className="p-0">
              {currentPlan?.imageUrl ? (
                <div className="overflow-auto max-h-[70vh] bg-muted/30">
                  <div
                    ref={mapContainerRef}
                    className={cn(
                      "relative select-none",
                      isEditing && "ring-2 ring-primary/20 ring-inset"
                    )}
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', minHeight: 400 }}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <img
                      src={currentPlan.imageUrl}
                      alt={`Planta - ${selectedFloor}`}
                      className="w-full h-auto block"
                      draggable={false}
                    />

                    {/* Markers */}
                    {Object.entries(currentPlan.markers || {}).map(([spotId, pos]) => {
                      const spot = buildingSpots.find(s => s.id === spotId);
                      if (!spot) return null;
                      return (
                        <SpotMarker
                          key={spotId}
                          spot={spot}
                          position={pos}
                          isEditing={isEditing}
                          isDragging={draggingSpotId === spotId}
                          isHighlighted={highlightedSpotId === spotId}
                          onDragStart={handleDragStart}
                          onRemove={handleRemoveMarker}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center bg-muted/20">
                  <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                    <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma planta carregada</h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-md">
                    Ative o modo "Editar" e faça upload da imagem da planta do pavimento <strong>{selectedFloor}</strong>
                  </p>
                  {isEditing && (
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Enviar Imagem da Planta
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 items-center justify-center text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-green-700" />
              <span>Disponível</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-orange-500 border-2 border-orange-700" />
              <span>Ocupada</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-yellow-500 border-2 border-yellow-700" />
              <span>Reservada</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-red-700" />
              <span>Escolhida (Sorteio)</span>
            </div>
          </div>

          {/* Tips bar in edit mode */}
          {isEditing && currentPlan?.imageUrl && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 text-sm text-muted-foreground flex items-start gap-2">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <strong className="text-foreground">Dicas:</strong> Clique em uma vaga da lista para adicioná-la ao centro do mapa. 
                Arraste os marcadores para posicionar. <strong>Duplo-clique</strong> em um marcador para removê-lo.
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {isEditing && currentPlan?.imageUrl && (
            <Card className="shadow-soft border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Car className="h-4 w-4 text-primary" />
                  Vagas Não Posicionadas
                </CardTitle>
                <CardDescription className="text-xs">
                  Clique para adicionar ao mapa
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar por número..."
                    value={unplacedFilter}
                    onChange={(e) => setUnplacedFilter(e.target.value)}
                    className="h-8 text-sm pl-8"
                  />
                </div>

                <div className="flex gap-2">
                  {unplacedSpots.length > 0 && (
                    <Button variant="outline" size="sm" className="flex-1 gap-2 border-dashed" onClick={handlePlaceAll}>
                      <Move className="h-3 w-3" />
                      Posicionar Todas ({unplacedSpots.length})
                    </Button>
                  )}
                  {placedSpotIds.length > 0 && (
                    <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleResetMarkers}>
                      <RotateCcw className="h-3 w-3" />
                      Resetar
                    </Button>
                  )}
                </div>

                <div className="max-h-[35vh] overflow-y-auto space-y-1">
                  {filteredUnplaced.length > 0 ? (
                    filteredUnplaced
                      .sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }))
                      .map(spot => {
                        const types = Array.isArray(spot.type) ? spot.type : [spot.type];
                        return (
                          <button
                            key={spot.id}
                            onClick={() => handlePlaceSpot(spot)}
                            className="w-full text-left p-2 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 transition-all text-sm flex items-center justify-between group"
                          >
                            <div className="flex items-center gap-2">
                              <Circle className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                              <span className="font-medium">#{spot.number}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {types[0]}
                            </Badge>
                          </button>
                        );
                      })
                  ) : (
                    <div className="text-center py-6">
                      {unplacedSpots.length === 0 ? (
                        <div className="space-y-1">
                          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
                          <p className="text-xs text-green-600 font-medium">Todas posicionadas!</p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Nenhuma vaga encontrada</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {isEditing && currentPlan?.imageUrl && placedSpotIds.length > 0 && (
            <Card className="shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-green-600" />
                  Vagas no Mapa
                </CardTitle>
                <CardDescription className="text-xs">
                  {placedSpotIds.length} posicionada(s) • Clique para destacar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {placedSpotIds.length > 6 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar..."
                      value={placedFilter}
                      onChange={(e) => setPlacedFilter(e.target.value)}
                      className="h-7 text-xs pl-8"
                    />
                  </div>
                )}
                <div className="max-h-[30vh] overflow-y-auto space-y-0.5">
                  {placedSpotsFiltered.map(spot => (
                    <div
                      key={spot.id}
                      className={cn(
                        "flex items-center justify-between p-1.5 rounded-md text-sm cursor-pointer transition-colors",
                        highlightedSpotId === spot.id
                          ? "bg-primary/10 ring-1 ring-primary/30"
                          : "hover:bg-muted"
                      )}
                      onClick={() => setHighlightedSpotId(
                        highlightedSpotId === spot.id ? null : spot.id
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                        <span className="font-medium">#{spot.number}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-50 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveMarker(spot.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 mt-2"
                  onClick={handleResetMarkers}
                >
                  <RotateCcw className="h-3 w-3" />
                  Resetar Todas as Posições
                </Button>
              </CardContent>
            </Card>
          )}

          {!isEditing && (
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle className="text-base">Resumo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Total de vagas:</span>
                  <span className="font-medium">{floorSpots.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>No mapa:</span>
                  <span className="font-medium">{placedSpotIds.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Sem posição:</span>
                  <span className="font-medium">{unplacedSpots.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Disponíveis:</span>
                  <span className="font-medium text-green-600">
                    {floorSpots.filter(s => s.status === 'available').length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Ocupadas:</span>
                  <span className="font-medium text-orange-600">
                    {floorSpots.filter(s => s.status === 'occupied').length}
                  </span>
                </div>
                {placedSpotIds.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 mt-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={handleResetMarkers}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Resetar Posições ({placedSpotIds.length})
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {!isEditing && !currentPlan?.imageUrl && (
            <Card className="shadow-soft">
              <CardContent className="pt-6 text-center">
                <Info className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-medium text-sm">Modo Edição</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Clique em "Editar" para enviar a planta e posicionar as vagas
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
