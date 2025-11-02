import { Link, useLocation } from "react-router-dom";
import { Target, Crosshair, Map, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/", label: "HQ", icon: Target },
  { path: "/missions", label: "Missions", icon: Crosshair },
  { path: "/strategy", label: "Strategy", icon: Map },
];

export const Navigation = () => {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 md:w-6 md:h-6 text-primary glow-primary" />
            <span className="text-base md:text-xl font-bold font-tactical">TACTICAL OS</span>
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
                    "flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-lg transition-all duration-300 font-semibold text-xs md:text-sm uppercase tracking-wider",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.5)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="w-3 h-3 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* User Actions */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success pulse-glow"></div>
              <span className="text-xs text-muted-foreground uppercase font-tactical">
                {user?.email?.split('@')[0]}
              </span>
            </div>
            <Button
              onClick={logout}
              size="sm"
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 h-8 px-2 md:px-3"
            >
              <LogOut className="w-3 h-3 md:w-4 md:h-4" />
              <span className="ml-1 hidden sm:inline text-xs">Sair</span>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};
