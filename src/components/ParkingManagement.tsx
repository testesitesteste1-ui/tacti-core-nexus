import { useState, useRef, useEffect } from 'react';
import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Edit, Trash2, Car, MapPin, Building, Upload } from 'lucide-react';
import { ParkingSpot, SpotType, SpotStatus } from '@/types/lottery';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

export const ParkingManagement = () => {
  const { parkingSpots, addParkingSpot, updateParkingSpot, deleteParkingSpot, selectedBuilding } = useAppContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSpot, setEditingSpot] = useState<ParkingSpot | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFloor, setFilterFloor] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  

  const [formData, setFormData] = useState({
    number: '',
    floor: '1° SubSolo' as 'Piso Único' | 'Térreo' | '1° SubSolo' | '2° SubSolo' | '3° SubSolo' | '4° SubSolo' | '5° SubSolo' | 'Ed. Garagem (1° Andar)' | 'Ed. Garagem (2° Andar)' | 'Ed. Garagem (3° Andar)' | 'Ed. Garagem (4° Andar)' | 'Ed. Garagem (5° Andar)',
    type: ['Vaga Comum'] as SpotType[],
    size: 'M' as 'P' | 'M' | 'G' | 'XG',
    status: 'available' as SpotStatus,
    isCovered: false,
    isUncovered: false,
    position: { x: 100, y: 100 },
    linkedSpotIds: [] as string[], // Usado apenas na UI para checkboxes
  });



  const filteredSpots = parkingSpots
    .filter(spot => {
      const matchesBuilding = spot.buildingId === selectedBuilding?.id;
      const matchesSearch = spot.number.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFloor = filterFloor === 'all' || spot.floor === filterFloor;

      const typeArray = Array.isArray(spot.type) ? spot.type : [spot.type];
      let matchesType = filterType === 'all';

      if (filterType === 'Vaga Coberta') {
        matchesType = spot.isCovered === true;
      } else if (filterType === 'Vaga Descoberta') {
        matchesType = spot.isUncovered === true;
      } else if (filterType !== 'all') {
        matchesType = typeArray.includes(filterType as SpotType);
      }

      return matchesBuilding && matchesSearch && matchesFloor && matchesType;
    })
    .sort((a, b) => {
      return a.number.localeCompare(b.number, 'pt-BR', { numeric: true, sensitivity: 'base' });
    });

  const resetForm = () => {
    setFormData({
      number: '',
      floor: 'Piso Único',
      type: ['Vaga Comum'],
      size: 'M',
      status: 'available',
      isCovered: false,
      isUncovered: false,
      position: { x: 100, y: 100 },
      linkedSpotIds: [],
    });
    setEditingSpot(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Check for duplicates
    const isDuplicate = parkingSpots.some(spot =>
      spot.buildingId === selectedBuilding?.id &&
      spot.number.toLowerCase() === formData.number.toLowerCase() &&
      spot.id !== editingSpot?.id
    );

    if (isDuplicate) {
      toast({
        title: "Vaga duplicada",
        description: "Já existe uma vaga cadastrada com este número.",
        variant: "destructive",
      });
      return;
    }

    // ✅ Usar todos os tipos selecionados
    let finalType: SpotType[] = formData.type.length > 0 ? formData.type : ['Vaga Comum'];

    // Gerar groupId se houver vagas vinculadas
    let groupId: string | undefined = undefined;
    if (formData.linkedSpotIds.length > 0) {
      groupId = editingSpot?.groupId || `group-${Date.now()}`;
    }

    if (editingSpot) {
      // Atualizar vaga existente
      const updatedSpot: ParkingSpot = {
        ...editingSpot,
        number: formData.number,
        floor: formData.floor,
        type: finalType,  // ✅ Usar finalType
        size: formData.size,
        status: formData.status,
        isCovered: formData.isCovered,
        isUncovered: formData.isUncovered,
        position: formData.position,
        groupId: groupId,
        linkedSpotIds: undefined
      };
      updateParkingSpot(updatedSpot);

      // Atualizar vinculação mútua
      const oldLinkedSpotIds = parkingSpots
        .filter(s => s.groupId === editingSpot.groupId && s.id !== editingSpot.id)
        .map(s => s.id);
      const newLinkedIds = formData.linkedSpotIds;

      oldLinkedSpotIds.forEach(linkedId => {
        if (!newLinkedIds.includes(linkedId)) {
          const linkedSpot = parkingSpots.find(s => s.id === linkedId);
          if (linkedSpot) {
            updateParkingSpot({
              ...linkedSpot,
              groupId: undefined,
              linkedSpotIds: undefined
            });
          }
        }
      });

      newLinkedIds.forEach(linkedId => {
        const linkedSpot = parkingSpots.find(s => s.id === linkedId);
        if (linkedSpot) {
          updateParkingSpot({
            ...linkedSpot,
            groupId: groupId,
            linkedSpotIds: undefined
          });
        }
      });

      toast({
        title: "Vaga atualizada",
        description: "Os dados da vaga foram salvos com sucesso.",
      });
    } else {
      // Criar nova vaga
      const newSpot: ParkingSpot = {
        id: `spot-${Date.now()}`,
        buildingId: selectedBuilding?.id || '',
        number: formData.number,
        floor: formData.floor,
        type: finalType,  // ✅ Usar finalType
        size: formData.size,
        status: formData.status,
        isCovered: formData.isCovered,
        isUncovered: formData.isUncovered,
        position: formData.position,
        groupId: groupId,
        linkedSpotIds: undefined,
        createdAt: new Date(),
      };
      addParkingSpot(newSpot);

      formData.linkedSpotIds.forEach(linkedId => {
        const linkedSpot = parkingSpots.find(s => s.id === linkedId);
        if (linkedSpot) {
          updateParkingSpot({
            ...linkedSpot,
            groupId: groupId,
            linkedSpotIds: undefined
          });
        }
      });

      toast({
        title: "Vaga cadastrada",
        description: "Nova vaga foi adicionada ao sistema.",
      });
    }

    setIsDialogOpen(false);
    resetForm();
  };
  const handleEdit = (spot: ParkingSpot) => {
    // Encontrar outras vagas do mesmo grupo
    const linkedSpotIds = spot.groupId
      ? parkingSpots
        .filter(s => s.groupId === spot.groupId && s.id !== spot.id)
        .map(s => s.id)
      : [];

    // ✅ Remover "Vaga Comum" se a vaga for coberta ou descoberta
    let cleanedType = spot.type;
    if (spot.isCovered || spot.isUncovered) {
      cleanedType = spot.type.filter(t => t !== 'Vaga Comum');
    }

    setFormData({
      number: spot.number,
      floor: spot.floor,
      type: cleanedType,
      size: spot.size,
      status: spot.status,
      isCovered: spot.isCovered || false,
      isUncovered: spot.isUncovered || false,
      position: spot.position,
      linkedSpotIds: linkedSpotIds,
    });
    setEditingSpot(spot);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    const spot = parkingSpots.find(s => s.id === id);
    const spotName = spot
      ? `Vaga ${spot.number} - ${spot.floor}`
      : 'esta vaga';

    if (window.confirm(`Tem certeza que deseja excluir ${spotName}?`)) {
      deleteParkingSpot(id);
      toast({
        title: "Vaga removida",
        description: "A vaga foi excluída do sistema.",
        variant: "destructive",
      });
    }
  };

  const normalizeFloor = (floor: string): ParkingSpot['floor'] => {
    const floorStr = floor?.toString().trim() || '';

    if (floorStr.toLowerCase().includes('térreo')) return 'Térreo';
    if (floorStr.toLowerCase().includes('piso único')) return 'Piso Único';
    if (floorStr.match(/1[°º]?\s*subsolo/i)) return '1° SubSolo';
    if (floorStr.match(/2[°º]?\s*subsolo/i)) return '2° SubSolo';
    if (floorStr.match(/3[°º]?\s*subsolo/i)) return '3° SubSolo';
    if (floorStr.match(/4[°º]?\s*subsolo/i)) return '4° SubSolo';
    if (floorStr.match(/5[°º]?\s*subsolo/i)) return '5° SubSolo';
    if (floorStr.match(/ed\.?\s*garagem.*1[°º]?\s*andar/i)) return 'Ed. Garagem (1° Andar)';
    if (floorStr.match(/ed\.?\s*garagem.*2[°º]?\s*andar/i)) return 'Ed. Garagem (2° Andar)';
    if (floorStr.match(/ed\.?\s*garagem.*3[°º]?\s*andar/i)) return 'Ed. Garagem (3° Andar)';
    if (floorStr.match(/ed\.?\s*garagem.*4[°º]?\s*andar/i)) return 'Ed. Garagem (4° Andar)';
    if (floorStr.match(/ed\.?\s*garagem.*5[°º]?\s*andar/i)) return 'Ed. Garagem (5° Andar)';

    return 'Piso Único';
  };

  const normalizeType = (typeStr: string): { types: SpotType[], isCovered: boolean, isUncovered: boolean } => {
    const type = typeStr?.toString().toLowerCase().trim() || '';
    const types: SpotType[] = [];
    let isCovered = false;
    let isUncovered = false;

    // Verificar tipos específicos
    if (type.includes('pcd') || type.includes('vaga pcd')) {
      types.push('Vaga PcD');
    }
    if (type.includes('idoso') || type.includes('vaga idoso')) {
      types.push('Vaga Idoso');
    }
    if (type.includes('grande') || type.includes('vaga grande')) {
      types.push('Vaga Grande');
    }
    if (type.includes('pequena') || type.includes('vaga pequena')) {
      types.push('Vaga Pequena');
    }
    if (type.includes('presa') || type.includes('vaga presa')) {
      types.push('Vaga Presa');
    }
    if (type.includes('livre') || type.includes('vaga livre')) {
      types.push('Vaga Livre');
    }
    if (type.includes('motocicleta') || type.includes('vaga motocicleta') || type.includes('moto')) {
      types.push('Vaga Motocicleta');
    }

    // Verificar cobertura - IMPORTANTE: "descoberta" contém "coberta", então verificar descoberta PRIMEIRO
    if (type.includes('descoberta') || type.includes('vaga descoberta')) {
      isUncovered = true;
    } else if (type.includes('coberta') || type.includes('vaga coberta')) {
      // Só marca como coberta se NÃO for descoberta
      isCovered = true;
    }

    // Se não tem nenhum tipo específico e não é coberta/descoberta, é vaga comum
    if (types.length === 0 && !isCovered && !isUncovered) {
      types.push('Vaga Comum');
    }

    return { types, isCovered, isUncovered };
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log('Nenhum arquivo selecionado');
      return;
    }

    console.log('Arquivo selecionado:', file.name);

    // Verificar se é um arquivo Excel válido
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({
        title: "Formato inválido",
        description: "Por favor, selecione um arquivo Excel (.xlsx ou .xls)",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
      console.error('Erro ao ler arquivo');
      toast({
        title: "Erro ao ler arquivo",
        description: "Não foi possível ler o arquivo selecionado.",
        variant: "destructive",
      });
    };

    reader.onload = (event) => {
      try {
        console.log('Arquivo carregado, processando...');

        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        console.log('Planilhas encontradas:', workbook.SheetNames);

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

        console.log('Dados lidos:', jsonData);

        if (jsonData.length === 0) {
          toast({
            title: "Planilha vazia",
            description: "O arquivo não contém dados para importar.",
            variant: "destructive",
          });
          return;
        }

        const validRows: any[] = [];
        const errors: string[] = [];

        jsonData.forEach((row: any, index) => {
          const rowNum = index + 2;

          const vagaNum = row['VAGA'];
          const tipoVaga = row['TIPO DA VAGA'] || '';
          const piso = row['PISO'] || '';

          if (!vagaNum) {
            errors.push(`Linha ${rowNum}: VAGA é obrigatório`);
            return;
          }

          // Verificar duplicado
          const isDuplicate = parkingSpots.some(s =>
            s.buildingId === selectedBuilding?.id &&
            s.number.toLowerCase() === vagaNum.toString().toLowerCase()
          );

          if (isDuplicate) {
            errors.push(`Linha ${rowNum}: Vaga ${vagaNum} já existe no sistema`);
            return;
          }

          validRows.push({
            number: vagaNum?.toString().trim(),
            type: tipoVaga,
            floor: piso,
          });
        });

        console.log('Linhas válidas:', validRows.length);
        console.log('Erros:', errors);

        if (errors.length > 0) {
          toast({
            title: "Erros na importação",
            description: `${errors.length} erro(s) encontrado(s). Verifique o console para detalhes.`,
            variant: "destructive",
          });
          console.error('Erros detalhados:', errors);
          return;
        }

        if (validRows.length === 0) {
          toast({
            title: "Nenhuma vaga válida",
            description: "Não há vagas válidas para importar.",
            variant: "destructive",
          });
          return;
        }

        // Ordenar vagas numericamente antes de adicionar
        const sortedRows = validRows.sort((a, b) => {
          return a.number.localeCompare(b.number, 'pt-BR', { numeric: true, sensitivity: 'base' });
        });

        sortedRows.forEach(row => {
          const typeInfo = normalizeType(row.type);

          const newSpot: ParkingSpot = {
            id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            buildingId: selectedBuilding?.id || '',
            number: row.number,
            floor: normalizeFloor(row.floor),
            type: typeInfo.types,
            size: 'M',
            status: 'available',
            isCovered: typeInfo.isCovered,
            isUncovered: typeInfo.isUncovered,
            position: { x: 100, y: 100 },
            createdAt: new Date(),
          };
          addParkingSpot(newSpot);
        });

        toast({
          title: "Importação concluída",
          description: `${sortedRows.length} vaga(s) importada(s) com sucesso.`,
        });

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        console.error('Erro ao processar arquivo:', error);
        toast({
          title: "Erro ao importar",
          description: error instanceof Error ? error.message : "Verifique se o arquivo está no formato correto.",
          variant: "destructive",
        });
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const getStatusBadge = (status: SpotStatus) => {
    switch (status) {
      case 'available':
        return <Badge className="bg-available text-available-foreground">Disponível</Badge>;
      case 'occupied':
        return <Badge className="bg-occupied text-occupied-foreground">Ocupada</Badge>;
      case 'reserved':
        return <Badge className="bg-reserved text-reserved-foreground">Reservada</Badge>;
    }
  };

  const getTypeBadge = (type: SpotType) => {
    switch (type) {
      case 'Vaga Comum':
        return <Badge variant="common">Vaga Comum</Badge>;
      case 'Vaga PcD':
        return <Badge variant="pcd">Vaga PcD</Badge>;
      case 'Vaga Idoso':
        return <Badge variant="elderly">Vaga Idoso</Badge>;
      case 'Vaga Grande':
        return <Badge variant="large">Vaga Grande</Badge>;
      case 'Vaga Pequena':
        return <Badge variant="small">Vaga Pequena</Badge>;
      case 'Vaga Presa':
        return <Badge variant="linked">Vaga Presa</Badge>;
      case 'Vaga Livre':
        return <Badge variant="unlinked">Vaga Livre</Badge>;
      case 'Vaga Motocicleta':
        return <Badge variant="motorcycle">Vaga Motocicleta</Badge>;
    }
  };

  const getCoverageBadge = (spot: ParkingSpot) => {
    if (spot.isCovered) {
      return <Badge variant="covered">Vaga Coberta</Badge>;
    }
    if (spot.isUncovered) {
      return <Badge variant="uncovered">Vaga Descoberta</Badge>;
    }
    return null;
  };

  const buildingSpots = parkingSpots.filter(s => s.buildingId === selectedBuilding?.id);

  const statusCounts = {
    available: buildingSpots.filter(s => s.status === 'available').length,
    occupied: buildingSpots.filter(s => s.status === 'occupied').length,
    reserved: buildingSpots.filter(s => s.status === 'reserved').length,
  };

  const typeCounts = {
    'Vaga Comum': buildingSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Comum');
    }).length,
    'Vaga PcD': buildingSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga PcD');
    }).length,
    'Vaga Idoso': buildingSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Idoso');
    }).length,
    'Vaga Grande': buildingSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Grande');
    }).length,
    'Vaga Pequena': buildingSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Pequena');
    }).length,
    'Vaga Presa': buildingSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Presa');
    }).length,
    'Vaga Livre': buildingSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Livre');
    }).length,
    'Vaga Motocicleta': buildingSpots.filter(s => {
      const typeArray = Array.isArray(s.type) ? s.type : [s.type];
      return typeArray.includes('Vaga Motocicleta');
    }).length,
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary rounded-lg flex items-center justify-center">
            <Car className="h-4 w-4 sm:h-6 sm:w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Vagas de Garagem</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Gerencie as Vagas do Estacionamento
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportExcel}
            accept=".xlsx,.xls"
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="w-full sm:w-auto"
          >
            <Upload className="mr-2 h-4 w-4" />
            Importar Excel
          </Button>

          <Button
            variant="outline"
            className="w-full sm:w-auto text-destructive hover:text-destructive"
            onClick={() => {
              const buildingSpots = parkingSpots.filter(s => s.buildingId === selectedBuilding?.id);
              if (buildingSpots.length === 0) {
                toast({
                  title: "Nenhuma vaga",
                  description: "Não há vagas para remover.",
                  variant: "destructive",
                });
                return;
              }
              if (window.confirm(`Tem certeza que deseja remover TODAS as ${buildingSpots.length} vaga(s) deste condomínio?`)) {
                buildingSpots.forEach(s => deleteParkingSpot(s.id));
                toast({
                  title: "Vagas removidas",
                  description: `${buildingSpots.length} vaga(s) foram excluídas.`,
                  variant: "destructive",
                });
              }
            }}
            disabled={buildingSpots.length === 0}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remover Todas
          </Button>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="gradient-primary text-white shadow-medium w-full sm:w-auto"
                onClick={resetForm}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova Vaga
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingSpot ? 'Editar Vaga' : 'Nova Vaga'}
                </DialogTitle>
                <DialogDescription>
                  {editingSpot
                    ? 'Atualize as Informações da Vaga'
                    : 'Preencha os Dados da Nova Vaga'
                  }
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="number">Número da Vaga</Label>
                    <Input
                      id="number"
                      value={formData.number}
                      onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                      placeholder="ex: 001, A15, etc."
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="floor">Andar</Label>
                    <Select
                      value={formData.floor}
                      onValueChange={(value) =>
                        setFormData({ ...formData, floor: value as 'Piso Único' | 'Térreo' | '1° SubSolo' | '2° SubSolo' | '3° SubSolo' | '4° SubSolo' | '5° SubSolo' | 'Ed. Garagem (1° Andar)' | 'Ed. Garagem (2° Andar)' | 'Ed. Garagem (3° Andar)' | 'Ed. Garagem (4° Andar)' | 'Ed. Garagem (5° Andar)' })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Piso Único">Piso Único</SelectItem>
                        <SelectItem value="Térreo">Térreo</SelectItem>
                        <SelectItem value="1° SubSolo">1° SubSolo</SelectItem>
                        <SelectItem value="2° SubSolo">2° SubSolo</SelectItem>
                        <SelectItem value="3° SubSolo">3° SubSolo</SelectItem>
                        <SelectItem value="4° SubSolo">4° SubSolo</SelectItem>
                        <SelectItem value="5° SubSolo">5° SubSolo</SelectItem>
                        <SelectItem value="Ed. Garagem (1° Andar)">Ed. Garagem (1° Andar)</SelectItem>
                        <SelectItem value="Ed. Garagem (2° Andar)">Ed. Garagem (2° Andar)</SelectItem>
                        <SelectItem value="Ed. Garagem (3° Andar)">Ed. Garagem (3° Andar)</SelectItem>
                        <SelectItem value="Ed. Garagem (4° Andar)">Ed. Garagem (4° Andar)</SelectItem>
                        <SelectItem value="Ed. Garagem (5° Andar)">Ed. Garagem (5° Andar)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label>Tipos de Vaga</Label>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="type-comum"
                        checked={formData.type.includes('Vaga Comum')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({ ...formData, type: [...formData.type, 'Vaga Comum'] });
                          } else {
                            setFormData({ ...formData, type: formData.type.filter(t => t !== 'Vaga Comum') });
                          }
                        }}
                      />
                      <Label htmlFor="type-comum">Vaga Comum</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="type-pcd"
                        checked={formData.type.includes('Vaga PcD')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({ ...formData, type: [...formData.type, 'Vaga PcD'] });
                          } else {
                            setFormData({ ...formData, type: formData.type.filter(t => t !== 'Vaga PcD') });
                          }
                        }}
                      />
                      <Label htmlFor="type-pcd">Vaga PcD</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="type-idoso"
                        checked={formData.type.includes('Vaga Idoso')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({ ...formData, type: [...formData.type, 'Vaga Idoso'] });
                          } else {
                            setFormData({ ...formData, type: formData.type.filter(t => t !== 'Vaga Idoso') });
                          }
                        }}
                      />
                      <Label htmlFor="type-idoso">Vaga Idoso</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="type-vaga-pequena"
                        checked={formData.type.includes('Vaga Pequena')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({ ...formData, type: [...formData.type, 'Vaga Pequena'] });
                          } else {
                            setFormData({ ...formData, type: formData.type.filter(t => t !== 'Vaga Pequena') });
                          }
                        }}
                      />
                      <Label htmlFor="type-vaga-pequena">Vaga Pequena</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="type-vaga-grande"
                        checked={formData.type.includes('Vaga Grande')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({ ...formData, type: [...formData.type, 'Vaga Grande'] });
                          } else {
                            setFormData({ ...formData, type: formData.type.filter(t => t !== 'Vaga Grande') });
                          }
                        }}
                      />
                      <Label htmlFor="type-vaga-grande">Vaga Grande</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="type-vaga-motocicleta"
                        checked={formData.type.includes('Vaga Motocicleta')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({
                              ...formData,
                              type: [...formData.type, 'Vaga Motocicleta'],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              type: formData.type.filter(t => t !== 'Vaga Motocicleta'),
                            });
                          }
                        }}
                      />
                      <Label htmlFor="type-vaga-motocicleta">Vaga Motocicleta</Label>
                    </div>

                    

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isCovered"
                        checked={formData.isCovered}
                        onCheckedChange={(checked) => {
                          setFormData({
                            ...formData,
                            isCovered: !!checked,
                          });
                        }}
                      />
                      <Label htmlFor="isCovered">Vaga Coberta</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isUncovered"
                        checked={formData.isUncovered}
                        onCheckedChange={(checked) => {
                          setFormData({
                            ...formData,
                            isUncovered: !!checked,
                          });
                        }}
                      />
                      <Label htmlFor="isUncovered">Vaga Descoberta</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="type-vaga-livre"
                        checked={formData.type.includes('Vaga Livre')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({
                              ...formData,
                              type: [...formData.type, 'Vaga Livre'],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              type: formData.type.filter(t => t !== 'Vaga Livre'),
                            });
                          }
                        }}
                      />
                      <Label htmlFor="type-vaga-livre">Vaga Livre</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="type-vaga-presa"
                        checked={formData.type.includes('Vaga Presa')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({
                              ...formData,
                              type: [...formData.type, 'Vaga Presa'],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              type: formData.type.filter(t => t !== 'Vaga Presa'),
                            });
                          }
                        }}
                      />
                      <Label htmlFor="type-vaga-presa">Vaga Presa</Label>
                    </div>
                  </div>
                </div>

                {/* Mostrar vagas já vinculadas */}
                {editingSpot && editingSpot.groupId && (
                  <div className="space-y-2 border-t pt-4">
                    <Label className="font-medium">Grupo Atual</Label>
                    <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-md border">
                      {parkingSpots
                        .filter(s => s.groupId === editingSpot.groupId && s.id !== editingSpot.id)
                        .sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }))
                        .map(linkedSpot => (
                          <Badge key={linkedSpot.id} variant="secondary" className="text-sm">
                            Vaga {linkedSpot.number} - {linkedSpot.floor}
                          </Badge>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Esta vaga está vinculada com as vagas acima
                    </p>
                  </div>
                )}

                {/* Vincular vagas */}
                <div className="space-y-2 border-t pt-4">
                  <Label className="font-medium">
                    {formData.linkedSpotIds.length > 0
                      ? `Vagas Vinculadas (${formData.linkedSpotIds.length})`
                      : 'Vincular com outras vagas'}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Selecione outras vagas para formar um grupo (caem juntas no sorteio)
                  </p>
                  <ScrollArea className="h-48 border rounded-md p-3">
                    <div className="space-y-2">
                      {(() => {
                        const availableSpots = parkingSpots
                          .filter(s => {
                            const matchesBuilding = s.buildingId === selectedBuilding?.id;
                            const notCurrentSpot = s.id !== editingSpot?.id;
                            // Permitir selecionar vagas que não estão em nenhum grupo OU que estão no grupo atual
                            const notInOtherGroup = !s.groupId || s.groupId === editingSpot?.groupId;

                            return matchesBuilding && notCurrentSpot && notInOtherGroup;
                          })
                          .sort((a, b) => {
                            return a.number.localeCompare(b.number, 'pt-BR', { numeric: true, sensitivity: 'base' });
                          });

                        return availableSpots.length > 0 ? (
                          availableSpots.map(spot => (
                            <div key={spot.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`linked-${spot.id}`}
                                checked={formData.linkedSpotIds.includes(spot.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setFormData({ ...formData, linkedSpotIds: [...formData.linkedSpotIds, spot.id] });
                                  } else {
                                    setFormData({ ...formData, linkedSpotIds: formData.linkedSpotIds.filter(id => id !== spot.id) });
                                  }
                                }}
                              />
                              <Label htmlFor={`linked-${spot.id}`} className="font-normal cursor-pointer">
                                Vaga {spot.number} - {spot.floor}
                                {Array.isArray(spot.type) && spot.type.length > 0 && (
                                  <span className="text-muted-foreground text-xs ml-1">
                                    ({spot.type.join(', ')})
                                  </span>
                                )}
                              </Label>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Nenhuma vaga disponível para vincular
                          </p>
                        );
                      })()}
                    </div>
                  </ScrollArea>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) =>
                      setFormData({ ...formData, status: value as SpotStatus })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Disponível</SelectItem>
                      <SelectItem value="occupied">Ocupada</SelectItem>
                      <SelectItem value="reserved">Reservada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>


                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" className="gradient-primary text-white">
                    {editingSpot ? 'Atualizar' : 'Cadastrar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-lg">Status das Vagas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Disponíveis</span>
              <Badge className="bg-available text-available-foreground">
                {statusCounts.available}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Ocupadas</span>
              <Badge className="bg-occupied text-occupied-foreground">
                {statusCounts.occupied}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Reservadas</span>
              <Badge className="bg-reserved text-reserved-foreground">
                {statusCounts.reserved}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-lg">Tipos de Vagas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Vagas Comuns</span>
              <Badge variant="normal">{typeCounts['Vaga Comum']}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Vagas PcDs</span>
              <Badge variant="pcd">
                {typeCounts['Vaga PcD']}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Vagas Idosos (60+ anos)</span>
              <Badge variant="elderly">{typeCounts['Vaga Idoso']}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Vagas Grandes</span>
              <Badge variant="large">{typeCounts['Vaga Grande']}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Vagas Pequenas</span>
              <Badge variant="small">{typeCounts['Vaga Pequena']}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Vagas Presas</span>
              <Badge variant="linked">{typeCounts['Vaga Presa']}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-lg">Distribuição por Andar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Piso Único</span>
              <Badge variant="outline">
                {buildingSpots.filter(s => s.floor === 'Piso Único').length}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Térreo</span>
              <Badge variant="outline">
                {buildingSpots.filter(s => s.floor === 'Térreo').length}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Subsolos (1° ao 5°)</span>
              <Badge variant="outline">
                {buildingSpots.filter(s => s.floor.includes('SubSolo')).length}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Ed. Garagem (1° ao 5°)</span>
              <Badge variant="outline">
                {buildingSpots.filter(s => s.floor.startsWith('Ed. Garagem')).length}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card className="shadow-soft">
        <CardHeader>
          <div className="flex flex-col space-y-4">
            <div>
              <CardTitle>Listagem de Vagas</CardTitle>
              <CardDescription>
                {filteredSpots.length} vaga(s) cadastrada(s)
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 sm:max-w-xs">
                <Input
                  placeholder="Buscar por número..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={filterFloor} onValueChange={setFilterFloor}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Filtrar andar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os andares</SelectItem>
                  <SelectItem value="Piso Único">Piso Único</SelectItem>
                  <SelectItem value="Térreo">Térreo</SelectItem>
                  <SelectItem value="1° SubSolo">1° SubSolo</SelectItem>
                  <SelectItem value="2° SubSolo">2° SubSolo</SelectItem>
                  <SelectItem value="3° SubSolo">3° SubSolo</SelectItem>
                  <SelectItem value="4° SubSolo">4° SubSolo</SelectItem>
                  <SelectItem value="5° SubSolo">5° SubSolo</SelectItem>
                  <SelectItem value="Ed. Garagem (1° Andar)">Ed. Garagem (1° Andar)</SelectItem>
                  <SelectItem value="Ed. Garagem (2° Andar)">Ed. Garagem (2° Andar)</SelectItem>
                  <SelectItem value="Ed. Garagem (3° Andar)">Ed. Garagem (3° Andar)</SelectItem>
                  <SelectItem value="Ed. Garagem (4° Andar)">Ed. Garagem (4° Andar)</SelectItem>
                  <SelectItem value="Ed. Garagem (5° Andar)">Ed. Garagem (5° Andar)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Filtrar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="Vaga Comum">Vaga Comum</SelectItem>
                  <SelectItem value="Vaga PcD">Vaga PcD</SelectItem>
                  <SelectItem value="Vaga Idoso">Vaga Idoso</SelectItem>
                  <SelectItem value="Vaga Grande">Vaga Grande</SelectItem>
                  <SelectItem value="Vaga Pequena">Vaga Pequena</SelectItem>
                  <SelectItem value="Vaga Presa">Vaga Presa</SelectItem>
                  <SelectItem value="Vaga Livre">Vaga Livre</SelectItem>
                  <SelectItem value="Vaga Motocicleta">Vaga Motocicleta</SelectItem>
                  <SelectItem value="Vaga Coberta">Vaga Coberta</SelectItem>
                  <SelectItem value="Vaga Descoberta">Vaga Descoberta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <ScrollArea className="h-[600px]">
            <div className="min-w-[700px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Vaga</TableHead>
                    <TableHead className="min-w-[130px]">Localização</TableHead>
                    <TableHead className="min-w-[100px]">Tipo</TableHead>
                    <TableHead className="min-w-[150px]">Grupo</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="text-right min-w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSpots.map((spot) => (
                    <TableRow key={spot.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                            <MapPin className="h-4 w-4 text-primary-foreground" />
                          </div>
                          <span className="font-medium">#{spot.number}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{spot.floor}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(Array.isArray(spot.type) ? spot.type : [spot.type])
                            .filter(type => {
                              // Não mostrar "Vaga Comum" se for coberta ou descoberta
                              if ((spot.isCovered || spot.isUncovered) && type === 'Vaga Comum') {
                                return false;
                              }
                              return true;
                            })
                            .map((type, index) => (
                              <span key={index}>{getTypeBadge(type)}</span>
                            ))}
                          {getCoverageBadge(spot)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {spot.groupId ? (
                          <div className="flex flex-wrap gap-1">
                            {parkingSpots
                              .filter(s => s.groupId === spot.groupId && s.id !== spot.id)
                              .sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true, sensitivity: 'base' }))
                              .map(groupSpot => (
                                <Badge key={groupSpot.id} variant="outline" className="text-xs">
                                  #{groupSpot.number}
                                </Badge>
                              ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(spot.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(spot)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(spot.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};