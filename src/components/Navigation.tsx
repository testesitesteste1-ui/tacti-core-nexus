import { Car, Users, Settings, FileText, BarChart3, Home, Map, Menu, X, LogOut, Shield, MapPin, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import exeventosLogo from "@/assets/exeventos-logo.png";
import mageventosLogo from "@/assets/mageventos-logo.jpg";
import { Separator } from "@/components/ui/separator";

interface NavigationProps {
  currentView: string;
  onViewChange: (view: string) => void;
  onChangeBuildingClick?: () => void;
}

const NavigationContent = ({
  currentView,
  onViewChange,
  onItemClick,
  onChangeBuildingClick,
  buildingName,
  companyType,
}: NavigationProps & { onItemClick?: () => void; buildingName?: string; companyType?: 'exvagas' | 'mageventos' }) => {
  const { currentUser, signOut, hasPermission } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const filteredNavigationItems = navigationItems.filter(item => {
    const permissionMap: Record<string, keyof import('@/types/auth').UserPermissions> = {
      'dashboard': 'canViewDashboard',
      'participants': 'canViewParticipants',
      'parking': 'canViewParkingSpots',
      'map': 'canViewMap',
      'lottery': 'canViewLottery',
      'choice-lottery': 'canViewLottery', // ✅ ADICIONE ESTA LINHA (mesma permissão do sorteio normal)
      'sector-lottery': 'canViewLottery',
      'history': 'canViewHistory',
    };
    
    const permission = permissionMap[item.id];
    return permission ? hasPermission(permission) : true;
  });
  const isExEventos = companyType === 'exvagas' || !companyType;
  const logo = isExEventos ? exeventosLogo : mageventosLogo;
  const companyName = isExEventos ? (
    <>
      <span className="font-ink-free text-red-600">Ex</span>{" "}
      <span className="font-cambria text-black">Eventos</span>
    </>
  ) : (
    <span className="text-[#d4a03e]" style={{ fontFamily: 'sans-serif' }}>Mag Eventos</span>
  );

  return (
  <div className="flex flex-col h-full">
    <div className="p-6 border-b">
      <div className="flex items-center space-x-3">
        <div className="w-16 h-16 rounded-lg flex items-center justify-center bg-white p-2">
          <img src={logo} alt={isExEventos ? "Ex Eventos" : "Mag Eventos"} className="w-full h-full object-contain" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">
            {companyName}
          </h1>
          <p className="text-sm text-muted-foreground">Sorteio de Vagas</p>
        </div>
      </div>
      {buildingName && (
        <div className="mt-4 p-3 gradient-primary rounded-lg shadow-medium">
          <p className="text-xs text-white/80 font-medium">Condomínio Atual</p>
          <p className="text-base font-bold text-white mt-1">{buildingName}</p>
          {onChangeBuildingClick && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs mt-2 text-white/90 hover:text-white hover:bg-white/10"
              onClick={onChangeBuildingClick}
            >
              Alterar Condomínio →
            </Button>
          )}
        </div>
      )}
    </div>

    <div className="p-4 space-y-2 flex-1">
      {filteredNavigationItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentView === item.id;

        return (
          <Button
            key={item.id}
            variant={isActive ? "default" : "ghost"}
            className={cn("w-full justify-start h-11", isActive && "bg-accent text-accent-foreground shadow-soft")}
            onClick={() => {
              onViewChange(item.id);
              onItemClick?.();
            }}
          >
            <Icon className="mr-3 h-4 w-4" />
            {item.label}
          </Button>
        );
      })}
    </div>

    <div className="p-4 space-y-3">
      {currentUser?.role === 'admin' && (
        <>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              navigate('/admin');
              onItemClick?.();
            }}
          >
            <Shield className="mr-3 h-4 w-4" />
            Painel Admin
          </Button>
          <Separator />
        </>
      )}
      
      <div className="p-3 bg-muted rounded-lg space-y-2">
        <p className="text-sm font-medium text-foreground">{currentUser?.displayName}</p>
        <p className="text-xs text-muted-foreground">{currentUser?.email}</p>
      </div>
      
      <Button
        variant="ghost"
        className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={handleLogout}
      >
        <LogOut className="mr-3 h-4 w-4" />
        Sair
      </Button>
    </div>
  </div>
);};

const navigationItems = [
  { id: "dashboard", label: "Painel Principal", icon: Home },
  { id: "participants", label: "Participantes/Unidades", icon: Users },
  { id: "parking", label: "Vagas", icon: Car },
  { id: "map", label: "Planta Digital", icon: Map },
  { id: "lottery", label: "Sorteio", icon: Settings },
  { id: "choice-lottery", label: "Sorteio por Escolha", icon: Shuffle }, // ✅ ADICIONE ESTA LINHA
  { id: "sector-lottery", label: "Sorteio por Setor", icon: MapPin },
  { id: "history", label: "Histórico", icon: BarChart3 },
];

export const Navigation = ({ currentView, onViewChange, onChangeBuildingClick }: NavigationProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { selectedBuilding } = useAppContext();
  
  const isExEventos = selectedBuilding?.company === 'exvagas' || !selectedBuilding?.company;
  const logo = isExEventos ? exeventosLogo : mageventosLogo;
  const companyName = isExEventos ? (
    <>
      <span className="font-ink-free text-red-600">Ex</span>{" "}
      <span className="font-cambria text-black">Eventos</span>
    </>
  ) : (
    <span className="text-[#d4a03e]" style={{ fontFamily: 'sans-serif' }}>Mag Eventos</span>
  );

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden lg:flex w-64 h-screen bg-card border-r shadow-soft">
        <NavigationContent
          currentView={currentView}
          onViewChange={onViewChange}
          onChangeBuildingClick={onChangeBuildingClick}
          buildingName={selectedBuilding?.name}
          companyType={selectedBuilding?.company}
        />
      </nav>

      {/* Mobile Navigation */}
      <div className="lg:hidden">
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-4 bg-card border-b shadow-soft">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white p-1">
              <img src={logo} alt={isExEventos ? "Ex Eventos" : "Mag Eventos"} className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground">
                {companyName}
              </h1>
            </div>
          </div>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <NavigationContent
                currentView={currentView}
                onViewChange={onViewChange}
                onItemClick={() => setMobileMenuOpen(false)}
                onChangeBuildingClick={onChangeBuildingClick}
                buildingName={selectedBuilding?.name}
                companyType={selectedBuilding?.company}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </>
  );
};
