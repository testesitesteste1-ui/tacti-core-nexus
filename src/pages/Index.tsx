import { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Dashboard } from '@/components/Dashboard';
import { ParticipantManagement } from '@/components/ParticipantManagement';
import { ParkingManagement } from '@/components/ParkingManagement';
import { LotterySystem } from '@/components/LotterySystem';
import { SectorLotterySystem } from '@/components/SectorLotterySystem';
import LotteryChoiceSystem from '@/components/LotteryChoiceSystem'; // ✅ ADICIONE ESTA LINHA
import { InteractiveParkingMap } from '@/components/InteractiveParkingMap';
import { ReportsHistory } from '@/components/ReportsHistory';
import { BuildingSelector } from '@/components/BuildingSelector';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const { selectedBuilding } = useAppContext();
  const { currentUser, hasPermission, canAccessBuilding } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [showBuildingSelector, setShowBuildingSelector] = useState(false);

  // Check if user has access to current building - only run once when building or user changes
  useEffect(() => {
    if (selectedBuilding && currentUser) {
      const hasAccess = currentUser.role === 'admin' ||
        currentUser.buildingAccess?.includes(selectedBuilding.id) ||
        false;

      if (!hasAccess) {
        console.log('User does not have access to building:', selectedBuilding.id);
        setShowBuildingSelector(true);
      }
    }
  }, [selectedBuilding?.id, currentUser?.uid, currentUser?.role]);

  // If no building is selected, show building selector
  if (!selectedBuilding || showBuildingSelector) {
    return (
      <BuildingSelector
        onBuildingSelected={() => {
          setShowBuildingSelector(false);
          setCurrentView('dashboard');
        }}
      />
    );
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard onViewChange={setCurrentView} />;
      case 'participants':
        return <ParticipantManagement />;
      case 'parking':
        return <ParkingManagement />;
      case 'map':
        return <InteractiveParkingMap />;
      case 'lottery':
        return <LotterySystem />;
      case 'choice-lottery':  // ✅ ADICIONE ESTE CASE
        return <LotteryChoiceSystem />;
      case 'sector-lottery':
        return <SectorLotterySystem />;
      case 'reports':
      case 'history':
        return <ReportsHistory />;
      default:
        return <Dashboard onViewChange={setCurrentView} />;
    }
  };

  return (
    <div className="min-h-screen bg-background lg:flex">
      <Navigation
        currentView={currentView}
        onViewChange={setCurrentView}
        onChangeBuildingClick={() => setShowBuildingSelector(true)}
      />
      <main className="flex-1">
        {renderCurrentView()}
      </main>
    </div>
  );
};

export default Index;