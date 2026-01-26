import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building, Car, MapPin, Eye, Info } from 'lucide-react';
import { ParkingSpot, SpotStatus } from '@/types/lottery';
import { useAppContext } from '@/context/AppContext';
import { cn } from '@/lib/utils';

interface SpotCardProps {
  spot: ParkingSpot;
  isSelected: boolean;
  onSelect: (spot: ParkingSpot) => void;
}

const ParkingSpotCard = ({ spot, isSelected, onSelect }: SpotCardProps) => {
  const getSpotColor = (status: SpotStatus) => {
    switch (status) {
      case 'available':
        return 'bg-available hover:bg-available/90 border-available/50';
      case 'occupied':
        return 'bg-occupied hover:bg-occupied/90 border-occupied/50';
      case 'reserved':
        return 'bg-reserved hover:bg-reserved/90 border-reserved/50';
    }
  };

  const getTypeIcon = () => {
    const typeArray = Array.isArray(spot.type) ? spot.type : [spot.type];
    if (typeArray.includes('Vaga PcD')) return '♿';
    if (typeArray.includes('Vaga Presa')) return '🏠';
    if (typeArray.includes('Vaga Livre')) return '🔓';
    if (typeArray.includes('Vaga Motocicleta')) return '🏍️';
    if (typeArray.includes('Vaga Idoso')) return '👴';
    if (typeArray.includes('Vaga Pequena')) return '📦';
    if (typeArray.includes('Vaga Comum')) return '🚗';
    if (typeArray.includes('Vaga Grande')) return '🚙';
    return '🚗';
  };

  const getTypeColor = () => {
    const typeArray = Array.isArray(spot.type) ? spot.type : [spot.type];
    if (typeArray.includes('Vaga PcD')) return 'bg-blue-500';
    if (typeArray.includes('Vaga Presa')) return 'bg-purple-500';
    if (typeArray.includes('Vaga Livre')) return 'bg-teal-500';
    if (typeArray.includes('Vaga Motocicleta')) return 'bg-orange-500';
    if (typeArray.includes('Vaga Idoso')) return 'bg-amber-500';
    if (typeArray.includes('Vaga Pequena')) return 'bg-yellow-500';
    if (typeArray.includes('Vaga Grande')) return 'bg-green-500';
    return 'bg-gray-500';
  };

  return (
    <div
      className={cn(
        'relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg',
        getSpotColor(spot.status),
        isSelected && 'ring-4 ring-accent scale-105 shadow-xl'
      )}
      onClick={() => onSelect(spot)}
    >
      <div className="flex flex-col items-center space-y-2">
        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-lg', getTypeColor())}>
          {getTypeIcon()}
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-white">#{spot.number}</div>
        </div>
      </div>
    </div>
  );
};

