import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, Zap, TrendingUp, Brain, Award, Activity } from "lucide-react";

interface DailyMetrics {
  mood: number;
  energy: number;
  focus: number;
  productivity: number;
}

export const Dashboard = () => {
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

  useEffect(() => {
    setCurrentQuote(quotes[Math.floor(Math.random() * quotes.length)]);
  }, []);

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
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="border-b border-border pb-6">
          <div className="flex items-center gap-3 mb-2">
            <Target className="w-8 h-8 text-primary glow-primary" />
            <h1 className="text-4xl font-bold text-foreground">TACTICAL HQ</h1>
          </div>
          <p className="text-muted-foreground">Command Center • Personal Operations Dashboard</p>
        </div>

        {/* Quote Section */}
        <Card className="bg-gradient-to-br from-card to-muted border-primary/30 p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-success"></div>
          <blockquote className="text-xl md:text-2xl font-light text-foreground italic">
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
            <p className="text-4xl font-tactical font-bold text-success glow-success">7</p>
            <p className="text-xs text-muted-foreground mt-2">3 completed this week</p>
          </Card>

          <Card className="bg-card border-border p-6 hover:border-primary/50 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground uppercase">Weekly Score</span>
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <p className="text-4xl font-tactical font-bold text-primary glow-primary">84</p>
            <p className="text-xs text-muted-foreground mt-2">↑ 12% from last week</p>
          </Card>

          <Card className="bg-card border-border p-6 hover:border-accent/50 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground uppercase">Current Level</span>
              <Target className="w-5 h-5 text-accent" />
            </div>
            <p className="text-4xl font-tactical font-bold text-accent glow-accent">EXECUTOR</p>
            <p className="text-xs text-muted-foreground mt-2">Next: Strategist (78% progress)</p>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <Button className="bg-primary hover:bg-primary/80 text-primary-foreground font-semibold">
            New Mission
          </Button>
          <Button variant="outline" className="border-primary text-primary hover:bg-primary/10">
            View All Operations
          </Button>
          <Button variant="outline" className="border-success text-success hover:bg-success/10">
            Weekly Analysis
          </Button>
        </div>
      </div>
    </div>
  );
};
