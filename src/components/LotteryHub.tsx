import { Settings, Shuffle, MapPin, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface LotteryHubProps {
  onSelectLottery: (type: string) => void;
}

const lotteries = [
  {
    id: "lottery",
    title: "Sorteio Geral",
    description: "Sorteio automático distribuindo todas as vagas disponíveis entre os participantes de forma aleatória, respeitando prioridades.",
    icon: Settings,
    gradient: "from-blue-500 to-indigo-600",
    bgAccent: "bg-blue-50 dark:bg-blue-950/30",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "choice-lottery",
    title: "Sorteio por Escolha",
    description: "Os participantes escolhem suas vagas na ordem sorteada, permitindo maior controle e preferência individual.",
    icon: Shuffle,
    gradient: "from-amber-500 to-orange-600",
    bgAccent: "bg-amber-50 dark:bg-amber-950/30",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  {
    id: "sector-lottery",
    title: "Sorteio por Setor",
    description: "Distribui as vagas respeitando a alocação por setores, ideal para condomínios com áreas de estacionamento separadas.",
    icon: MapPin,
    gradient: "from-emerald-500 to-teal-600",
    bgAccent: "bg-emerald-50 dark:bg-emerald-950/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
];

export const LotteryHub = ({ onSelectLottery }: LotteryHubProps) => {
  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Sorteios</h1>
        <p className="text-muted-foreground mt-1">
          Escolha o tipo de sorteio que deseja realizar
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {lotteries.map((lottery) => {
          const Icon = lottery.icon;
          return (
            <Card
              key={lottery.id}
              className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-2 hover:border-primary/30 overflow-hidden"
              onClick={() => onSelectLottery(lottery.id)}
            >
              <div className={`h-2 bg-gradient-to-r ${lottery.gradient}`} />
              <CardHeader className="pb-3">
                <div className={`w-12 h-12 rounded-xl ${lottery.bgAccent} flex items-center justify-center mb-3`}>
                  <Icon className={`h-6 w-6 ${lottery.iconColor}`} />
                </div>
                <CardTitle className="text-xl">{lottery.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CardDescription className="text-sm leading-relaxed">
                  {lottery.description}
                </CardDescription>
                <Button
                  variant="ghost"
                  className="p-0 h-auto text-primary font-medium group-hover:gap-3 transition-all"
                >
                  Acessar
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