export const InteractiveParkingMap = () => {
  const { parkingSpots, selectedSpots, setSelectedSpots, selectedBuilding } = useAppContext();
  
  // Filter parking spots by selected building
  const buildingSpots = parkingSpots.filter(spot => spot.buildingId === selectedBuilding?.id);

  // Get all unique floors from parking spots
  const availableFloors = Array.from(new Set(buildingSpots.map(spot => spot.floor)));
  
  const floorsData = availableFloors.reduce((acc, floor) => {
    acc[floor] = buildingSpots.filter(spot => spot.floor === floor);
    return acc;
  }, {} as Record<string, ParkingSpot[]>);

  // Set initial floor to "Todas" to show all spots
  const [selectedFloor, setSelectedFloor] = useState<string>('Todas');
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'available' | 'occupied'>('all');

  const currentFloorSpots = (selectedFloor === 'Todas' 
    ? buildingSpots 
    : (floorsData[selectedFloor] || [])
  )
    .filter(spot => {
      if (viewMode === 'all') return true;
      return spot.status === viewMode;
    })
    .sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true, sensitivity: 'base' }));

  // Group spots by type for organized display
  const spotsByType = {
    'Vaga PcD': currentFloorSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga PcD');
    }),
    'Vaga Presa': currentFloorSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Presa');
    }),
    'Vaga Livre': currentFloorSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Livre');
    }),
    'Vaga Motocicleta': currentFloorSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Motocicleta');
    }),
    'Vaga Idoso': currentFloorSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Idoso');
    }),
    'Vaga Pequena': currentFloorSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Pequena') || s.size === 'P';
    }),
    'Vaga Comum': currentFloorSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Comum');
    }),
    'Vaga Grande': currentFloorSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Grande');
    }),
  };

  const getStatusCounts = (spots: ParkingSpot[]) => ({
    available: spots.filter(s => s.status === 'available').length,
    occupied: spots.filter(s => s.status === 'occupied').length,
    reserved: spots.filter(s => s.status === 'reserved').length,
  });

  const currentFloorStats = getStatusCounts(
    selectedFloor === 'Todas' ? buildingSpots : (floorsData[selectedFloor] || [])
  );

  const handleSpotSelect = (spot: ParkingSpot) => {
    setSelectedSpot(selectedSpot?.id === spot.id ? null : spot);
  };

  const handleIncludeInLottery = () => {
    if (selectedSpot && selectedSpot.status === 'available') {
      if (selectedSpots.includes(selectedSpot.id)) {
        setSelectedSpots(prev => prev.filter(id => id !== selectedSpot.id));
      } else {
        setSelectedSpots(prev => [...prev, selectedSpot.id]);
      }
    }
  };

  const isSpotSelectedForLottery = (spotId: string) => {
    return selectedSpots.includes(spotId);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary rounded-lg flex items-center justify-center">
            <Building className="h-4 w-4 sm:h-6 sm:w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Planta Digital Interativa</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Visualize e Interaja com o Mapa das Vagas
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
          <Select value={viewMode} onValueChange={(value: 'all' | 'available' | 'occupied') => setViewMode(value)}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Vagas</SelectItem>
              <SelectItem value="available">Vagas Disponíveis</SelectItem>
              <SelectItem value="occupied">Vagas Ocupadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Floor Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-soft">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-available rounded-full"></div>
              <span className="text-sm font-medium">Disponíveis</span>
            </div>
            <Badge className="bg-available text-available-foreground">
              {currentFloorStats.available}
            </Badge>
          </CardContent>
        </Card>
        
        <Card className="shadow-soft">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-occupied rounded-full"></div>
              <span className="text-sm font-medium">Ocupadas</span>
            </div>
            <Badge className="bg-occupied text-occupied-foreground">
              {currentFloorStats.occupied}
            </Badge>
          </CardContent>
        </Card>
        
        <Card className="shadow-soft">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-reserved rounded-full"></div>
              <span className="text-sm font-medium">Reservadas</span>
            </div>
            <Badge className="bg-reserved text-reserved-foreground">
              {currentFloorStats.reserved}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Map */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card className="shadow-soft">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <MapPin className="h-5 w-5" />
                  <span>Mapa do Estacionamento</span>
                </CardTitle>
                <CardDescription>
                  Clique nas Vagas para Ver Detalhes
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Floor Selector Box */}
                <div className="p-4 bg-muted/30 rounded-lg border-2 border-muted">
                  <Label className="text-sm font-medium mb-3 block">Selecione o Pavimento</Label>
                  <Select value={selectedFloor} onValueChange={setSelectedFloor}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Todas">Todos os Pavimentos</SelectItem>
                      {availableFloors.length > 0 ? (
                        availableFloors.map((floor) => (
                          <SelectItem key={floor} value={floor}>
                            {floor}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>Nenhum pavimento disponível</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground mt-2">
                    {currentFloorSpots.length} vaga(s) {selectedFloor === 'Todas' ? 'no total' : 'neste pavimento'}
                  </div>
                </div>

                {currentFloorSpots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Car className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nenhuma vaga encontrada neste andar</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(spotsByType).map(([type, spots]) => (
                      spots.length > 0 && (
                        <div key={type} className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="text-sm">
                              {type} ({spots.length})
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {spots.map((spot) => (
                              <ParkingSpotCard
                                key={spot.id}
                                spot={spot}
                                isSelected={selectedSpot?.id === spot.id}
                                onSelect={handleSpotSelect}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="mt-6 pt-4 border-t grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-4 items-center justify-center">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-3 bg-available rounded border"></div>
                  <span className="text-xs sm:text-sm">Disponível</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-3 bg-occupied rounded border"></div>
                  <span className="text-xs sm:text-sm">Ocupada</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-3 bg-reserved rounded border"></div>
                  <span className="text-xs sm:text-sm">Reservada</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs sm:text-sm">♿ PcD</span>
                  <span className="text-xs sm:text-sm">🏠 Presa</span>
                  <span className="text-xs sm:text-sm">👴 Idoso</span>
                  <span className="text-xs sm:text-sm">📦 Pequena</span>
                  <span className="text-xs sm:text-sm">🚗 Comum</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Spot Details */}
        <div className="space-y-4">
          {selectedSpot ? (
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Car className="h-5 w-5" />
                  <span>Detalhes da Vaga</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">#{selectedSpot.number}</div>
                  <div className="text-sm text-muted-foreground">{selectedSpot.floor}</div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Tipo:</span>
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(selectedSpot.type) ? selectedSpot.type : [selectedSpot.type]).map((type, index) => (
                        <Badge key={index} variant={type === 'Vaga PcD' ? 'default' : 'outline'}>
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm">Status:</span>
                    {selectedSpot.status === 'available' && (
                      <Badge className="bg-available text-available-foreground">Disponível</Badge>
                    )}
                    {selectedSpot.status === 'occupied' && (
                      <Badge className="bg-occupied text-occupied-foreground">Ocupada</Badge>
                    )}
                    {selectedSpot.status === 'reserved' && (
                      <Badge className="bg-reserved text-reserved-foreground">Reservada</Badge>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <Button 
                    className="w-full" 
                    variant={isSpotSelectedForLottery(selectedSpot.id) ? "default" : "outline"} 
                    size="sm"
                    onClick={handleIncludeInLottery}
                    disabled={selectedSpot.status !== 'available'}
                  >
                    {isSpotSelectedForLottery(selectedSpot.id) 
                      ? 'Remover do Sorteio' 
                      : 'Incluir no Sorteio'
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-soft">
              <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                <Info className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium text-foreground">Selecione uma Vaga</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Clique em uma vaga no mapa para ver seus detalhes
                </p>
              </CardContent>
            </Card>
          )}

          {/* Floor Summary */}
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg">Resumo do Andar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Total de vagas:</span>
                <span className="font-medium">
                  {selectedFloor === 'Todas' 
                    ? buildingSpots.length 
                    : (floorsData[selectedFloor] || []).length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Vagas PcD:</span>
                <span className="font-medium">
                  {(selectedFloor === 'Todas' 
                    ? buildingSpots 
                    : (floorsData[selectedFloor] || [])
                  ).filter(s => {
                    const typeArray = Array.isArray(s.type) ? s.type : [s.type];
                    return typeArray.includes('Vaga PcD');
                  }).length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Taxa de ocupação:</span>
                <span className="font-medium">
                  {(() => {
                    const totalSpots = selectedFloor === 'Todas' 
                      ? buildingSpots.length 
                      : (floorsData[selectedFloor] || []).length;
                    return totalSpots > 0 
                      ? Math.round((currentFloorStats.occupied / totalSpots) * 100)
                      : 0;
                  })()}%
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};