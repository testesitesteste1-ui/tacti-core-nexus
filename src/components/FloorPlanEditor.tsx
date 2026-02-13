import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Building, Upload, Save, Trash2, Move, ZoomIn, ZoomOut, RotateCcw, Eye, Edit3, MapPin, Car, Info, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { ParkingSpot } from '@/types/lottery';
import { cn } from '@/lib/utils';
import { database, storage } from '@/config/firebase';
import { ref as dbRef, set, onValue } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'sonner';

interface FloorPlanData {
  imageUrl: string;
  markers: Record<string, { x: number; y: number }>; // spotId -> position (% based)
}

interface MarkerProps {
  spot: ParkingSpot;
  position: { x: number; y: number };
  isEditing: boolean;
  isDragging: boolean;
  onDragStart: (spotId: string, e: React.PointerEvent) => void;
  status?: 'available' | 'occupied' | 'reserved' | 'chosen';
}

const SpotMarker: React.FC<MarkerProps> = ({ spot, position, isEditing, isDragging, onDragStart, status }) => {
  const spotStatus = status || spot.status;

  const getColor = () => {
    switch (spotStatus) {
      case 'chosen': return 'bg-red-500 border-red-700 text-white';
      case 'occupied': return 'bg-orange-500 border-orange-700 text-white';
      case 'reserved': return 'bg-yellow-500 border-yellow-700 text-white';
      case 'available':
      default: return 'bg-green-500 border-green-700 text-white';
    }
  };

  return (
    <div
      className={cn(
        'absolute flex items-center justify-center rounded-full border-2 shadow-lg transition-transform select-none',
        'w-8 h-8 text-[10px] font-bold',
        'md:w-10 md:h-10 md:text-xs',
        getColor(),
        isEditing && 'cursor-grab hover:scale-110',
        isDragging && 'cursor-grabbing scale-125 z-50 opacity-80',
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
      title={`Vaga ${spot.number} - ${spot.floor}`}
    >
      {spot.number}
    </div>
  );
};

export const FloorPlanEditor: React.FC = () => {
  const { parkingSpots, selectedBuilding } = useAppContext();
  const buildingSpots = parkingSpots.filter(s => s.buildingId === selectedBuilding?.id);

  const floorOrder: ParkingSpot['floor'][] = [
    'Piso Único', 'Térreo', '1° SubSolo', '2° SubSolo', '3° SubSolo', '4° SubSolo', '5° SubSolo',
    'Ed. Garagem (1° Andar)', 'Ed. Garagem (2° Andar)', 'Ed. Garagem (3° Andar)', 'Ed. Garagem (4° Andar)', 'Ed. Garagem (5° Andar)'
  ];

  const availableFloors = Array.from(new Set(buildingSpots.map(s => s.floor)))
    .sort((a, b) => floorOrder.indexOf(a) - floorOrder.indexOf(b));

  const [selectedFloor, setSelectedFloor] = useState<string>(availableFloors[0] || '');
  const [floorPlans, setFloorPlans] = useState<Record<string, FloorPlanData>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggingSpotId, setDraggingSpotId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [unplacedFilter, setUnplacedFilter] = useState('');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPlan = floorPlans[selectedFloor];
  const floorSpots = buildingSpots.filter(s => s.floor === selectedFloor);
  const placedSpotIds = currentPlan ? Object.keys(currentPlan.markers) : [];
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

  // Update selectedFloor when availableFloors changes
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

    setUploading(true);
    try {
      const path = `floorPlans/${selectedBuilding.id}/${selectedFloor.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);

      const updatedPlan: FloorPlanData = {
        imageUrl: url,
        markers: currentPlan?.markers || {},
      };

      await set(dbRef(database, `buildings/${selectedBuilding.id}/floorPlans/${selectedFloor}`), updatedPlan);
      toast.success('Imagem da planta enviada com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar imagem:', error);
      toast.error('Erro ao enviar imagem. Verifique as permissões do Firebase Storage.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragStart = useCallback((spotId: string, e: React.PointerEvent) => {
    setDraggingSpotId(spotId);
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

    // Place at center
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
    toast.success(`Vaga ${spot.number} adicionada ao mapa. Arraste para posicionar.`);
  };

  const handleRemoveMarker = (spotId: string) => {
    setFloorPlans(prev => {
      const updated = { ...prev };
      if (updated[selectedFloor]?.markers) {
        const markers = { ...updated[selectedFloor].markers };
        delete markers[spotId];
        updated[selectedFloor] = { ...updated[selectedFloor], markers };
      }
      return updated;
    });
  };

  const handlePlaceAll = () => {
    if (!currentPlan?.imageUrl) {
      toast.error('Envie uma imagem da planta primeiro');
      return;
    }

    const newMarkers = { ...currentPlan.markers };
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

  return (
    <div className="p-4 lg:p-6 space-y-6">
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
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
                      {availableFloors.map(floor => (
                        <SelectItem key={floor} value={floor}>
                          {floor}
                          {floorPlans[floor]?.imageUrl && ' ✅'}
                        </SelectItem>
                      ))}
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

              {/* Zoom Controls */}
              {currentPlan?.imageUrl && (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground w-16 text-center">{Math.round(zoom * 100)}%</span>
                  <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(3, z + 0.1))}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setZoom(1)}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Map Canvas */}
          <Card className="shadow-soft overflow-hidden">
            <CardContent className="p-0">
              {currentPlan?.imageUrl ? (
                <div className="overflow-auto max-h-[70vh]">
                  <div
                    ref={mapContainerRef}
                    className="relative select-none"
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
                          onDragStart={handleDragStart}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <ImageIcon className="h-16 w-16 text-muted-foreground/40 mb-4" />
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
        </div>

        {/* Sidebar - Spot List */}
        <div className="space-y-4">
          {isEditing && currentPlan?.imageUrl && (
            <Card className="shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  Vagas Não Posicionadas
                </CardTitle>
                <CardDescription className="text-xs">
                  Clique para adicionar ao mapa e arraste para posicionar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Filtrar por número..."
                  value={unplacedFilter}
                  onChange={(e) => setUnplacedFilter(e.target.value)}
                  className="h-8 text-sm"
                />

                {unplacedSpots.length > 0 && (
                  <Button variant="outline" size="sm" className="w-full gap-2" onClick={handlePlaceAll}>
                    <Move className="h-3 w-3" />
                    Posicionar Todas ({unplacedSpots.length})
                  </Button>
                )}

                <div className="max-h-[40vh] overflow-y-auto space-y-1.5">
                  {filteredUnplaced.length > 0 ? (
                    filteredUnplaced
                      .sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }))
                      .map(spot => (
                        <button
                          key={spot.id}
                          onClick={() => handlePlaceSpot(spot)}
                          className="w-full text-left p-2 rounded-lg border hover:bg-accent transition-colors text-sm flex items-center justify-between"
                        >
                          <span className="font-medium">#{spot.number}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {(Array.isArray(spot.type) ? spot.type : [spot.type])[0]}
                          </Badge>
                        </button>
                      ))
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      {unplacedSpots.length === 0 ? '✅ Todas as vagas posicionadas!' : 'Nenhuma vaga encontrada'}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {isEditing && currentPlan?.imageUrl && placedSpotIds.length > 0 && (
            <Card className="shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Vagas no Mapa</CardTitle>
                <CardDescription className="text-xs">
                  {placedSpotIds.length} vaga(s) posicionada(s)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[30vh] overflow-y-auto space-y-1">
                  {placedSpotIds.map(spotId => {
                    const spot = buildingSpots.find(s => s.id === spotId);
                    if (!spot) return null;
                    return (
                      <div key={spotId} className="flex items-center justify-between p-1.5 rounded hover:bg-muted text-sm">
                        <span className="font-medium">#{spot.number}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveMarker(spotId)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
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
