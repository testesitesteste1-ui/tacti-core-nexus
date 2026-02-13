import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Copy, ExternalLink, Trash2, FileText, Share2 } from 'lucide-react';
import { deletePublicResults } from '@/utils/publicResults';
import { useToast } from '@/hooks/use-toast';
import { useAppContext } from '@/context/AppContext';
import { generateLotteryPDF } from '@/utils/pdfGenerator';
import exeventosLogo from '@/assets/exeventos-logo.png';

interface QRCodeManagerProps {
  buildingId: string;
  buildingName?: string;
  lastLotteryDate?: string | Date | null;
}

export const QRCodeManager: React.FC<QRCodeManagerProps> = ({ buildingId, buildingName, lastLotteryDate }) => {
  const { toast } = useToast();
  const { lotterySessions, participants, parkingSpots, selectedBuilding } = useAppContext();
  const [isDeleting, setIsDeleting] = useState(false);
  
  const publicPath = `/resultados/${buildingId}`;
  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}${publicPath}` : publicPath;

  const qrSrc = `https://chart.googleapis.com/chart?chs=280x280&cht=qr&chl=${encodeURIComponent(publicUrl)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast({
        title: "Link copiado!",
        description: "O link foi copiado para a área de transferência.",
      });
    } catch (err) {
      console.error('Erro ao copiar link', err);
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o link.",
        variant: "destructive",
      });
    }
  };

  const openPublic = () => {
    window.open(publicUrl, '_blank', 'noopener');
  };

  const handleGeneratePDF = () => {
    const buildingSessions = lotterySessions
      .filter(session => session.buildingId === buildingId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (buildingSessions.length === 0) {
      toast({
        title: "Nenhum sorteio encontrado",
        description: "Não há sorteios realizados para este condomínio.",
        variant: "destructive",
      });
      return;
    }

    const lastSession = buildingSessions[0];
    const companyType = selectedBuilding?.company || 'exvagas';

    generateLotteryPDF(
      lastSession.name,
      lastSession.results || [],
      participants,
      parkingSpots,
      companyType,
      buildingName
    );

    toast({
      title: "PDF gerado",
      description: "O PDF dos resultados foi gerado com sucesso.",
    });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Resultados do Sorteio - ${buildingName || 'Condomínio'}`,
          text: 'Confira os resultados do sorteio de vagas',
          url: publicUrl,
        });
        toast({
          title: "Compartilhado",
          description: "Link compartilhado com sucesso.",
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Erro ao compartilhar', err);
        }
      }
    } else {
      await copyLink();
    }
  };

  const handleClearResults = async () => {
    if (!confirm('Tem certeza que deseja limpar os resultados públicos? Esta ação não pode ser desfeita.')) {
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deletePublicResults(buildingId);
      
      if (result.success) {
        toast({
          title: "Resultados limpos",
          description: "Os resultados públicos foram removidos com sucesso.",
        });
      } else {
        toast({
          title: "Erro ao limpar",
          description: result.error || "Não foi possível limpar os resultados.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro ao limpar",
        description: "Ocorreu um erro ao tentar limpar os resultados.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const formattedDate = lastLotteryDate
    ? (lastLotteryDate instanceof Date ? lastLotteryDate.toLocaleString() : new Date(lastLotteryDate).toLocaleString())
    : '—';

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle>QR Code Público</CardTitle>
        <CardDescription>Compartilhe os resultados públicos do condomínio</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4">
          {/* Logo da empresa */}
          <div className="w-full flex justify-center mb-2">
            <img 
              src={exeventosLogo}
              alt="Ex Eventos"
              className="h-16 object-contain mix-blend-multiply"
            />
          </div>

          <div className="w-full text-center">
            <div className="text-xs text-muted-foreground">Link público</div>
            <div className="truncate font-mono text-sm">{publicUrl}</div>
          </div>

          <div className="flex gap-2 w-full">
            <Button onClick={copyLink} className="flex-1" variant="outline" size="sm">
              <Copy className="mr-2 h-4 w-4" /> Copiar Link
            </Button>
          </div>

          <div className="w-full">
            <div className="text-xs text-muted-foreground mb-2 text-center font-medium">Abrir visualização</div>
            <div className="flex gap-2 w-full">
              <Button onClick={() => window.open(`${publicUrl}?view=sorteio`, '_blank', 'noopener')} className="flex-1" size="sm">
                Sorteio
              </Button>
              <Button onClick={() => window.open(`${publicUrl}?view=planta`, '_blank', 'noopener')} className="flex-1" size="sm">
                Planta
              </Button>
              <Button onClick={() => window.open(`${publicUrl}?view=ambos`, '_blank', 'noopener')} className="flex-1" size="sm">
                Sorteio/Planta
              </Button>
            </div>
          </div>

          <div className="flex gap-2 w-full">
            <Button onClick={handleGeneratePDF} className="flex-1" variant="secondary">
              <FileText className="mr-2 h-4 w-4" /> Gerar PDF
            </Button>
            <Button onClick={handleShare} className="flex-1" variant="secondary">
              <Share2 className="mr-2 h-4 w-4" /> Compartilhar
            </Button>
          </div>

          <Button 
            onClick={handleClearResults} 
            variant="destructive" 
            className="w-full"
            disabled={isDeleting}
          >
            <Trash2 className="mr-2 h-4 w-4" /> 
            {isDeleting ? 'Limpando...' : 'Limpar Resultados Públicos'}
          </Button>

          {/* <div className="w-full text-xs text-muted-foreground text-center">
            Último sorteio: {formattedDate}
          </div> */}
        </div>
      </CardContent>
    </Card>
  );
};

export default QRCodeManager;
