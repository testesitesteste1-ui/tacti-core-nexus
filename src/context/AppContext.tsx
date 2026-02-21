import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Building, Participant, ParkingSpot, LotterySession, LotteryResult } from '@/types/lottery';
import { mockBuildings, mockParticipants, mockParkingSpots, mockLotterySessions } from '@/data/mockData';
import { database } from '@/config/firebase';
import { ref, set, onValue, get } from 'firebase/database';

interface AppContextType {
  // Buildings
  buildings: Building[];
  setBuildings: React.Dispatch<React.SetStateAction<Building[]>>;
  addBuilding: (building: Building) => void;
  updateBuilding: (building: Building) => void;
  deleteBuilding: (id: string) => void;
  selectedBuilding: Building | null;
  setSelectedBuilding: React.Dispatch<React.SetStateAction<Building | null>>;

  // Participants
  participants: Participant[];
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
  addParticipant: (participant: Participant) => void;
  updateParticipant: (participant: Participant) => void;
  deleteParticipant: (id: string) => void;

  // Parking Spots
  parkingSpots: ParkingSpot[];
  setParkingSpots: React.Dispatch<React.SetStateAction<ParkingSpot[]>>;
  addParkingSpot: (spot: ParkingSpot) => void;
  updateParkingSpot: (spot: ParkingSpot) => void;
  deleteParkingSpot: (id: string) => void;

  // Lottery Sessions
  lotterySessions: LotterySession[];
  setLotterySessions: React.Dispatch<React.SetStateAction<LotterySession[]>>;
  saveLotterySession: (session: LotterySession) => void;
  updateLotterySession: (session: LotterySession) => void;
  deleteLotterySession: (id: string) => void;
  republishLotterySession: (session: LotterySession) => Promise<any>; 

  // Selected items for lottery
  selectedParticipants: string[];
  setSelectedParticipants: React.Dispatch<React.SetStateAction<string[]>>;
  selectedSpots: string[];
  setSelectedSpots: React.Dispatch<React.SetStateAction<string[]>>;

  // Utilities
  saveToFirebase: () => void;
  loadFromFirebase: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DB_PATHS = {
  BUILDINGS: 'buildings',
  SELECTED_BUILDING: 'selectedBuilding',
};

const getBuildingPath = (buildingId: string, subPath?: string) => {
  if (subPath) {
    return `buildings/${buildingId}/${subPath}`;
  }
  return `buildings/${buildingId}`;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [parkingSpots, setParkingSpots] = useState<ParkingSpot[]>([]);
  const [lotterySessions, setLotterySessions] = useState<LotterySession[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [selectedSpots, setSelectedSpots] = useState<string[]>([]);

  // Track if data is being loaded from Firebase to prevent save loops
  const isLoadingFromFirebase = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const markSync = () => {
    isLoadingFromFirebase.current = true;
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      isLoadingFromFirebase.current = false;
    }, 250) as unknown as number;
  };

  // Helpers: sanitize data loaded from Firebase
  const sanitizeParticipants = (items: any[]): Participant[] => {
    return items
      .map((p: any) => ({
        ...p,
        name: String(p.name ?? '').trim() || 'Sem Nome',
        block: String(p.block ?? '').trim(),
        unit: String(p.unit ?? '').trim(),
        createdAt: new Date(p.createdAt),
      }))
      .filter((p: any) => p.id && p.buildingId);
  };

