// Setores pré-definidos
export const AVAILABLE_SECTORS = [
  'Setor A', 'Setor B', 'Setor C', 'Setor D', 'Setor E',
  'Setor F', 'Setor G', 'Setor H', 'Setor I', 'Setor J',
] as const;

export type SectorName = typeof AVAILABLE_SECTORS[number];

export interface Building {
  id: string;
  name: string;
  address?: string;
  company?: 'exvagas'; // Empresa responsável pelo condomínio
  sectorProximity?: Record<string, string[]>; // Mapa de setor -> setores próximos em ordem de prioridade
  createdAt: Date;
}

export interface Participant {
  id: string;
  buildingId: string;
  name: string;
  block: string;
  unit: string;
  sector?: SectorName; // Setor designado ao participante
  hasSpecialNeeds: boolean;
  isElderly?: boolean;
  hasLargeCar?: boolean;
  hasSmallCar?: boolean; // Veículo Pequeno
  hasMotorcycle?: boolean; // Motocicleta
  isUpToDate?: boolean; // Inadimplente
  groupId?: string; // ID do grupo para vagas presas compartilhadas
  numberOfSpots?: number; // Número de vagas que o participante tem direito (padrão: 1)
  prefersCommonSpot?: boolean; // Preferência por vaga comum
  prefersCovered?: boolean; // Preferência por vaga coberta
  prefersUncovered?: boolean; // Preferência por vaga descoberta
  prefersLinkedSpot?: boolean; // Preferência por vaga presa (rodízio)
  prefersUnlinkedSpot?: boolean; // Preferência por vaga livre (rodízio)
  prefersSmallSpot?: boolean; // Preferência por vaga pequena
  preferredFloors?: string[]; // Preferência por andares específicos (múltipla escolha)
  preferredSectors?: SectorName[]; // Preferência de setores em ordem de prioridade
  createdAt: Date;
  priority?: 'special-needs' | 'elderly' | 'up-to-date' | 'normal';
}

export interface ParkingSpot {
  id: string;
  buildingId: string;
  number: string;
  floor: 'Piso Único' | 'Térreo' | '1° SubSolo' | '2° SubSolo' | '3° SubSolo' | '4° SubSolo' | '5° SubSolo' | 'Ed. Garagem (1° Andar)' | 'Ed. Garagem (2° Andar)' | 'Ed. Garagem (3° Andar)' | 'Ed. Garagem (4° Andar)' | 'Ed. Garagem (5° Andar)';
  sector?: SectorName; // Setor onde a vaga se encontra
  type: SpotType[];
  size: 'P' | 'M' | 'G' | 'XG';
  status: 'available' | 'occupied' | 'reserved';
  isCovered?: boolean; // Vaga coberta
  isUncovered?: boolean; // Vaga descoberta
  position: {
    x: number;
    y: number;
  };
  assignedTo?: string; // Participant ID
  groupId?: string; // ID do grupo para vagas vinculadas
  linkedSpotIds?: string[]; // IDs das vagas presas vinculadas (DEPRECATED - usar groupId)
  createdAt: Date;
}

export interface LotteryResult {
  id: string;
  participantId: string;
  parkingSpotId: string;
  timestamp: Date;
  priority: 'normal' | 'elderly' | 'special-needs' | 'up-to-date';
  // Snapshots para evitar N/A caso dados mudem após o sorteio
  participantSnapshot?: {
    name: string;
    block: string;
    unit: string;
  };
  spotSnapshot?: {
    number: string;
    floor: ParkingSpot['floor'];
    type: SpotType[];
    size: ParkingSpot['size'];
    isCovered?: boolean;
    isUncovered?: boolean;
  };
}

export interface LotterySession {
  id: string;
  buildingId: string;
  name: string;
  date: Date;
  participants: string[]; // Participant IDs
  availableSpots: string[]; // ParkingSpot IDs
  results: LotteryResult[];
  status: 'pending' | 'running' | 'completed';
  settings: {
    allowSharedSpots: boolean;
    prioritizeElders: boolean;
    prioritizeSpecialNeeds: boolean;
    zoneByProximity: boolean;
  };
}

export type SpotStatus = 'available' | 'occupied' | 'reserved';
export type SpotType = 'Vaga Comum' | 'Vaga PcD' | 'Vaga Idoso' | 'Vaga Grande' | 'Vaga Pequena' | 'Vaga Motocicleta' | 'Vaga Presa' | 'Vaga Livre' | 'Vaga Coberta' | 'Vaga Descoberta';
export type Priority = 'normal' | 'elderly' | 'special-needs' | 'up-to-date';