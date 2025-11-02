import { Link, useLocation } from "react-router-dom";
import { Target, Crosshair, Map, Brain, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", label: "HQ", icon: Target },
  { path: "/missions", label: "Missions", icon: Crosshair },
  { path: "/strategy", label: "Strategy", icon: Map },
];

export const Navigation = () => {
  const location = useLocation();

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Target className="w-6 h-6 text-primary glow-primary" />
            <span className="text-xl font-bold font-tactical">TACTICAL OS</span>
          </div>

          {/* Navigation Links */}
          <div className="flex gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 font-semibold text-sm uppercase tracking-wider",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.5)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Status Indicator */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success pulse-glow"></div>
            <span className="text-xs text-muted-foreground uppercase font-tactical">
              System Active
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
};
