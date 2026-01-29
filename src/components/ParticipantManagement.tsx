import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Edit, Trash2, Users, AlertCircle, User, Upload, FileSpreadsheet, CheckCircle2, XCircle } from 'lucide-react';
import { Participant } from '@/types/lottery';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ImportPreview {
  bloco: string;
  unidade: string;
  caracteristicas: string;
  name?: string;
  hasSpecialNeeds: boolean;
  isElderly: boolean;
  hasLargeCar: boolean;
  hasSmallCar: boolean;
  hasMotorcycle: boolean;
  prefersCommonSpot: boolean;
  prefersCovered: boolean;
  prefersUncovered: boolean;
  prefersLinkedSpot: boolean;
  prefersUnlinkedSpot: boolean;
  prefersSmallSpot: boolean;
  isUpToDate: boolean;
  valid: boolean;
  error?: string;
}

export const ParticipantManagement = () => {
  const { participants, addParticipant, updateParticipant, deleteParticipant, selectedBuilding } = useAppContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBlock, setFilterBlock] = useState<string>('all');
  const [filterCharacteristic, setFilterCharacteristic] = useState<string>('all');
  const [importPreview, setImportPreview] = useState<ImportPreview[]>([]);
  const [editingImportRow, setEditingImportRow] = useState<number | null>(null);
  const [editingImportData, setEditingImportData] = useState<{
    name: string;
    hasSpecialNeeds: boolean;
    isElderly: boolean;
    hasLargeCar: boolean;
    isUpToDate: boolean;
  }>({
    name: '',
    hasSpecialNeeds: false,
    isElderly: false,
    hasLargeCar: false,
    isUpToDate: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    block: '',
    unit: '',
    hasSpecialNeeds: false,
    isElderly: false,
    hasLargeCar: false,
    hasSmallCar: false,
    hasMotorcycle: false,
    isUpToDate: true,
    prefersCommonSpot: false,
    prefersCovered: false,
    prefersUncovered: false,
    prefersLinkedSpot: false,
    prefersUnlinkedSpot: false,
    prefersSmallSpot: false,
    numberOfSpots: 1,
    preferredFloors: [] as string[],
    linkedParticipantIds: [] as string[],
  });

  // Get unique blocks for filter
  const buildingParticipants = participants.filter(p => p.buildingId === selectedBuilding?.id);
  const uniqueBlocks = [...new Set(buildingParticipants.map(p => p.block))].sort((a, b) => 
    a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
  );

  const filteredParticipants = participants
    .filter(participant => {
      const matchesBuilding = participant.buildingId === selectedBuilding?.id;
      const matchesSearch = 
        participant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        participant.block.toLowerCase().includes(searchTerm.toLowerCase()) ||
        participant.unit.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBlock = filterBlock === 'all' || participant.block === filterBlock;

      let matchesCharacteristic = filterCharacteristic === 'all';
      if (filterCharacteristic === 'PcD') {
        matchesCharacteristic = participant.hasSpecialNeeds === true;
      } else if (filterCharacteristic === 'Idoso') {
        matchesCharacteristic = participant.isElderly === true;
      } else if (filterCharacteristic === 'VeiculoPequeno') {
        matchesCharacteristic = participant.hasSmallCar === true;
      } else if (filterCharacteristic === 'VeiculoGrande') {
        matchesCharacteristic = participant.hasLargeCar === true;
      } else if (filterCharacteristic === 'Motocicleta') {
        matchesCharacteristic = participant.hasMotorcycle === true;
      } else if (filterCharacteristic === 'PrefComum') {
        matchesCharacteristic = participant.prefersCommonSpot === true;
      } else if (filterCharacteristic === 'PrefCoberta') {
        matchesCharacteristic = participant.prefersCovered === true;
      } else if (filterCharacteristic === 'PrefDescoberta') {
        matchesCharacteristic = participant.prefersUncovered === true;
      } else if (filterCharacteristic === 'PrefLivre') {
        matchesCharacteristic = participant.prefersUnlinkedSpot === true;
      } else if (filterCharacteristic === 'PrefPresa') {
        matchesCharacteristic = participant.prefersLinkedSpot === true;
      } else if (filterCharacteristic === 'Inadimplente') {
        matchesCharacteristic = participant.isUpToDate === false;
      }

      return matchesBuilding && matchesSearch && matchesBlock && matchesCharacteristic;
    })
    .sort((a, b) => {
      // Ordenar por bloco
      const blockCompare = a.block.localeCompare(b.block, 'pt-BR', { numeric: true, sensitivity: 'base' });
      if (blockCompare !== 0) return blockCompare;
      
      // Se bloco for igual, ordenar por unidade
      return a.unit.localeCompare(b.unit, 'pt-BR', { numeric: true, sensitivity: 'base' });
    });

  const resetForm = () => {
    setFormData({
      name: '',
      block: '',
      unit: '',
      hasSpecialNeeds: false,
      isElderly: false,
      hasLargeCar: false,
      hasSmallCar: false,
      hasMotorcycle: false,
      isUpToDate: true,
      prefersCommonSpot: false,
      prefersCovered: false,
      prefersUncovered: false,
      prefersLinkedSpot: false,
      prefersUnlinkedSpot: false,
      prefersSmallSpot: false,
      numberOfSpots: 1,
      preferredFloors: [],
      linkedParticipantIds: [],
    });
    setEditingParticipant(null);
  };

  // Helper function to normalize block/unit values (remove leading zeros and lowercase)
  const normalizeValue = (value: string): string => {
    return value.trim().replace(/^0+/, '').toLowerCase();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for duplicates with normalized values
    const isDuplicate = participants.some(p => 
      p.buildingId === selectedBuilding?.id &&
      normalizeValue(p.block) === normalizeValue(formData.block) &&
      normalizeValue(p.unit) === normalizeValue(formData.unit) &&
      p.id !== editingParticipant?.id
    );

    if (isDuplicate) {
      toast({
        title: "Participante duplicado",
        description: "Já existe um participante cadastrado para este Bloco/Unidade.",
        variant: "destructive",
      });
      return;
    }

    const currentParticipantId = editingParticipant?.id || `participant-${Date.now()}`;
    
    // Gerar groupId se houver participantes vinculados OU se tiver múltiplas vagas
    let groupId = '';
    const numberOfSpots = formData.numberOfSpots || 1;
    
    if (formData.linkedParticipantIds.length > 0) {
      // Se já tem um grupo existente, manter o mesmo groupId
      const existingGroupParticipant = participants.find(p => 
        formData.linkedParticipantIds.includes(p.id) && p.groupId
      );
      groupId = existingGroupParticipant?.groupId || `group-${Date.now()}`;
    } else if (numberOfSpots > 1) {
      // Se tem múltiplas vagas e não está em grupo, criar um groupId individual
      groupId = editingParticipant?.groupId || `multi-spot-${currentParticipantId}`;
    }
    
    if (editingParticipant) {
      // Update existing participant
      const updatedParticipant = {
        ...editingParticipant,
        ...formData,
        preferredFloors: formData.preferredFloors.length > 0 ? formData.preferredFloors : undefined,
        numberOfSpots: numberOfSpots,
        groupId: groupId || undefined
      };
      updateParticipant(updatedParticipant);

      // Atualizar vinculação mútua nos outros participantes
      const oldLinkedIds = participants
        .filter(p => p.groupId === editingParticipant.groupId && p.id !== editingParticipant.id)
        .map(p => p.id);
      const newLinkedIds = formData.linkedParticipantIds;
      
      // Array com todos os IDs do grupo (incluindo o participante atual)
      const allGroupParticipantIds = [currentParticipantId, ...newLinkedIds];
      
      // Remover groupId dos participantes que não estão mais vinculados
      oldLinkedIds.forEach(linkedId => {
        if (!newLinkedIds.includes(linkedId)) {
          const linkedParticipant = participants.find(p => p.id === linkedId);
          if (linkedParticipant) {
            // Verificar se este participante ainda tem outros membros no grupo
            const otherGroupMembers = allGroupParticipantIds.filter(id => 
              id !== linkedId && id !== currentParticipantId
            );
            
            const updatedLinkedParticipant = {
              ...linkedParticipant,
              groupId: otherGroupMembers.length > 0 ? linkedParticipant.groupId : undefined
            };
            updateParticipant(updatedLinkedParticipant);
          }
        }
      });
      
      // Atualizar todos os participantes vinculados para terem o mesmo groupId
      if (groupId) {
        newLinkedIds.forEach(linkedId => {
          const linkedParticipant = participants.find(p => p.id === linkedId);
          if (linkedParticipant) {
            const updatedLinkedParticipant = {
              ...linkedParticipant,
              groupId: groupId
            };
            updateParticipant(updatedLinkedParticipant);
          }
        });
      }
      
      toast({
        title: "Participante atualizado",
        description: "Os dados foram salvos com sucesso e as vinculações foram atualizadas.",
      });
    } else {
      // Create new participant
      const newParticipant: Participant = {
        id: currentParticipantId,
        buildingId: selectedBuilding?.id || '',
        ...formData,
        preferredFloors: formData.preferredFloors.length > 0 ? formData.preferredFloors : undefined,
        groupId: groupId || undefined,
        createdAt: new Date(),
      };
      addParticipant(newParticipant);
      
      // Atualizar todos os participantes vinculados para terem o mesmo groupId
      if (groupId) {
        formData.linkedParticipantIds.forEach(linkedId => {
          const linkedParticipant = participants.find(p => p.id === linkedId);
          if (linkedParticipant) {
            const updatedLinkedParticipant = {
              ...linkedParticipant,
              groupId: groupId
            };
            updateParticipant(updatedLinkedParticipant);
          }
        });
      }
      
      toast({
        title: "Participante cadastrado",
        description: "Novo participante foi adicionado ao sistema e as vinculações foram criadas.",
      });
    }
    
    setIsDialogOpen(false);
    resetForm();
  };

  const handleEdit = (participant: Participant) => {
    // Buscar outros participantes do mesmo grupo
    const linkedParticipantIds = participant.groupId 
      ? participants
          .filter(p => 
            p.groupId === participant.groupId && 
            p.id !== participant.id &&
            p.buildingId === selectedBuilding?.id
          )
          .map(p => p.id)
      : [];

    // Linha 259-276 do seu código
    setFormData({
      name: participant.name,
      block: participant.block,
      unit: participant.unit,
      hasSpecialNeeds: participant.hasSpecialNeeds,
      isElderly: participant.isElderly || false,
      hasLargeCar: participant.hasLargeCar || false,
      hasSmallCar: participant.hasSmallCar || false,
      hasMotorcycle: participant.hasMotorcycle || false,
      isUpToDate: participant.isUpToDate || false,
      prefersCommonSpot: participant.prefersCommonSpot || false,
      prefersCovered: participant.prefersCovered || false,
      prefersUncovered: participant.prefersUncovered || false,
      prefersLinkedSpot: participant.prefersLinkedSpot || false,
      prefersUnlinkedSpot: participant.prefersUnlinkedSpot || false,
      prefersSmallSpot: participant.prefersSmallSpot || false,
      numberOfSpots: participant.numberOfSpots || 1,
      preferredFloors: participant.preferredFloors || [],
      linkedParticipantIds: linkedParticipantIds,
    });
    setEditingParticipant(participant);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    const participant = participants.find(p => p.id === id);
    const participantName = participant
      ? `${participant.block ? `Bloco ${participant.block} - ` : ''}Unidade ${participant.unit}${participant.name ? ` (${participant.name})` : ''}`
      : 'este participante';

    if (window.confirm(`Tem certeza que deseja excluir ${participantName}?`)) {
      deleteParticipant(id);
      toast({
        title: "Participante removido",
        description: "O participante foi excluído do sistema.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAll = () => {
    const buildingParticipants = participants.filter(p => p.buildingId === selectedBuilding?.id);
    
    if (buildingParticipants.length === 0) {
      toast({
        title: "Nenhum participante",
        description: "Não há participantes para remover.",
        variant: "destructive",
      });
      return;
    }

    if (window.confirm(`Tem certeza que deseja remover TODOS os ${buildingParticipants.length} participante(s) deste condomínio?`)) {
      buildingParticipants.forEach(p => deleteParticipant(p.id));
      toast({
        title: "Participantes removidos",
        description: `${buildingParticipants.length} participante(s) foram excluídos.`,
        variant: "destructive",
      });
    }
  };

  const getPriorityBadges = (participant: Participant) => {
    const badges = [];
    if (participant.hasSpecialNeeds) badges.push({ label: 'PcD (Pessoa com Deficiência)', variant: 'pcd' });
    if (participant.isElderly) badges.push({ label: 'Idoso (60+ anos)', variant: 'elderly' });
    if (participant.hasSmallCar) badges.push({ label: 'Veículo Pequeno', variant: 'small' });
    if (participant.hasLargeCar) badges.push({ label: 'Veículo Grande', variant: 'large' });
    if (participant.hasMotorcycle) badges.push({ label: 'Motocicleta', variant: 'motorcycle' });
    if (participant.prefersCommonSpot) badges.push({ label: 'Pref. por Vaga Comum', variant: 'common' });
    if (participant.prefersCovered) badges.push({ label: 'Pref. por Vaga Coberta', variant: 'covered' });
    if (participant.prefersUncovered) badges.push({ label: 'Pref. por Vaga Descoberta', variant: 'uncovered' });
    if (participant.prefersUnlinkedSpot) badges.push({ label: 'Pref. por Vaga Livre', variant: 'unlinked' });
    if (participant.prefersLinkedSpot) badges.push({ label: 'Pref. por Vaga Presa', variant: 'linked' });
    if (participant.prefersSmallSpot) badges.push({ label: 'Pref. por Vaga Pequena', variant: 'small' });
    // Inadimplente é mantido internamente mas não exibido visualmente
    if (participant.numberOfSpots && participant.numberOfSpots > 1) {
      badges.push({ label: `${participant.numberOfSpots} Vagas`, variant: 'default' });
    }
    if (participant.preferredFloors && participant.preferredFloors.length > 0) {
      const floorsLabel = participant.preferredFloors.length === 1 
        ? `Andar: ${participant.preferredFloors[0]}`
        : `Andares: ${participant.preferredFloors.length} selecionados`;
      badges.push({ label: floorsLabel, variant: 'floor' });
    }
    return badges;
  };

  const parseCharacteristics = (caracString: string) => {
    const carac = (caracString || '').toUpperCase().trim();
    return {
      hasSpecialNeeds: carac.includes('PCD'),
      isElderly: carac.includes('IDOSO'),
      hasSmallCar: carac.includes('VEIC. PEQUENO') || carac.includes('VEICULO PEQUENO') || carac.includes('VEÍCULO PEQUENO') || carac.includes('VEI. PEQUENO'),
      hasLargeCar: carac.includes('VEIC. GRANDE') || carac.includes('VEICULO GRANDE') || carac.includes('VEÍCULO GRANDE') || carac.includes('VEI. GRANDE'),
      hasMotorcycle: carac.includes('MOTOCICLETA') || carac.includes('MOTO'),
      prefersCommonSpot: carac.includes('PREF. VAGA COMUM') || carac.includes('PREF. POR VAGA COMUM'),
      prefersCovered: carac.includes('PREF. VAGA COBERTA') || carac.includes('PREF. POR VAGA COBERTA'),
      prefersUncovered: carac.includes('PREF. VAGA DESCOBERTA') || carac.includes('PREF. POR VAGA DESCOBERTA'),
      prefersLinkedSpot: carac.includes('PREF. VAGA PRESA') || carac.includes('PREF. POR VAGA PRESA'),
      prefersUnlinkedSpot: carac.includes('PREF. VAGA LIVRE') || carac.includes('PREF. POR VAGA LIVRE'),
      prefersSmallSpot: carac.includes('PREF. VAGA PEQUENA') || carac.includes('PREF. POR VAGA PEQUENA'),
      isUpToDate: !carac.includes('INADIMPLENTE'),
    };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

        const preview: ImportPreview[] = jsonData.map((row: any, index: number) => {
          const bloco = String(row['BLOCO'] || '').trim();
          const unidade = String(row['UNIDADE'] || '').trim();
          const prioridade = String(row['PRIORIDADE'] || '').trim();

          // Validações
          let valid = true;
          let error = '';

          if (!bloco || !unidade) {
            valid = false;
            error = 'BLOCO e UNIDADE são obrigatórios';
          }

          // Verifica duplicados no arquivo
          const duplicateInFile = jsonData.some((otherRow: any, otherIndex: number) => {
            if (otherIndex >= index) return false;
            return normalizeValue(String(otherRow['BLOCO'] || '')) === normalizeValue(bloco) &&
                   normalizeValue(String(otherRow['UNIDADE'] || '')) === normalizeValue(unidade);
          });

          if (duplicateInFile) {
            valid = false;
            error = 'Duplicado no arquivo';
          }

          // Verifica duplicados no sistema
          const duplicateInSystem = participants.some(p =>
            p.buildingId === selectedBuilding?.id &&
            normalizeValue(p.block) === normalizeValue(bloco) &&
            normalizeValue(p.unit) === normalizeValue(unidade)
          );

          if (duplicateInSystem) {
            valid = false;
            error = 'Já existe no sistema';
          }

          const chars = parseCharacteristics(prioridade);

          return {
            bloco,
            unidade,
            caracteristicas: prioridade,
            ...chars,
            valid,
            error,
          };
        });

        setImportPreview(preview);
        setIsImportDialogOpen(true);
      } catch (error) {
        toast({
          title: "Erro ao ler arquivo",
          description: "Verifique se o arquivo está no formato correto (.xlsx)",
          variant: "destructive",
        });
      }
    };

    reader.readAsArrayBuffer(file);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = () => {
    const validRows = importPreview.filter(row => row.valid);
    
    if (validRows.length === 0) {
      toast({
        title: "Nenhum participante válido",
        description: "Corrija os erros antes de importar",
        variant: "destructive",
      });
      return;
    }

    // Ordenar por bloco e unidade antes de adicionar
    const sortedRows = validRows.sort((a, b) => {
      const blockCompare = a.bloco.localeCompare(b.bloco, undefined, { numeric: true, sensitivity: 'base' });
      if (blockCompare !== 0) return blockCompare;
      return a.unidade.localeCompare(b.unidade, undefined, { numeric: true, sensitivity: 'base' });
    });

    sortedRows.forEach(row => {
      const newParticipant: Participant = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        buildingId: selectedBuilding?.id || '',
        name: row.name?.trim() || '',
        block: row.bloco,
        unit: row.unidade,
        hasSpecialNeeds: row.hasSpecialNeeds,
        isElderly: row.isElderly,
        hasLargeCar: row.hasLargeCar,
        hasSmallCar: row.hasSmallCar,
        hasMotorcycle: row.hasMotorcycle,
        prefersCommonSpot: row.prefersCommonSpot,
        prefersCovered: row.prefersCovered,
        prefersUncovered: row.prefersUncovered,
        prefersLinkedSpot: row.prefersLinkedSpot,
        prefersUnlinkedSpot: row.prefersUnlinkedSpot,
        prefersSmallSpot: row.prefersSmallSpot,
        isUpToDate: row.isUpToDate,
        createdAt: new Date(),
      };
      addParticipant(newParticipant);
    });

    toast({
      title: "Importação concluída",
      description: `${sortedRows.length} participante(s) cadastrado(s) com sucesso`,
    });

    setIsImportDialogOpen(false);
    setImportPreview([]);
  };

  const handleEditImportRow = (index: number) => {
    const row = importPreview[index];
    setEditingImportData({
      name: row.name || '',
      hasSpecialNeeds: row.hasSpecialNeeds,
      isElderly: row.isElderly,
      hasLargeCar: row.hasLargeCar,
      isUpToDate: row.isUpToDate,
    });
    setEditingImportRow(index);
  };

  const handleSaveImportRowEdit = () => {
    if (editingImportRow === null) return;

    const updatedPreview = [...importPreview];
    updatedPreview[editingImportRow] = {
      ...updatedPreview[editingImportRow],
      name: editingImportData.name.trim() || undefined,
      hasSpecialNeeds: editingImportData.hasSpecialNeeds,
      isElderly: editingImportData.isElderly,
      hasLargeCar: editingImportData.hasLargeCar,
      isUpToDate: editingImportData.isUpToDate,
    };

    setImportPreview(updatedPreview);
    setEditingImportRow(null);
    toast({
      title: "Linha atualizada",
      description: "As alterações foram salvas no preview",
    });
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-accent rounded-lg flex items-center justify-center">
            <Users className="h-4 w-4 sm:h-6 sm:w-6 text-accent-foreground" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Participantes/Unidades</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Gerencie os Participantes do Sorteio
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Importar Excel
          </Button>

          <Button
            variant="outline"
            className="w-full sm:w-auto text-destructive hover:text-destructive"
            onClick={handleDeleteAll}
            disabled={filteredParticipants.length === 0}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remover Todos
          </Button>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="gradient-primary text-white shadow-medium w-full sm:w-auto" 
                onClick={resetForm}
              >
                <Plus className="mr-2 h-4 w-4" />
                Novo Participante/Unidade
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingParticipant ? 'Editar Participante/Unidade' : 'Novo Participante/Unidade'}
              </DialogTitle>
              <DialogDescription>
                {editingParticipant 
                  ? 'Atualize as Informações do Participante'
                  : 'Preencha os Dados do Novo Participante'
                }
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pr-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="block">Bloco</Label>
                  <Input
                    id="block"
                    value={formData.block}
                    onChange={(e) => setFormData({...formData, block: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="unit">Unidade</Label>
                <Input
                  id="unit"
                  value={formData.unit}
                  onChange={(e) => setFormData({...formData, unit: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="numberOfSpots">Número de Vagas</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Defina quantas vagas este participante tem direito (padrão: 1)
                </p>
                <Input
                  id="numberOfSpots"
                  type="number"
                  min="1"
                  max="10"
                  value={formData.numberOfSpots}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 1;
                    setFormData({...formData, numberOfSpots: Math.max(1, Math.min(10, value))});
                  }}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Grupo para Vagas Presas</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Selecione outros participantes que compartilharão vagas presas com este
                </p>
                <ScrollArea className="h-[150px] rounded-md border p-3">
                  <div className="space-y-2">
                    {participants
                      .filter(p => 
                        p.buildingId === selectedBuilding?.id && 
                        p.id !== editingParticipant?.id
                      )
                      .sort((a, b) => {
                        const blockCompare = a.block.localeCompare(b.block, 'pt-BR', { numeric: true });
                        if (blockCompare !== 0) return blockCompare;
                        return a.unit.localeCompare(b.unit, 'pt-BR', { numeric: true });
                      })
                      .map(participant => (
                        <div key={participant.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`link-participant-${participant.id}`}
                            checked={formData.linkedParticipantIds.includes(participant.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFormData({
                                  ...formData,
                                  linkedParticipantIds: [...formData.linkedParticipantIds, participant.id]
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  linkedParticipantIds: formData.linkedParticipantIds.filter(id => id !== participant.id)
                                });
                              }
                            }}
                          />
                          <Label 
                            htmlFor={`link-participant-${participant.id}`}
                            className="text-sm font-normal cursor-pointer flex items-center gap-2"
                          >
                            <span className="font-medium">Bloco {participant.block} - Unidade {participant.unit}</span>
                            {participant.name && (
                              <span className="text-muted-foreground">({participant.name})</span>
                            )}
                            {participant.groupId && (
                              <Badge variant="outline" className="text-xs">
                                Já em grupo
                              </Badge>
                            )}
                          </Label>
                        </div>
                      ))}
                    {participants.filter(p => p.buildingId === selectedBuilding?.id && p.id !== editingParticipant?.id).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Nenhum outro participante cadastrado
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>

                <div className="space-y-4">
                <Label>Características Especiais</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasSpecialNeeds"
                      checked={formData.hasSpecialNeeds}
                      onCheckedChange={(checked) => 
                        setFormData({...formData, hasSpecialNeeds: !!checked})
                      }
                    />
                    <Label htmlFor="hasSpecialNeeds">PcD (Pessoa com Deficiência)</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isElderly"
                      checked={formData.isElderly}
                      onCheckedChange={(checked) => 
                        setFormData({...formData, isElderly: !!checked})
                      }
                    />
                    <Label htmlFor="isElderly">Idoso (60+ anos)</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasSmallCar"
                      checked={formData.hasSmallCar}
                      onCheckedChange={(checked) => 
                        setFormData({...formData, hasSmallCar: !!checked})
                      }
                    />
                    <Label htmlFor="hasSmallCar">Veículo Pequeno</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasLargeCar"
                      checked={formData.hasLargeCar}
                      onCheckedChange={(checked) => 
                        setFormData({...formData, hasLargeCar: !!checked})
                      }
                    />
                    <Label htmlFor="hasLargeCar">Veículo Grande</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasMotorcycle"
                      checked={formData.hasMotorcycle}
                      onCheckedChange={(checked) => 
                        setFormData({...formData, hasMotorcycle: !!checked})
                      }
                    />
                    <Label htmlFor="hasMotorcycle">Motocicleta</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="prefersCommonSpot"
                      checked={formData.prefersCommonSpot}
                      onCheckedChange={(checked) => 
                        setFormData({...formData, prefersCommonSpot: !!checked})
                      }
                    />
                    <Label htmlFor="prefersCommonSpot">Pref. por Vaga Comum</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="prefersCovered"
                      checked={formData.prefersCovered}
                      onCheckedChange={(checked) => 
                        setFormData({...formData, prefersCovered: !!checked})
                      }
                    />
                    <Label htmlFor="prefersCovered">Pref. por Vaga Coberta</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="prefersUncovered"
                      checked={formData.prefersUncovered}
                      onCheckedChange={(checked) => 
                        setFormData({...formData, prefersUncovered: !!checked})
                      }
                    />
                    <Label htmlFor="prefersUncovered">Pref. por Vaga Descoberta</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="prefersUnlinkedSpot"
                      checked={formData.prefersUnlinkedSpot}
                      onCheckedChange={(checked) => 
                        setFormData({...formData, prefersUnlinkedSpot: !!checked})
                      }
                    />
                    <Label htmlFor="prefersUnlinkedSpot">Pref. por Vaga Livre</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="prefersLinkedSpot"
                      checked={formData.prefersLinkedSpot}
                      onCheckedChange={(checked) => 
                        setFormData({...formData, prefersLinkedSpot: !!checked})
                      }
                    />
                    <Label htmlFor="prefersLinkedSpot">Pref. por Vaga Presa</Label>
                  </div>

                    <div className="space-y-2">
                      <Label>Andares Preferidos (múltipla escolha)</Label>
                      <div className="grid grid-cols-2 gap-2 p-3 border rounded-md bg-muted/30 max-h-48 overflow-y-auto">
                        {[
                          'Piso Único',
                          'Térreo',
                          '1° SubSolo',
                          '2° SubSolo',
                          '3° SubSolo',
                          '4° SubSolo',
                          '5° SubSolo',
                          'Ed. Garagem (1° Andar)',
                          'Ed. Garagem (2° Andar)',
                          'Ed. Garagem (3° Andar)',
                          'Ed. Garagem (4° Andar)',
                          'Ed. Garagem (5° Andar)',
                        ].map((floor) => (
                          <div key={floor} className="flex items-center space-x-2">
                            <Checkbox
                              id={`floor-${floor}`}
                              checked={formData.preferredFloors.includes(floor)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setFormData({
                                    ...formData,
                                    preferredFloors: [...formData.preferredFloors, floor],
                                  });
                                } else {
                                  setFormData({
                                    ...formData,
                                    preferredFloors: formData.preferredFloors.filter((f) => f !== floor),
                                  });
                                }
                              }}
                            />
                            <Label htmlFor={`floor-${floor}`} className="text-sm cursor-pointer">
                              {floor}
                            </Label>
                          </div>
                        ))}
                      </div>
                      {formData.preferredFloors.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {formData.preferredFloors.length} andar(es) selecionado(s)
                        </p>
                      )}
                    </div>
                  
                  {/* Campo Inadimplente oculto - mantido internamente */}
                </div>
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
                  {editingParticipant ? 'Atualizar' : 'Cadastrar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>

      {/* Import Preview Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Preview da Importação
            </DialogTitle>
            <DialogDescription>
              Revise os dados antes de confirmar a importação. 
              Linhas com erro não serão importadas.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 max-h-[50vh]">
            <div className="min-w-[700px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Status</TableHead>
                    <TableHead>Bloco</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Características</TableHead>
                    <TableHead>Observações</TableHead>
                    <TableHead className="w-20">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importPreview.map((row, index) => (
                    <TableRow key={index} className={!row.valid ? 'bg-destructive/10' : ''}>
                      <TableCell>
                        {row.valid ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{row.bloco}</TableCell>
                      <TableCell>{row.unidade}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.hasSpecialNeeds && (
                            <Badge variant="pcd" className="text-xs">
                              PcD
                            </Badge>
                          )}
                          {row.isElderly && (
                            <Badge variant="elderly" className="text-xs">
                              Idoso
                            </Badge>
                          )}
                          {row.hasLargeCar && (
                            <Badge variant="large" className="text-xs">
                              Veíc. Grande
                            </Badge>
                          )}
                          {row.prefersCovered && (
                            <Badge variant="covered" className="text-xs">
                              Vaga Coberta
                            </Badge>
                          )}
                          {row.prefersUncovered && (
                            <Badge variant="uncovered" className="text-xs">
                              Vaga Descoberta
                            </Badge>
                          )}
                          {row.prefersLinkedSpot && (
                            <Badge variant="linked" className="text-xs">
                              Vaga Presa
                            </Badge>
                          )}
                          {row.prefersUnlinkedSpot && (
                            <Badge variant="unlinked" className="text-xs">
                              Vaga Livre
                            </Badge>
                          )}
                          {row.prefersSmallSpot && (
                            <Badge variant="small" className="text-xs">
                              Vaga Pequena
                            </Badge>
                          )}
                          {/* Inadimplente oculto */}
                          {!row.hasSpecialNeeds && !row.isElderly && !row.hasLargeCar &&
                            !row.prefersCovered && !row.prefersUncovered && !row.prefersLinkedSpot &&
                            !row.prefersUnlinkedSpot && !row.prefersSmallSpot && row.isUpToDate && (
                              <span className="text-xs text-muted-foreground">Nenhuma</span>
                            )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.error && (
                          <span className="text-xs text-destructive">{row.error}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditImportRow(index)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Total: {importPreview.length} | 
                Válidos: {importPreview.filter(r => r.valid).length} | 
                Com erro: {importPreview.filter(r => !r.valid).length}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsImportDialogOpen(false);
                    setImportPreview([]);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  className="gradient-primary text-white"
                  onClick={handleConfirmImport}
                  disabled={importPreview.filter(r => r.valid).length === 0}
                >
                  Confirmar Importação ({importPreview.filter(r => r.valid).length})
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Import Row Dialog */}
        <Dialog open={editingImportRow !== null} onOpenChange={(open) => !open && setEditingImportRow(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Editar Linha da Importação</DialogTitle>
              <DialogDescription>
                Ajuste as características especiais antes de importar
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome (opcional)</Label>
                <Input
                  id="edit-name"
                  value={editingImportData.name}
                  onChange={(e) => setEditingImportData({...editingImportData, name: e.target.value})}
                  placeholder="Ex: João Silva"
                />
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para usar o padrão: Unidade X - Bloco Y
                </p>
              </div>

              <div className="space-y-4">
                <Label>Características Especiais</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit-hasSpecialNeeds"
                      checked={editingImportData.hasSpecialNeeds}
                      onCheckedChange={(checked) => 
                        setEditingImportData({...editingImportData, hasSpecialNeeds: !!checked})
                      }
                    />
                    <Label htmlFor="edit-hasSpecialNeeds">PcD (Pessoa com Deficiência)</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit-isElderly"
                      checked={editingImportData.isElderly}
                      onCheckedChange={(checked) => 
                        setEditingImportData({...editingImportData, isElderly: !!checked})
                      }
                    />
                    <Label htmlFor="edit-isElderly">Idoso (60+ anos)</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit-hasLargeCar"
                      checked={editingImportData.hasLargeCar}
                      onCheckedChange={(checked) => 
                        setEditingImportData({...editingImportData, hasLargeCar: !!checked})
                      }
                    />
                    <Label htmlFor="edit-hasLargeCar">Veículo Grande</Label>
                  </div>
                  {/* Campo Inadimplente oculto */}
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingImportRow(null)}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSaveImportRowEdit}
                  className="gradient-primary text-white"
                >
                  Salvar Alterações
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters and Search */}
      <Card className="shadow-soft">
        <CardHeader>
          <div className="flex flex-col space-y-4">
            <div>
              <CardTitle>Listagem de Participantes/Unidades</CardTitle>
              <CardDescription>
                {filteredParticipants.length} participante(s) cadastrado(s)
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 sm:max-w-xs">
                <Input
                  placeholder="Buscar por nome, bloco ou unidade..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={filterBlock} onValueChange={setFilterBlock}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Filtrar bloco" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os blocos</SelectItem>
                  {uniqueBlocks.map(block => (
                    <SelectItem key={block} value={block}>Bloco {block}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterCharacteristic} onValueChange={setFilterCharacteristic}>
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue placeholder="Filtrar característica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as características</SelectItem>
                  <SelectItem value="PcD">PcD (Pessoa com Deficiência)</SelectItem>
                  <SelectItem value="Idoso">Idoso (60+ anos)</SelectItem>
                  <SelectItem value="VeiculoPequeno">Veículo Pequeno</SelectItem>
                  <SelectItem value="VeiculoGrande">Veículo Grande</SelectItem>
                  <SelectItem value="Motocicleta">Motocicleta</SelectItem>
                  <SelectItem value="PrefComum">Pref. por Vaga Comum</SelectItem>
                  <SelectItem value="PrefCoberta">Pref. por Vaga Coberta</SelectItem>
                  <SelectItem value="PrefDescoberta">Pref. por Vaga Descoberta</SelectItem>
                  <SelectItem value="PrefLivre">Pref. por Vaga Livre</SelectItem>
                  <SelectItem value="PrefPresa">Pref. por Vaga Presa</SelectItem>
                  {/* Inadimplente removido do filtro */}
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
                    <TableHead className="min-w-[200px]">Participante</TableHead>
                    <TableHead className="min-w-[120px]">Bloco/Unidade</TableHead>
                    <TableHead className="min-w-[100px]">Grupo</TableHead>
                    <TableHead className="min-w-[180px]">Prioridades</TableHead>
                    <TableHead className="text-right min-w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredParticipants.map((participant) => (
                    <TableRow key={participant.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                            <User className="h-4 w-4 text-accent-foreground" />
                          </div>
                          <span className="font-medium">{participant.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>Bloco {participant.block}</div>
                          <div className="text-muted-foreground">Unidade {participant.unit}</div>
                          {participant.groupId && (() => {
                            const linkedParticipants = participants.filter(p => 
                              p.groupId === participant.groupId && 
                              p.id !== participant.id &&
                              p.buildingId === selectedBuilding?.id
                            );
                            if (linkedParticipants.length > 0) {
                              return (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Grupo: {linkedParticipants.map(p => `${p.block}/${p.unit}`).join(', ')}
                                </div>
                              );
                            }
                          })()}
                        </div>
                      </TableCell>
                      <TableCell>
                        {participant.groupId ? (
                          <Badge variant="outline" className="text-xs">
                            {participant.groupId}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {getPriorityBadges(participant).map((badge, index) => (
                            <Badge
                              key={index}
                              variant={badge.variant || 'secondary'}
                            >
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(participant)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(participant.id)}
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