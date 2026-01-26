# Configuração do Usuário Administrador

## Como criar o primeiro usuário Admin

Para criar o primeiro usuário administrador do sistema, siga estes passos:

### 1. Criar usuário no Firebase Authentication

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto: `sorteio-vagas`
3. No menu lateral, clique em **Authentication**
4. Clique na aba **Users**
5. Clique em **Add User**
6. Preencha:
   - **Email**: seu-email@admin.com
   - **Password**: (crie uma senha forte)
7. Clique em **Add user**
8. **IMPORTANTE**: Copie o **User UID** que aparecerá na lista

### 2. Adicionar dados do usuário no Realtime Database

1. No Firebase Console, vá para **Realtime Database**
2. Clique na URL do banco de dados ou em **Data**
3. Na raiz do banco, clique no **+** para adicionar dados
4. Adicione a seguinte estrutura:

```
users
  └─ [COLE O USER UID AQUI]
      ├─ email: "seu-email@admin.com"
      ├─ displayName: "Administrador"
      ├─ role: "admin"
      ├─ isActive: true
      ├─ createdAt: "2025-10-26T00:00:00.000Z"
      ├─ buildingAccess: []
      └─ permissions
          ├─ canViewDashboard: true
          ├─ canViewParticipants: true
          ├─ canViewParkingSpots: true
          ├─ canViewMap: true
          ├─ canViewLottery: true
          ├─ canViewHistory: true
          ├─ canAddParticipants: true
          ├─ canEditParticipants: true
          ├─ canDeleteParticipants: true
          ├─ canAddParkingSpots: true
          ├─ canEditParkingSpots: true
          ├─ canDeleteParkingSpots: true
          ├─ canRunLottery: true
          ├─ canGenerateReports: true
          ├─ canExportData: true
          ├─ canManageUsers: true
          └─ canManageBuildings: true
```

### 3. Fazer login

Agora você pode fazer login no sistema com o email e senha que criou!

## Estrutura de Permissões

### Permissões de Visualização
- `canViewDashboard` - Ver o painel principal
- `canViewParticipants` - Ver lista de participantes
- `canViewParkingSpots` - Ver lista de vagas
- `canViewMap` - Ver mapa interativo
- `canViewLottery` - Ver sistema de sorteio
- `canViewHistory` - Ver histórico de sorteios

### Permissões de Participantes
- `canAddParticipants` - Adicionar novos participantes
- `canEditParticipants` - Editar participantes existentes
- `canDeleteParticipants` - Excluir participantes

### Permissões de Vagas
- `canAddParkingSpots` - Adicionar novas vagas
- `canEditParkingSpots` - Editar vagas existentes
- `canDeleteParkingSpots` - Excluir vagas

### Permissões de Sistema
- `canRunLottery` - Realizar sorteios
- `canGenerateReports` - Gerar relatórios em PDF
- `canExportData` - Exportar dados do sistema
- `canManageUsers` - Gerenciar usuários (apenas admin)
- `canManageBuildings` - Gerenciar prédios (apenas admin)

## Criando Usuários Afiliados

Após fazer login como admin:

1. Acesse o **Painel Admin** no menu lateral
2. Clique em **Novo Usuário**
3. Preencha os dados:
   - Nome completo
   - Email
   - Senha (mínimo 6 caracteres)
4. Selecione os **Prédios** que o usuário poderá acessar
5. Defina as **Permissões** individuais
6. Clique em **Criar Usuário**

## Gerenciando Usuários

No Painel Admin você pode:

- ✅ Ativar/Desativar usuários
- ✅ Editar permissões individuais
- ✅ Definir acesso a prédios específicos
- ✅ Ver último login de cada usuário

## Segurança

- ⚠️ Senhas devem ter no mínimo 6 caracteres
- ⚠️ Apenas admins podem acessar o Painel Admin
- ⚠️ Usuários desativados não conseguem fazer login
- ⚠️ Usuários só veem prédios aos quais têm acesso
- ⚠️ As permissões são verificadas em tempo real
