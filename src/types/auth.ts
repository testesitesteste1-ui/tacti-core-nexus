export interface UserPermissions {
  // Visualização
  canViewDashboard: boolean;
  canViewParticipants: boolean;
  canViewParkingSpots: boolean;
  canViewMap: boolean;
  canViewLottery: boolean;
  canViewHistory: boolean;
  
  // Ações
  canAddParticipants: boolean;
  canEditParticipants: boolean;
  canDeleteParticipants: boolean;
  
  canAddParkingSpots: boolean;
  canEditParkingSpots: boolean;
  canDeleteParkingSpots: boolean;
  
  canRunLottery: boolean;
  canGenerateReports: boolean;
  canExportData: boolean;
  
  // Admin
  canManageUsers: boolean;
  canManageBuildings: boolean;
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  permissions: UserPermissions;
  buildingAccess: string[]; // IDs dos prédios que o usuário pode acessar
  createdAt: Date;
  lastLogin?: Date;
  isActive: boolean;
}

export const DEFAULT_ADMIN_PERMISSIONS: UserPermissions = {
  canViewDashboard: true,
  canViewParticipants: true,
  canViewParkingSpots: true,
  canViewMap: true,
  canViewLottery: true,
  canViewHistory: true,
  canAddParticipants: true,
  canEditParticipants: true,
  canDeleteParticipants: true,
  canAddParkingSpots: true,
  canEditParkingSpots: true,
  canDeleteParkingSpots: true,
  canRunLottery: true,
  canGenerateReports: true,
  canExportData: true,
  canManageUsers: true,
  canManageBuildings: true,
};

export const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  canViewDashboard: true,
  canViewParticipants: false,
  canViewParkingSpots: false,
  canViewMap: false,
  canViewLottery: false,
  canViewHistory: false,
  canAddParticipants: false,
  canEditParticipants: false,
  canDeleteParticipants: false,
  canAddParkingSpots: false,
  canEditParkingSpots: false,
  canDeleteParkingSpots: false,
  canRunLottery: false,
  canGenerateReports: false,
  canExportData: false,
  canManageUsers: false,
  canManageBuildings: false,
};
