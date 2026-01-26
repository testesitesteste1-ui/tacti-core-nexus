import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { User, UserPermissions, DEFAULT_USER_PERMISSIONS } from '@/types/auth';
import { Users, Plus, Shield, Building, CheckCircle, XCircle, Edit, ArrowLeft, Database } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { BackupManager } from '@/components/BackupManager';

export const AdminPanel = () => {
  const navigate = useNavigate();
  const { createUser, getAllUsers, updateUserPermissions, updateUserBuildingAccess, updateUserRole, toggleUserStatus, deleteUser, currentUser } = useAuth();
  const { buildings } = useAppContext();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // New user form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [newPermissions, setNewPermissions] = useState<UserPermissions>(DEFAULT_USER_PERMISSIONS);
  const [newBuildingAccess, setNewBuildingAccess] = useState<string[]>([]);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const allUsers = await getAllUsers();
    setUsers(allUsers);
  };

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword || !newDisplayName) {
      return;
    }

    setLoading(true);
    try {
      await createUser(newEmail, newPassword, newDisplayName, newRole, newPermissions, newBuildingAccess);
      
      // Reset form
      setNewEmail('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('user');
      setNewPermissions(DEFAULT_USER_PERMISSIONS);
      setNewBuildingAccess([]);
      setIsCreateDialogOpen(false);
      
      // Reload users
      await loadUsers();
    } catch (error) {
      // Error handled in AuthContext
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePermissions = async (uid: string, permission: keyof UserPermissions, value: boolean) => {
    try {
      await updateUserPermissions(uid, { [permission]: value });
      await loadUsers();
    } catch (error) {
      // Error handled in AuthContext
    }
  };

  const handleToggleBuildingAccess = async (uid: string, buildingId: string) => {
    const user = users.find(u => u.uid === uid);
    if (!user) return;

    const currentAccess = user.buildingAccess || [];
    const newAccess = currentAccess.includes(buildingId)
      ? currentAccess.filter(id => id !== buildingId)
      : [...currentAccess, buildingId];

    try {
      await updateUserBuildingAccess(uid, newAccess);
      await loadUsers();
    } catch (error) {
      // Error handled in AuthContext
    }
  };

  const handleToggleUserStatus = async (uid: string, isActive: boolean) => {
    try {
      await toggleUserStatus(uid, isActive);
      await loadUsers();
    } catch (error) {
      // Error handled in AuthContext
    }
  };

  const handleUpdateRole = async (uid: string, role: 'admin' | 'user') => {
    try {
      await updateUserRole(uid, role);
      await loadUsers();
    } catch (error) {
      // Error handled in AuthContext
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!window.confirm('Tem certeza que deseja remover este usuário? Esta ação não pode ser desfeita.')) {
      return;
    }
    
    try {
      await deleteUser(uid);
      await loadUsers();
    } catch (error) {
      // Error handled in AuthContext
    }
  };

  const permissionLabels: Record<keyof UserPermissions, string> = {
    canViewDashboard: 'Ver Dashboard',
    canViewParticipants: 'Ver Participantes',
    canViewParkingSpots: 'Ver Vagas',
    canViewMap: 'Ver Mapa',
    canViewLottery: 'Ver Sorteios',
    canViewHistory: 'Ver Histórico',
    canAddParticipants: 'Adicionar Participantes',
    canEditParticipants: 'Editar Participantes',
    canDeleteParticipants: 'Excluir Participantes',
    canAddParkingSpots: 'Adicionar Vagas',
    canEditParkingSpots: 'Editar Vagas',
    canDeleteParkingSpots: 'Excluir Vagas',
    canRunLottery: 'Realizar Sorteios',
    canGenerateReports: 'Gerar Relatórios',
    canExportData: 'Exportar Dados',
    canManageUsers: 'Gerenciar Usuários',
    canManageBuildings: 'Gerenciar Prédios',
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header com botão de voltar */}
      <div className="flex items-center gap-4 pb-4 border-b">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          className="hover:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Voltar ao Sistema</h1>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Painel Administrativo</h1>
          <p className="text-muted-foreground">Gerenciar Usuários, Permissões e Backups do Sistema</p>
        </div>
      </div>

      {/* Tabs principais */}
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="backup" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Backup
          </TabsTrigger>
        </TabsList>

        {/* Tab de Usuários */}
        <TabsContent value="users" className="space-y-6">
          <div className="flex justify-end">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-white shadow-medium">
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Usuário
                </Button>
              </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Usuário</DialogTitle>
              <DialogDescription>
                Preencha os dados e defina as permissões do novo usuário
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-name">Nome Completo</Label>
                  <Input
                    id="new-name"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="João Silva"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="new-email">Email</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="joao@email.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">Senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <p className="text-xs text-muted-foreground">Mínimo 6 caracteres</p>
              </div>

              <div className="space-y-3">
                <Label>Função</Label>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="role-user"
                      checked={newRole === 'user'}
                      onCheckedChange={(checked) => {
                        if (checked) setNewRole('user');
                      }}
                    />
                    <Label htmlFor="role-user" className="cursor-pointer">
                      Usuário
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="role-admin"
                      checked={newRole === 'admin'}
                      onCheckedChange={(checked) => {
                        if (checked) setNewRole('admin');
                      }}
                    />
                    <Label htmlFor="role-admin" className="cursor-pointer flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Administrador
                    </Label>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Acesso aos Prédios</Label>
                <div className="grid grid-cols-1 gap-2">
                  {buildings.map((building) => (
                    <div key={building.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`building-${building.id}`}
                        checked={newBuildingAccess.includes(building.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewBuildingAccess([...newBuildingAccess, building.id]);
                          } else {
                            setNewBuildingAccess(newBuildingAccess.filter(id => id !== building.id));
                          }
                        }}
                      />
                      <Label htmlFor={`building-${building.id}`} className="cursor-pointer">
                        {building.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Permissões</Label>
                <ScrollArea className="h-64 border rounded-lg p-4">
                  <div className="space-y-3">
                    {Object.entries(permissionLabels).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm">{label}</span>
                        <Switch
                          checked={newPermissions[key as keyof UserPermissions]}
                          onCheckedChange={(checked) => {
                            setNewPermissions({
                              ...newPermissions,
                              [key]: checked,
                            });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateUser}
                  disabled={loading || !newEmail || !newPassword || !newDisplayName}
                  className="gradient-primary text-white"
                >
                  {loading ? 'Criando...' : 'Criar Usuário'}
                </Button>
              </div>
            </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Lista de Usuários */}
          <div className="grid grid-cols-1 gap-4">
        {users.filter(u => u.uid !== currentUser?.uid).map((user) => (
          <Card key={user.uid} className="shadow-soft">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    {user.displayName}
                    {user.role === 'admin' && (
                      <Badge variant="destructive" className="text-xs">
                        <Shield className="mr-1 h-3 w-3" />
                        Admin
                      </Badge>
                    )}
                    {!user.isActive && (
                      <Badge variant="outline" className="text-xs">
                        Desativado
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{user.email}</CardDescription>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>Criado em: {user.createdAt.toLocaleDateString()}</span>
                    {user.lastLogin && (
                      <span>• Último acesso: {user.lastLogin.toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">Ativo</Label>
                      <Switch
                        checked={user.isActive}
                        onCheckedChange={(checked) => handleToggleUserStatus(user.uid, checked)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">Admin</Label>
                      <Switch
                        checked={user.role === 'admin'}
                        onCheckedChange={(checked) => handleUpdateRole(user.uid, checked ? 'admin' : 'user')}
                      />
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteUser(user.uid)}
                    className="ml-2"
                  >
                    Remover
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="permissions" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="permissions">Permissões</TabsTrigger>
                  <TabsTrigger value="buildings">Prédios</TabsTrigger>
                </TabsList>
                
                <TabsContent value="permissions" className="space-y-3">
                  <ScrollArea className="h-48">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Object.entries(permissionLabels).map(([key, label]) => (
                        <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <span className="text-sm">{label}</span>
                          <Switch
                            checked={user.permissions[key as keyof UserPermissions]}
                            onCheckedChange={(checked) => handleUpdatePermissions(user.uid, key as keyof UserPermissions, checked)}
                          />
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="buildings" className="space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    {buildings.map((building) => {
                      const hasAccess = user.buildingAccess?.includes(building.id);
                      return (
                        <div 
                          key={building.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted"
                          onClick={() => handleToggleBuildingAccess(user.uid, building.id)}
                        >
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{building.name}</span>
                          </div>
                          {hasAccess ? (
                            <CheckCircle className="h-5 w-5 text-success" />
                          ) : (
                            <XCircle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
            ))}
            
            {users.length === 1 && (
              <Card className="shadow-soft">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhum usuário cadastrado ainda</h3>
                  <p className="text-muted-foreground mb-4">
                    Comece criando o primeiro usuário do sistema
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)} className="gradient-primary text-white">
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Primeiro Usuário
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Tab de Backup */}
        <TabsContent value="backup" className="space-y-6">
          <BackupManager 
            buildings={buildings}
            onImportComplete={() => {
              // Reload data after import
              window.location.reload();
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPanel;
