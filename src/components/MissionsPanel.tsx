import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Target, 
  Clock, 
  CheckCircle2, 
  Circle, 
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Heart,
  Briefcase
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ref, onValue, set } from "firebase/database";
import { database } from "@/lib/firebase";
import { toast } from "sonner";

type MissionStatus = "active" | "completed" | "aborted";
type MissionTag = "personal" | "financial" | "physical" | "strategic";

interface Mission {
  id: string;
  name: string;
  description: string;
  status: MissionStatus;
  tag: MissionTag;
  difficulty: number;
  impact: number;
  progress: number;
  deadline?: string;
}

const mockMissions: Mission[] = [
  {
    id: "1",
    name: "OPERATION APEX",
    description: "Complete advanced financial strategy course",
    status: "active",
    tag: "financial",
    difficulty: 8,
    impact: 9,
    progress: 65,
    deadline: "2025-12-15"
  },
  {
    id: "2",
    name: "MISSION 17B",
    description: "Achieve 15% body fat percentage",
    status: "active",
    tag: "physical",
    difficulty: 7,
    impact: 8,
    progress: 45,
    deadline: "2025-11-30"
  },
  {
    id: "3",
    name: "OPERATION NETWORK",
    description: "Connect with 10 industry leaders",
    status: "active",
    tag: "strategic",
    difficulty: 6,
    impact: 9,
    progress: 30,
  },
  {
    id: "4",
    name: "PROJECT ZENITH",
    description: "Establish daily meditation routine",
    status: "completed",
    tag: "personal",
    difficulty: 4,
    impact: 7,
    progress: 100,
  },
];

export const MissionsPanel = () => {
  const { user } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [filter, setFilter] = useState<"all" | MissionStatus>("all");
  const [loading, setLoading] = useState(true);

  // Load missions from Firebase
  useEffect(() => {
    if (!user) return;

    const missionsRef = ref(database, `users/${user.uid}/missions`);
    const unsubscribe = onValue(missionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const missionsArray = Object.entries(data).map(([id, mission]: [string, any]) => ({
          id,
          ...mission
        }));
        setMissions(missionsArray);
      } else {
        // Initialize with default missions
        const defaultMissions: Record<string, Mission> = {};
        mockMissions.forEach(mission => {
          defaultMissions[mission.id] = mission;
        });
        set(missionsRef, defaultMissions);
        setMissions(mockMissions);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const getStatusIcon = (status: MissionStatus) => {
    switch (status) {
      case "active":
        return <Clock className="w-4 h-4 text-primary" />;
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "aborted":
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
    }
  };

  const getTagIcon = (tag: MissionTag) => {
    switch (tag) {
      case "financial":
        return <DollarSign className="w-4 h-4" />;
      case "physical":
        return <TrendingUp className="w-4 h-4" />;
      case "strategic":
        return <Briefcase className="w-4 h-4" />;
      case "personal":
        return <Heart className="w-4 h-4" />;
    }
  };

  const getTagColor = (tag: MissionTag) => {
    switch (tag) {
      case "financial":
        return "border-success text-success";
      case "physical":
        return "border-accent text-accent";
      case "strategic":
        return "border-primary text-primary";
      case "personal":
        return "border-tactical-warning text-tactical-warning";
    }
  };

  const filteredMissions = filter === "all" 
    ? missions 
    : missions.filter(m => m.status === filter);

  if (loading) {
    return (
      <div className="min-h-screen bg-background tactical-grid flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground font-tactical uppercase">Carregando missões...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background tactical-grid">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="border-b border-border pb-4 md:pb-6">
          <div className="flex items-center gap-2 md:gap-3 mb-2">
            <Target className="w-6 h-6 md:w-8 md:h-8 text-primary glow-primary" />
            <h1 className="text-2xl md:text-4xl font-bold text-foreground">MISSION CONTROL</h1>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground">Active Operations • Strategic Objectives</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
            className={`text-xs md:text-sm ${filter === "all" ? "bg-primary" : "border-primary/30"}`}
          >
            Todas
          </Button>
          <Button
            size="sm"
            variant={filter === "active" ? "default" : "outline"}
            onClick={() => setFilter("active")}
            className={`text-xs md:text-sm ${filter === "active" ? "bg-primary" : "border-primary/30"}`}
          >
            Ativas
          </Button>
          <Button
            size="sm"
            variant={filter === "completed" ? "default" : "outline"}
            onClick={() => setFilter("completed")}
            className={`text-xs md:text-sm ${filter === "completed" ? "bg-success" : "border-success/30"}`}
          >
            Concluídas
          </Button>
        </div>

        {/* Missions Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredMissions.map((mission) => (
            <Card 
              key={mission.id}
              className="bg-card border-border p-6 hover:border-primary/50 transition-all duration-300 scan-line"
            >
              {/* Mission Header */}
              <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusIcon(mission.status)}
                    <h3 className="text-base md:text-xl font-bold font-tactical text-foreground">
                      {mission.name}
                    </h3>
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground">{mission.description}</p>
                </div>
              </div>

              {/* Mission Details */}
              <div className="space-y-3">
                {/* Tags and Status */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge 
                    variant="outline" 
                    className={`${getTagColor(mission.tag)} uppercase text-xs`}
                  >
                    {getTagIcon(mission.tag)}
                    <span className="ml-1">{mission.tag}</span>
                  </Badge>
                  <Badge 
                    variant="outline"
                    className={
                      mission.status === "completed" 
                        ? "border-success text-success"
                        : mission.status === "active"
                        ? "border-primary text-primary"
                        : "border-destructive text-destructive"
                    }
                  >
                    {mission.status.toUpperCase()}
                  </Badge>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">Difficulty</p>
                    <p className="text-lg font-tactical font-bold text-accent">
                      {mission.difficulty}/10
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">Impact</p>
                    <p className="text-lg font-tactical font-bold text-success">
                      {mission.impact}/10
                    </p>
                  </div>
                </div>

                {/* Progress */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-muted-foreground uppercase">Progress</span>
                    <span className="text-sm font-tactical font-bold text-primary">
                      {mission.progress}%
                    </span>
                  </div>
                  <div className="bg-muted rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-500 shadow-[0_0_10px_hsl(var(--primary))]"
                      style={{ width: `${mission.progress}%` }}
                    />
                  </div>
                </div>

                {/* Deadline */}
                {mission.deadline && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>Target: {mission.deadline}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                <Button size="sm" variant="outline" className="border-primary/30 text-primary text-xs">
                  Atualizar
                </Button>
                <Button size="sm" variant="outline" className="border-border text-xs">
                  Relatório
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Add New Mission */}
        <Button className="w-full bg-primary hover:bg-primary/80 text-primary-foreground font-semibold h-10 md:h-12 text-xs md:text-base">
          + NOVA MISSÃO
        </Button>
      </div>
    </div>
  );
};
