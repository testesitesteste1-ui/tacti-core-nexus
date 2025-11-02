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

  return (
    <div className="min-h-screen bg-background tactical-grid">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="border-b border-border pb-6">
          <div className="flex items-center gap-3 mb-2">
            <Target className="w-8 h-8 text-primary glow-primary" />
            <h1 className="text-4xl font-bold text-foreground">STRATEGIC COMMAND</h1>
          </div>
          <p className="text-muted-foreground">Long-term Objectives • Tactical Planning</p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-accent/50 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Flag className="w-5 h-5 text-accent" />
              <span className="text-sm text-muted-foreground uppercase">Annual Goals</span>
            </div>
            <p className="text-3xl font-tactical font-bold text-accent">1</p>
            <p className="text-xs text-muted-foreground mt-1">34% average progress</p>
          </Card>

          <Card className="bg-card border-primary/50 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground uppercase">Monthly Goals</span>
            </div>
            <p className="text-3xl font-tactical font-bold text-primary">2</p>
            <p className="text-xs text-muted-foreground mt-1">73% average progress</p>
          </Card>

          <Card className="bg-card border-success/50 p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-success" />
              <span className="text-sm text-muted-foreground uppercase">Weekly Goals</span>
            </div>
            <p className="text-3xl font-tactical font-bold text-success">1</p>
            <p className="text-xs text-muted-foreground mt-1">100% complete</p>
          </Card>
        </div>

        {/* Objectives List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            ACTIVE OBJECTIVES
          </h2>

          {mockObjectives.map((objective) => (
            <Card 
              key={objective.id}
              className="bg-card border-border p-6 hover:border-primary/50 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-bold text-foreground">{objective.title}</h3>
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
                  <p className="text-3xl font-tactical font-bold text-primary">
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {objective.completed}/{objective.milestones} milestones
                  </span>
                </div>
                <Button size="sm" variant="outline" className="border-primary/30 text-primary">
                  Update Progress
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Add New Objective */}
        <Button className="w-full bg-primary hover:bg-primary/80 text-primary-foreground font-semibold h-12">
          + NEW STRATEGIC OBJECTIVE
        </Button>
      </div>
    </div>
  );
};
