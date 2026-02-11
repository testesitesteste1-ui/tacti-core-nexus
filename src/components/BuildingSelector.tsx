import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Building2, Plus, Trash2, MapPin, Edit } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Building } from '@/types/lottery';
import { useToast } from '@/hooks/use-toast';
import cityBackground from '@/assets/city-background.jpg';

interface BuildingSelectorProps {
  onBuildingSelected: () => void;
}

export const BuildingSelector = ({ onBuildingSelected }: BuildingSelectorProps) => {
  const context = useAppContext();
  const { buildings, addBuilding, deleteBuilding, setSelectedBuilding, updateBuilding } = context;
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    company: 'exvagas' as 'exvagas',
  });

  // Import useAuth to check permissions
  const { currentUser, canAccessBuilding } = useAuth();

  // Filter buildings based on user access and sort alphabetically
  const accessibleBuildings = buildings
    .filter(building => 
      currentUser?.role === 'admin' || canAccessBuilding(building.id)
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // Check if user can manage buildings
  const canManageBuildings = currentUser?.role === 'admin' || currentUser?.permissions.canManageBuildings;

  const resetForm = () => {
    setFormData({ name: '', address: '', company: 'exvagas' });
    setEditingBuilding(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Erro",
        description: "O nome do condomínio é obrigatório.",
        variant: "destructive",
      });
      return;
    }

    if (editingBuilding) {
      const updatedBuilding: Building = {
        ...editingBuilding,
        name: formData.name,
        address: formData.address,
        company: formData.company,
      };
      updateBuilding(updatedBuilding);
      toast({
        title: "Condomínio atualizado",
        description: `${formData.name} foi atualizado com sucesso.`,
      });
    } else {
      const newBuilding: Building = {
        id: `building-${Date.now()}`,
        name: formData.name,
        address: formData.address,
        company: formData.company,
        createdAt: new Date(),
        
      };
      addBuilding(newBuilding);
      toast({
        title: "Condomínio criado",
        description: `${formData.name} foi criado com sucesso.`,
      });
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleEdit = (building: Building) => {
    setEditingBuilding(building);
    setFormData({
      name: building.name,
      address: building.address || '',
      company: building.company || 'exvagas',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    const building = buildings.find(b => b.id === id);
    if (window.confirm(`Tem certeza que deseja excluir o condomínio "${building?.name}"? Todos os dados relacionados serão perdidos.`)) {
      deleteBuilding(id);
      toast({
        title: "Condomínio excluído",
        description: "O condomínio e seus dados foram excluídos com sucesso.",
      });
    }
  };

  const handleSelectBuilding = (building: Building) => {
    setSelectedBuilding(building);
    onBuildingSelected();
    toast({
      title: "Condomínio selecionado",
      description: `Você está gerenciando ${building.name}`,
    });
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        backgroundImage: `url(${cityBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Overlay escuro */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      
      <div className="max-w-4xl w-full space-y-6 relative z-10">
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">
            SORTEIO DE VAGAS
          </h1>
          <p className="text-lg text-white/90 drop-shadow-md">
            Selecione um Condomínio para Começar ou Crie um Novo
          </p>
        </div>

        <Card className="shadow-strong">
          <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Condomínios</CardTitle>
          <CardDescription>
            {accessibleBuildings.length === 0 
              ? 'Nenhum condomínio acessível.'
              : `${accessibleBuildings.length} condomínio(s) acessível(eis)`
            }
          </CardDescription>
        </div>
        {canManageBuildings && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-white shadow-medium">
                <Plus className="mr-2 h-4 w-4" />
                Novo Condomínio
              </Button>
            </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingBuilding ? 'Editar Condomínio' : 'Criar Novo Condomínio'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingBuilding 
                      ? 'Atualize as Informações do Condomínio' 
                      : 'Preencha as Informações do Novo Condomínio'
                    }
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Condomínio *</Label>
                    <Input
                      id="name"
                      placeholder="Ex: Edifício Central, Condomínio Sol..."
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Endereço (Opcional)</Label>
                    <Input
                      id="address"
                      placeholder="Rua, número, bairro..."
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsDialogOpen(false);
                        resetForm();
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" className="gradient-primary text-white">
                      {editingBuilding ? 'Atualizar' : 'Criar'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
          </CardHeader>
          <CardContent>
            {accessibleBuildings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p>Nenhum condomínio acessível.</p>
                {canManageBuildings && (
                  <p className="text-sm">Clique em "Novo Condomínio" para começar.</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {accessibleBuildings.map((building) => (
                  <Card 
                    key={building.id} 
                    className="hover:shadow-medium transition-shadow border-2 hover:border-primary"
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Building2 className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg">{building.name}</h3>
                            {building.address && (
                              <div className="flex items-center text-sm text-muted-foreground mt-1">
                                <MapPin className="h-3 w-3 mr-1" />
                                {building.address}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-4 border-t gap-2">
                        <span className="text-xs text-muted-foreground">
                          Criado em {
                            building.createdAt instanceof Date 
                              ? building.createdAt.toLocaleDateString('pt-BR')
                              : new Date(building.createdAt).toLocaleDateString('pt-BR')
                          }
                        </span>
                        <div className="flex space-x-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleSelectBuilding(building)}
                            className="gradient-primary text-white"
                          >
                            Selecionar
                          </Button>
                          {canManageBuildings && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(building)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(building.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
