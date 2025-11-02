import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, Zap, TrendingUp, Brain, Award, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ref, onValue, set } from "firebase/database";
import { database } from "@/lib/firebase";

interface DailyMetrics {
  mood: number;
  energy: number;
  focus: number;
  productivity: number;
}

export const Dashboard = () => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<DailyMetrics>({
    mood: 75,
    energy: 80,
    focus: 85,
    productivity: 70,
  });

  const quotes = [
    "You don't get lucky, you make your own luck. – Harvey Specter",
    "Winners don't make excuses.",
    "I'm not about caring, I'm about winning.",
    "Work until your idols become your rivals.",
    "The only time success comes before work is in the dictionary.",
  ];

  const [currentQuote, setCurrentQuote] = useState(quotes[0]);
  const [stats, setStats] = useState({
    activeMissions: 7,
    completedThisWeek: 3,
    weeklyScore: 84,
    level: "EXECUTOR"
  });

  useEffect(() => {
    setCurrentQuote(quotes[Math.floor(Math.random() * quotes.length)]);
  }, []);

  // Load metrics from Firebase
  useEffect(() => {
    if (!user) return;

    const metricsRef = ref(database, `users/${user.uid}/metrics`);
    const unsubscribe = onValue(metricsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setMetrics(data);
      } else {
        // Initialize with default values
        set(metricsRef, metrics);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Load stats from Firebase
  useEffect(() => {
    if (!user) return;

    const statsRef = ref(database, `users/${user.uid}/stats`);
    const unsubscribe = onValue(statsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setStats(data);
      } else {
        // Initialize with default values
        set(statsRef, stats);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const MetricCard = ({ 
    label, 
    value, 
    icon: Icon 
  }: { 
    label: string; 
    value: number; 
    icon: any 
  }) => (
    <Card className="bg-card border-border p-4 hover:border-primary/50 transition-all duration-300 scan-line">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-tactical font-bold text-primary glow-primary">{value}</span>
        <span className="text-muted-foreground mb-1">%</span>
      </div>
      <div className="mt-3 bg-muted rounded-full h-1.5 overflow-hidden">
        <div 
          className="bg-primary h-full transition-all duration-500 shadow-[0_0_10px_hsl(var(--primary))]"
          style={{ width: `${value}%` }}
        />
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background tactical-grid">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="border-b border-border pb-4 md:pb-6">
          <div className="flex items-center gap-2 md:gap-3 mb-2">
            <Target className="w-6 h-6 md:w-8 md:h-8 text-primary glow-primary" />
            <h1 className="text-2xl md:text-4xl font-bold text-foreground">TACTICAL HQ</h1>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground">Command Center • Personal Operations Dashboard</p>
        </div>

        {/* Quote Section */}
        <Card className="bg-gradient-to-br from-card to-muted border-primary/30 p-4 md:p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-success"></div>
          <blockquote className="text-base md:text-xl lg:text-2xl font-light text-foreground italic">
            "{currentQuote}"
          </blockquote>
        </Card>

        {/* Daily Metrics */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            DAILY STATUS
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Mood" value={metrics.mood} icon={Brain} />
            <MetricCard label="Energy" value={metrics.energy} icon={Zap} />
            <MetricCard label="Focus" value={metrics.focus} icon={Target} />
            <MetricCard label="Productivity" value={metrics.productivity} icon={TrendingUp} />
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border p-6 hover:border-success/50 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground uppercase">Active Missions</span>
              <Award className="w-5 h-5 text-success" />
            </div>
            <p className="text-4xl font-tactical font-bold text-success glow-success">{stats.activeMissions}</p>
            <p className="text-xs text-muted-foreground mt-2">{stats.completedThisWeek} completed this week</p>
          </Card>

          <Card className="bg-card border-border p-6 hover:border-primary/50 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground uppercase">Weekly Score</span>
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <p className="text-4xl font-tactical font-bold text-primary glow-primary">{stats.weeklyScore}</p>
            <p className="text-xs text-muted-foreground mt-2">↑ 12% desde a última semana</p>
          </Card>

          <Card className="bg-card border-border p-6 hover:border-accent/50 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground uppercase">Current Level</span>
              <Target className="w-5 h-5 text-accent" />
            </div>
            <p className="text-2xl md:text-4xl font-tactical font-bold text-accent glow-accent">{stats.level}</p>
            <p className="text-xs text-muted-foreground mt-2">Próximo: Strategist (78%)</p>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 md:gap-3">
          <Button className="bg-primary hover:bg-primary/80 text-primary-foreground font-semibold text-xs md:text-sm">
            Nova Missão
          </Button>
          <Button variant="outline" className="border-primary text-primary hover:bg-primary/10 text-xs md:text-sm">
            Ver Operações
          </Button>
          <Button variant="outline" className="border-success text-success hover:bg-success/10 text-xs md:text-sm">
            Análise Semanal
          </Button>
        </div>
      </div>
    </div>
  );
};
