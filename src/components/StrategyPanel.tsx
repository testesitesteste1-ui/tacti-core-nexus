import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Target, 
  Calendar,
  TrendingUp,
  Flag,
  CheckCircle2
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ref, onValue, set } from "firebase/database";
import { database } from "@/lib/firebase";

interface Objective {
  id: string;
  title: string;
  type: "annual" | "monthly" | "weekly";
  progress: number;
  milestones: number;
  completed: number;
}

const mockObjectives: Objective[] = [
  {
    id: "1",
    title: "Build 6-figure business",
    type: "annual",
    progress: 34,
    milestones: 12,
    completed: 4
  },
  {
    id: "2",
    title: "Master negotiation tactics",
    type: "monthly",
    progress: 67,
    milestones: 5,
    completed: 3
  },
  {
    id: "3",
    title: "Complete 5 strategic books",
    type: "monthly",
    progress: 80,
    milestones: 5,
    completed: 4
  },
  {
    id: "4",
    title: "Optimize daily routine",
    type: "weekly",
    progress: 100,
    milestones: 7,
    completed: 7
  },
];

export const StrategyPanel = () => {
  const { user } = useAuth();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);

  // Load objectives from Firebase
  useEffect(() => {
    if (!user) return;

    const objectivesRef = ref(database, `users/${user.uid}/objectives`);
    const unsubscribe = onValue(objectivesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const objectivesArray = Object.entries(data).map(([id, objective]: [string, any]) => ({
          id,
          ...objective
        }));
        setObjectives(objectivesArray);
      } else {
        // Initialize with default objectives
        const defaultObjectives: Record<string, Objective> = {};
        mockObjectives.forEach(objective => {
          defaultObjectives[objective.id] = objective;
        });
        set(objectivesRef, defaultObjectives);
        setObjectives(mockObjectives);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const getTypeColor = (type: Objective["type"]) => {
    switch (type) {
      case "annual":
        return "border-accent text-accent";
      case "monthly":
        return "border-primary text-primary";
      case "weekly":
        return "border-success text-success";
    }
  };

  const getTypeIcon = (type: Objective["type"]) => {
    switch (type) {
      case "annual":
        return <Flag className="w-4 h-4" />;
      case "monthly":
        return <Calendar className="w-4 h-4" />;
      case "weekly":
        return <TrendingUp className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background tactical-grid flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground font-tactical uppercase">Carregando estratégias...</p>
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
            <h1 className="text-2xl md:text-4xl font-bold text-foreground">COMANDO ESTRATÉGICO</h1>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground">Objetivos de Longo Prazo • Planejamento Tático</p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-accent/50 p-4 md:p-6">
            <div className="flex items-center gap-2 mb-2">
              <Flag className="w-4 h-4 md:w-5 md:h-5 text-accent" />
              <span className="text-xs md:text-sm text-muted-foreground uppercase">Metas Anuais</span>
            </div>
            <p className="text-2xl md:text-3xl font-tactical font-bold text-accent">
              {objectives.filter(o => o.type === "annual").length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(objectives.filter(o => o.type === "annual").reduce((acc, o) => acc + o.progress, 0) / Math.max(objectives.filter(o => o.type === "annual").length, 1))}% progresso médio
            </p>
          </Card>

          <Card className="bg-card border-primary/50 p-4 md:p-6">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              <span className="text-xs md:text-sm text-muted-foreground uppercase">Metas Mensais</span>
            </div>
            <p className="text-2xl md:text-3xl font-tactical font-bold text-primary">
              {objectives.filter(o => o.type === "monthly").length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(objectives.filter(o => o.type === "monthly").reduce((acc, o) => acc + o.progress, 0) / Math.max(objectives.filter(o => o.type === "monthly").length, 1))}% progresso médio
            </p>
          </Card>

          <Card className="bg-card border-success/50 p-4 md:p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-success" />
              <span className="text-xs md:text-sm text-muted-foreground uppercase">Metas Semanais</span>
            </div>
            <p className="text-2xl md:text-3xl font-tactical font-bold text-success">
              {objectives.filter(o => o.type === "weekly").length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(objectives.filter(o => o.type === "weekly").reduce((acc, o) => acc + o.progress, 0) / Math.max(objectives.filter(o => o.type === "weekly").length, 1))}% progresso médio
            </p>
          </Card>
        </div>

        {/* Objectives List */}
        <div className="space-y-4">
          <h2 className="text-base md:text-lg font-semibold text-foreground flex items-center gap-2">
            <Target className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            OBJETIVOS ATIVOS
          </h2>

          {objectives.map((objective) => (
            <Card 
              key={objective.id}
              className="bg-card border-border p-6 hover:border-primary/50 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-base md:text-xl font-bold text-foreground">{objective.title}</h3>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`${getTypeColor(objective.type)} uppercase text-xs`}
                  >
                    {getTypeIcon(objective.type)}
                    <span className="ml-1">{objective.type}</span>
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-2xl md:text-3xl font-tactical font-bold text-primary">
                    {objective.progress}%
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-500 shadow-[0_0_10px_hsl(var(--primary))]"
                    style={{ width: `${objective.progress}%` }}
                  />
                </div>
              </div>

              {/* Milestones */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4" />
                  <span>
                    {objective.completed}/{objective.milestones} marcos
                  </span>
                </div>
                <Button size="sm" variant="outline" className="border-primary/30 text-primary text-xs">
                  Atualizar
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Add New Objective */}
        <Button className="w-full bg-primary hover:bg-primary/80 text-primary-foreground font-semibold h-10 md:h-12 text-xs md:text-base">
          + NOVO OBJETIVO ESTRATÉGICO
        </Button>
      </div>
    </div>
  );
};