  const sanitizeAndDedupeSpots = (items: any[]): ParkingSpot[] => {
    const cleaned = items
      .map((s: any) => {
        // Migrate old string type to array format
        let typeValue = s.type ?? 'Vaga Comum';
        if (typeof typeValue === 'string') {
          typeValue = [typeValue];
        } else if (!Array.isArray(typeValue)) {
          typeValue = ['Vaga Comum'];
        }

        // Migrar tipos antigos para novos
        typeValue = migrateSpotType(typeValue);

        return {
          ...s,
          number: String(s.number ?? '').trim(),
          floor: s.floor ?? '1° SubSolo',
          type: typeValue,
          size: s.size ?? 'M',
          status: s.status ?? 'available',
          createdAt: new Date(s.createdAt),
        };
      })
      .filter((s: any) => s.number.length > 0);

    const seen = new Set<string>();
    const out: ParkingSpot[] = [];
    for (const s of cleaned) {
      const key = s.number.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(s as ParkingSpot);
      }
    }
    return out;
  };

  // Helper function to remove undefined values from objects (Firebase Realtime Database não aceita undefined)
  const sanitizeForFirebase = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(sanitizeForFirebase);
    if (typeof obj !== 'object') return obj;

    const cleaned: any = {};
    for (const key in obj) {
      const value = obj[key];
      // Remove undefined completamente (não salva no Firebase)
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirebase(value);
      }
    }
    return cleaned;
  };

  // Helper para migrar tipos antigos para novos
  const migrateSpotType = (type: string | string[]): string[] => {
    const typeArray = Array.isArray(type) ? type : [type];
    return typeArray.map(t => {
      switch (t) {
        case 'Comum': return 'Vaga Comum';
        case 'PcD': return 'Vaga PcD';
        case 'Idoso': return 'Vaga Idoso';
        case 'Vaga Grande': return 'Vaga Grande';
        case 'Vaga Presa': return 'Vaga Presa';
        default: return t;
      }
    });
  };

  // Load data from Firebase on mount
  useEffect(() => {
    loadFromFirebase();

    // Set up listener for buildings list
    const buildingsRef = ref(database, DB_PATHS.BUILDINGS);
    const selectedBuildingRef = ref(database, DB_PATHS.SELECTED_BUILDING);

    const unsubscribeBuildings = onValue(buildingsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const parsedData = Object.keys(data)
          .filter(key => key !== 'undefined' && data[key]?.info)
          .map(key => {
            const info = data[key].info;
            let createdAtDate: Date;

            if (info.createdAt instanceof Date) {
              createdAtDate = info.createdAt;
            } else if (typeof info.createdAt === 'string' || typeof info.createdAt === 'number') {
              createdAtDate = new Date(info.createdAt);
            } else {
              createdAtDate = new Date();
            }

            return {
              ...info,
              id: key,
              company: info.company || 'exvagas',
              createdAt: createdAtDate,
            };
          });
        setBuildings(parsedData);

        // Verificar se o building selecionado ainda existe
        setSelectedBuilding(prev => {
          // Não auto-selecionar mais - deixar usuário escolher
          if (prev && !parsedData.some(b => b.id === prev.id)) {
            // Clear from Firebase if building no longer exists
            set(ref(database, DB_PATHS.SELECTED_BUILDING), null);
            return null;
          }
          return prev;
        });
      }
    });

    const unsubscribeSelectedBuilding = onValue(selectedBuildingRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setSelectedBuilding({
          ...data,
          company: data.company || 'exvagas',
          createdAt: new Date(data.createdAt),
        });
      }
    });

    return () => {
      unsubscribeBuildings();
      unsubscribeSelectedBuilding();
    };
  }, []);

  // Set up listeners for building-specific data when a building is selected
  useEffect(() => {
    if (!selectedBuilding?.id) {
      setParticipants([]);
      setParkingSpots([]);
      setLotterySessions([]);
      return;
    }

    const participantsRef = ref(database, getBuildingPath(selectedBuilding.id, 'participants'));
    const spotsRef = ref(database, getBuildingPath(selectedBuilding.id, 'parkingSpots'));
    const sessionsRef = ref(database, getBuildingPath(selectedBuilding.id, 'lotterySessions'));

    const unsubscribeParticipants = onValue(participantsRef, (snapshot) => {
      const data = snapshot.val();
      isLoadingFromFirebase.current = true;
      if (data) {
        const parsedData = sanitizeParticipants(Object.values(data));
        setParticipants(parsedData);
      } else {
        setParticipants([]);
      }
      markSync();
    });

    const unsubscribeSpots = onValue(spotsRef, (snapshot) => {
      const data = snapshot.val();
      isLoadingFromFirebase.current = true;
      if (data) {
        const parsedData = sanitizeAndDedupeSpots(Object.values(data));
        setParkingSpots(parsedData);
      } else {
        setParkingSpots([]);
      }
      markSync();
    });

    const unsubscribeSessions = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val();
      isLoadingFromFirebase.current = true;
      if (data) {
        const parsedData = Object.values(data).map((s: any) => {
          // Convert date - handle different formats
          let dateValue: Date;
          if (s.date instanceof Date) {
            dateValue = s.date;
          } else if (typeof s.date === 'string' || typeof s.date === 'number') {
            dateValue = new Date(s.date);
          } else {
            dateValue = new Date();
          }

          return {
            ...s,
            date: dateValue,
            results: s.results?.map((r: any) => {
              let timestampValue: Date;
              if (r.timestamp instanceof Date) {
                timestampValue = r.timestamp;
              } else if (typeof r.timestamp === 'string' || typeof r.timestamp === 'number') {
                timestampValue = new Date(r.timestamp);
              } else {
                timestampValue = new Date();
              }

              return {
                ...r,
                timestamp: timestampValue,
              };
            }) || [],
          };
        });
        setLotterySessions(parsedData);
      } else {
        setLotterySessions([]);
      }
      markSync();
    });

    return () => {
      unsubscribeParticipants();
      unsubscribeSpots();
      unsubscribeSessions();
    };
  }, [selectedBuilding?.id]);

  // Save building-specific data whenever it changes (but not when loading from Firebase)
  useEffect(() => {
    if (!selectedBuilding?.id) {
      console.log('❌ No building selected, skipping save');
      return;
    }

    if (isLoadingFromFirebase.current) {
      console.log('⏳ Loading from Firebase, skipping save to prevent loop');
      return;
    }

    console.log('💾 Saving to Firebase:', {
      buildingId: selectedBuilding.id,
      participants: participants.length,
      spots: parkingSpots.length,
      sessions: lotterySessions.length
    });

    saveBuildingData(selectedBuilding.id);
  }, [participants, parkingSpots, lotterySessions, selectedBuilding?.id]);

  const loadFromFirebase = async () => {
    try {
      const buildingsRef = ref(database, DB_PATHS.BUILDINGS);
      const selectedBuildingRef = ref(database, DB_PATHS.SELECTED_BUILDING);

      const [buildingsSnapshot, selectedBuildingSnapshot] = await Promise.all([
        get(buildingsRef),
        get(selectedBuildingRef),
      ]);

      let parsedBuildings: Building[] = [];

      if (buildingsSnapshot.exists()) {
        const data = buildingsSnapshot.val();
        parsedBuildings = Object.keys(data)
          .filter(key => key !== 'undefined' && data[key]?.info)
          .map(key => {
            const info = data[key].info;
            let createdAtDate: Date;

            if (info.createdAt instanceof Date) {
              createdAtDate = info.createdAt;
            } else if (typeof info.createdAt === 'string' || typeof info.createdAt === 'number') {
              createdAtDate = new Date(info.createdAt);
            } else {
              createdAtDate = new Date();
            }

            return {
              ...info,
              id: key,
              company: info.company || 'exvagas',
              createdAt: createdAtDate,
            };
          });
        setBuildings(parsedBuildings);
      } else {
        // Initialize with mock building
        const mockBuilding = mockBuildings[0];
        await set(ref(database, getBuildingPath(mockBuilding.id, 'info')), mockBuilding);
        await set(ref(database, getBuildingPath(mockBuilding.id, 'participants')),
          mockParticipants.reduce((acc, p) => ({ ...acc, [p.id]: p }), {}));
        await set(ref(database, getBuildingPath(mockBuilding.id, 'parkingSpots')),
          mockParkingSpots.reduce((acc, s) => ({ ...acc, [s.id]: s }), {}));
        await set(ref(database, getBuildingPath(mockBuilding.id, 'lotterySessions')),
          mockLotterySessions.reduce((acc, l) => ({ ...acc, [l.id]: l }), {}));
        parsedBuildings = [mockBuilding];
        setBuildings(parsedBuildings);
      }

      if (selectedBuildingSnapshot.exists()) {
        const data = selectedBuildingSnapshot.val();
        let createdAtDate: Date;

        if (data.createdAt instanceof Date) {
          createdAtDate = data.createdAt;
        } else if (typeof data.createdAt === 'string' || typeof data.createdAt === 'number') {
          createdAtDate = new Date(data.createdAt);
        } else {
          createdAtDate = new Date();
        }

        setSelectedBuilding({
          ...data,
          company: data.company || 'exvagas',
          createdAt: createdAtDate,
        });
      }
      // Não auto-selecionar mais - deixar usuário escolher o condomínio
    } catch (error) {
      console.error('Error loading from Firebase:', error);
      setBuildings(mockBuildings);
    }
  };

  const saveToFirebase = async () => {
    try {
      if (selectedBuilding) {
        // Convert date to ISO string before saving
        const buildingToSave = {
          ...selectedBuilding,
          createdAt: selectedBuilding.createdAt instanceof Date ? selectedBuilding.createdAt.toISOString() : selectedBuilding.createdAt,
        };
        await set(ref(database, DB_PATHS.SELECTED_BUILDING), buildingToSave);
      }
    } catch (error) {
      console.error('Error saving to Firebase:', error);
    }
  };

  const saveBuildingData = async (buildingId: string) => {
    try {
      const participantsObj = participants.reduce((acc, p) => ({
        ...acc,
        [p.id]: sanitizeForFirebase(p)
      }), {});

      const spotsObj = parkingSpots.reduce((acc, s) => ({
        ...acc,
        [s.id]: sanitizeForFirebase(s)
      }), {});

      // Convert dates to ISO strings for Firebase
      const sessionsObj = lotterySessions.reduce((acc, l) => ({
        ...acc,
        [l.id]: sanitizeForFirebase({
          ...l,
          date: l.date instanceof Date ? l.date.toISOString() : l.date,
          results: l.results.map(r => ({
            ...r,
            timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
          })),
        })
      }), {});

      console.log('💾 Saving building data to Firebase:', {
        buildingId,
        participantsCount: Object.keys(participantsObj).length,
        spotsCount: Object.keys(spotsObj).length,
        sessionsCount: Object.keys(sessionsObj).length
      });

      await set(ref(database, getBuildingPath(buildingId, 'participants')), participantsObj);
      await set(ref(database, getBuildingPath(buildingId, 'parkingSpots')), spotsObj);
      await set(ref(database, getBuildingPath(buildingId, 'lotterySessions')), sessionsObj);

      console.log('✅ Successfully saved to Firebase');
    } catch (error) {
      console.error('❌ Error saving building data to Firebase:', error);
    }
  };

  // Building methods
  const addBuilding = async (building: Building) => {
    setBuildings(prev => [...prev, building]);
    try {
      // Convert date to ISO string before saving
      const buildingToSave = {
        ...building,
        createdAt: building.createdAt instanceof Date ? building.createdAt.toISOString() : building.createdAt,
      };

      // Create building with hierarchical structure
      await set(ref(database, getBuildingPath(building.id, 'info')), buildingToSave);
      // Initialize empty collections for the new building
      await set(ref(database, getBuildingPath(building.id, 'participants')), {});
      await set(ref(database, getBuildingPath(building.id, 'parkingSpots')), {});
      await set(ref(database, getBuildingPath(building.id, 'lotterySessions')), {});
    } catch (error) {
      console.error('Error saving building to Firebase:', error);
    }
  };

  const updateBuilding = async (updatedBuilding: Building) => {
    setBuildings(prev => prev.map(b => b.id === updatedBuilding.id ? updatedBuilding : b));
    try {
      // Convert date to ISO string before saving
      const buildingToSave = {
        ...updatedBuilding,
        createdAt: updatedBuilding.createdAt instanceof Date ? updatedBuilding.createdAt.toISOString() : updatedBuilding.createdAt,
      };

      await set(ref(database, getBuildingPath(updatedBuilding.id, 'info')), buildingToSave);
    } catch (error) {
      console.error('Error updating building in Firebase:', error);
    }
  };

  const deleteBuilding = async (id: string) => {
    setBuildings(prev => prev.filter(b => b.id !== id));

    // Clear selected building if it's the one being deleted
    if (selectedBuilding?.id === id) {
      setSelectedBuilding(null);
      setParticipants([]);
      setParkingSpots([]);
      setLotterySessions([]);
      // Clear from Firebase
      await set(ref(database, DB_PATHS.SELECTED_BUILDING), null);
    }

    try {
      // Delete entire building node (including all nested data)
      await set(ref(database, getBuildingPath(id)), null);
    } catch (error) {
      console.error('Error deleting building from Firebase:', error);
    }
  };

  // Participant methods
  const addParticipant = (participant: Participant) => {
    console.log('➕ Adding participant:', participant);
    setParticipants(prev => {
      const updated = [...prev, participant];
      console.log('📋 Total participants after add:', updated.length);
      return updated;
    });
  };

  const updateParticipant = (updatedParticipant: Participant) => {
    setParticipants(prev =>
      prev.map(p => p.id === updatedParticipant.id ? updatedParticipant : p)
    );
  };

  const deleteParticipant = (id: string) => {
    setParticipants(prev => prev.filter(p => p.id !== id));
    setSelectedParticipants(prev => prev.filter(pId => pId !== id));
  };

  // Parking spot methods
  const addParkingSpot = (spot: ParkingSpot) => {
    setParkingSpots(prev => [...prev, spot]);
  };

  const updateParkingSpot = (updatedSpot: ParkingSpot) => {
    setParkingSpots(prev =>
      prev.map(s => s.id === updatedSpot.id ? updatedSpot : s)
    );
  };

  const deleteParkingSpot = (id: string) => {
    setParkingSpots(prev => prev.filter(s => s.id !== id));
    setSelectedSpots(prev => prev.filter(sId => sId !== id));
  };

  // Lottery session methods
  const saveLotterySession = async (session: LotterySession) => {
    setLotterySessions(prev => {
      const existing = prev.find(s => s.id === session.id);
      if (existing) {
        return prev.map(s => s.id === session.id ? session : s);
      }
      return [...prev, session];
    });

    // Salvar diretamente no Firebase para evitar race condition com isLoadingFromFirebase
    if (selectedBuilding?.id) {
      try {
        const sessionToSave = sanitizeForFirebase({
          ...session,
          date: session.date instanceof Date ? session.date.toISOString() : session.date,
          results: session.results.map(r => ({
            ...r,
            timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
          })),
        });
        await set(ref(database, `buildings/${selectedBuilding.id}/lotterySessions/${session.id}`), sessionToSave);
        console.log('✅ Sessão salva diretamente no Firebase:', session.id);
      } catch (error) {
        console.error('❌ Erro ao salvar sessão diretamente:', error);
      }
    }
  };

  const updateLotterySession = (updatedSession: LotterySession) => {
    console.log('✏️ Updating lottery session:', updatedSession.id);

    // Adicionar um timestamp de última modificação
    const sessionWithTimestamp = {
      ...updatedSession,
      lastModified: new Date().toISOString(), // Novo campo para tracking
    };

    setLotterySessions(prev =>
      prev.map(session =>
        session.id === updatedSession.id ? sessionWithTimestamp : session
      )
    );
  };

  const deleteLotterySession = (id: string) => {
    console.log('🗑️ Deleting lottery session:', id);
    setLotterySessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      console.log('📋 Sessions after delete:', filtered.length);
      return filtered;
    });
  };

  // 🔥 ADICIONAR ESTA NOVA FUNÇÃO
  const republishLotterySession = async (session: LotterySession) => {
    try {
      const { savePublicResults } = await import('@/utils/publicResults');

      console.log('📤 Republicando sessão:', session.id);

      const result = await savePublicResults(
        session,
        selectedBuilding?.name || '',
        participants,
        parkingSpots,
        selectedBuilding?.company
      );

      if (result && result.success) {
        console.log('✅ Sessão republicada com sucesso');
      } else {
        console.error('❌ Erro ao republicar:', result?.error);
      }

      return result;
    } catch (error) {
      console.error('❌ Erro ao republicar sessão:', error);
      return { success: false, error: String(error) };
    }
  };

  return (
    <AppContext.Provider value={{
      buildings,
      setBuildings,
      addBuilding,
      updateBuilding,
      deleteBuilding,
      selectedBuilding,
      setSelectedBuilding,
      participants,
      setParticipants,
      addParticipant,
      updateParticipant,
      deleteParticipant,
      parkingSpots,
      setParkingSpots,
      addParkingSpot,
      updateParkingSpot,
      deleteParkingSpot,
      lotterySessions,
      setLotterySessions,
      saveLotterySession,
      updateLotterySession,
      deleteLotterySession,
      republishLotterySession, // 🔥 ADICIONAR ESTA LINHA
      selectedParticipants,
      setSelectedParticipants,
      selectedSpots,
      setSelectedSpots,
      saveToFirebase,
      loadFromFirebase,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};