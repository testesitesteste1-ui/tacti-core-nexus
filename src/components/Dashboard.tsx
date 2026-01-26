import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Car, Clock, CheckCircle, AlertCircle, Calendar, FileText } from "lucide-react";
import { QRCodeManager } from '@/components/QRCodeManager';
import { useAppContext } from "@/context/AppContext";

interface DashboardProps {
  onViewChange: (view: string) => void;
}

export const Dashboard = ({ onViewChange }: DashboardProps) => {
  const { participants, parkingSpots, lotterySessions, selectedBuilding } = useAppContext();

  // Filter by selected building
  const buildingParticipants = participants.filter((p) => p.buildingId === selectedBuilding?.id);
  const buildingSpots = parkingSpots.filter((s) => s.buildingId === selectedBuilding?.id);
  const buildingSessions = lotterySessions.filter((l) => l.buildingId === selectedBuilding?.id);

  const availableSpots = buildingSpots.filter((spot) => spot.status === "available").length;
  const occupiedSpots = buildingSpots.filter((spot) => spot.status === "occupied").length;
  const reservedSpots = buildingSpots.filter((spot) => spot.status === "reserved").length;
  const pcdSpots = buildingSpots.filter((spot) => {
    const typeArray = Array.isArray(spot.type) ? spot.type : [spot.type];
    return typeArray.includes("Vaga PcD");
  }).length;

  const totalParticipants = buildingParticipants.length;
  const participantsWithSpecialNeeds = buildingParticipants.filter((p) => p.hasSpecialNeeds).length;
  const elderlyParticipants = buildingParticipants.filter((p) => p.isElderly).length;

  const pendingSessions = buildingSessions.filter((s) => s.status === "pending").length;
  const completedSessions = buildingSessions.filter((s) => s.status === "completed").length;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Painel Principal</h1>
          <p className="text-muted-foreground">Visão Geral do Sistema de Sorteio de Vagas</p>
        </div>
        <Button
          onClick={() => onViewChange("lottery")}
          className="gradient-primary text-white shadow-medium w-full sm:w-auto"
        >
          <Calendar className="mr-2 h-4 w-4" />
          Novo Sorteio
        </Button>
      </div>

      {/* Estatísticas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Participantes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalParticipants}</div>
            <p className="text-xs text-muted-foreground">{participantsWithSpecialNeeds} com necessidades especiais</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vagas Disponíveis</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-available">{availableSpots}</div>
            <p className="text-xs text-muted-foreground">{pcdSpots} vagas PcD no total</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sorteios Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{pendingSessions}</div>
            <p className="text-xs text-muted-foreground">{completedSessions} concluídos</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Ocupação</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {buildingSpots.length > 0 
                ? Math.round(((occupiedSpots + reservedSpots) / buildingSpots.length) * 100)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {occupiedSpots + reservedSpots}/{buildingSpots.length} vagas em uso
            </p>
          </CardContent>
        </Card>
      </div>

      {/* QR Code / Public Results Manager */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Novo card de QR Code */}
        <QRCodeManager
          buildingId={selectedBuilding?.id || ''}
          buildingName={selectedBuilding?.name || ''}
          lastLotteryDate={buildingSessions[0]?.date}
        />
      </div>

      {/* Status das Vagas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Status das Vagas</CardTitle>
            <CardDescription>Distribuição Atual das Vagas por Status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-available rounded-full"></div>
                <span className="text-sm">Disponíveis</span>
              </div>
              <Badge variant="secondary">{availableSpots}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-occupied rounded-full"></div>
                <span className="text-sm">Ocupadas</span>
              </div>
              <Badge variant="secondary">{occupiedSpots}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-reserved rounded-full"></div>
                <span className="text-sm">Reservadas</span>
              </div>
              <Badge variant="secondary">{reservedSpots}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Participantes com Prioridade</CardTitle>
            <CardDescription>Perfil dos Participantes Cadastrados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-pcd" />
                <span className="text-sm">PcDs (Pessoas com Deficiência)</span>
              </div>
              <Badge variant="outline">{participantsWithSpecialNeeds}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-accent" />
                <span className="text-sm">Idosos (60+ anos)</span>
              </div>
              <Badge variant="outline">{elderlyParticipants}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-success" />
                <span className="text-sm">Adimplentes</span>
              </div>
              <Badge variant="outline">{buildingParticipants.filter((p) => p.isUpToDate).length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm">Inadimplentes</span>
              </div>
              <Badge variant="outline">{buildingParticipants.filter((p) => !p.isUpToDate).length}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ações Rápidas */}
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Ações Rápidas</CardTitle>
          <CardDescription>Acesse Rapidamente as Principais Funcionalidades</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="h-16 sm:h-20 flex-col space-y-1 sm:space-y-2"
              onClick={() => onViewChange("participants")}
            >
              <Users className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="text-xs sm:text-sm">Gerenciar Participantes</span>
            </Button>
            <Button
              variant="outline"
              className="h-16 sm:h-20 flex-col space-y-1 sm:space-y-2"
              onClick={() => onViewChange("parking")}
            >
              <Car className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="text-xs sm:text-sm">Gerenciar Vagas</span>
            </Button>
            <Button
              variant="outline"
              className="h-16 sm:h-20 flex-col space-y-1 sm:space-y-2"
              onClick={() => onViewChange("reports")}
            >
              <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="text-xs sm:text-sm">Ver Relatórios</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
