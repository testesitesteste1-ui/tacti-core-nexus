import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Building } from '@/types/lottery';
import { Download, Upload, Database, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { database } from '@/config/firebase';
import { ref, get } from 'firebase/database';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BackupManagerProps {
  buildings: Building[];
  onImportComplete?: () => void;
}

interface BackupData {
  version: string;
  exportDate: string;
  buildings: {
    [buildingId: string]: {
      info: Building;
      participants: any[];
      parkingSpots: any[];
      lotterySessions: any[];
    };
  };
}

export const BackupManager = ({ buildings, onImportComplete }: BackupManagerProps) => {
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const toggleBuilding = (buildingId: string) => {
    setSelectedBuildings(prev =>
      prev.includes(buildingId)
        ? prev.filter(id => id !== buildingId)
        : [...prev, buildingId]
    );
  };

  const selectAll = () => {
    setSelectedBuildings(buildings.map(b => b.id));
  };

  const deselectAll = () => {
    setSelectedBuildings([]);
  };

  const exportBackup = async () => {
    if (selectedBuildings.length === 0) {
      toast({
        title: "Nenhum condomínio selecionado",
        description: "Selecione pelo menos um condomínio para fazer backup.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      const backupData: BackupData = {
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        buildings: {},
      };

      // Export data for each selected building
      for (const buildingId of selectedBuildings) {
        const building = buildings.find(b => b.id === buildingId);
        if (!building) continue;

        // Get building data from Firebase
        const participantsSnapshot = await get(ref(database, `buildings/${buildingId}/participants`));
        const spotsSnapshot = await get(ref(database, `buildings/${buildingId}/parkingSpots`));
        const sessionsSnapshot = await get(ref(database, `buildings/${buildingId}/lotterySessions`));

        backupData.buildings[buildingId] = {
          info: building,
          participants: participantsSnapshot.exists() ? Object.values(participantsSnapshot.val()) : [],
          parkingSpots: spotsSnapshot.exists() ? Object.values(spotsSnapshot.val()) : [],
          lotterySessions: sessionsSnapshot.exists() ? Object.values(sessionsSnapshot.val()) : [],
        };
      }

      // Create and download file
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-sorteio-vagas-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "✅ Backup criado com sucesso!",
        description: `Backup de ${selectedBuildings.length} condomínio(s) foi baixado.`,
      });
    } catch (error) {
      console.error('Error exporting backup:', error);
      toast({
        title: "Erro ao criar backup",
        description: "Ocorreu um erro ao exportar os dados.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const backupData: BackupData = JSON.parse(text);

      // Validate backup format
      if (!backupData.version || !backupData.buildings) {
        throw new Error('Formato de backup inválido');
      }

      let importedCount = 0;
      const errors: string[] = [];

      // Import each building
      for (const [buildingId, buildingData] of Object.entries(backupData.buildings)) {
        try {
          // Import building info
          await get(ref(database, `buildings/${buildingId}/info`)).then(async (snapshot) => {
            if (snapshot.exists()) {
              // Building exists, ask for confirmation
              if (!window.confirm(`O condomínio "${buildingData.info.name}" já existe. Deseja sobrescrever?`)) {
                return;
              }
            }

            // Import building data
            const { set } = await import('firebase/database');
            
            await set(ref(database, `buildings/${buildingId}/info`), buildingData.info);
            
            // Import participants
            const participantsObj = buildingData.participants.reduce((acc: any, p: any) => {
              acc[p.id] = p;
              return acc;
            }, {});
            await set(ref(database, `buildings/${buildingId}/participants`), participantsObj);

            // Import parking spots
            const spotsObj = buildingData.parkingSpots.reduce((acc: any, s: any) => {
              acc[s.id] = s;
              return acc;
            }, {});
            await set(ref(database, `buildings/${buildingId}/parkingSpots`), spotsObj);

            // Import lottery sessions
            const sessionsObj = buildingData.lotterySessions.reduce((acc: any, l: any) => {
              acc[l.id] = l;
              return acc;
            }, {});
            await set(ref(database, `buildings/${buildingId}/lotterySessions`), sessionsObj);

            importedCount++;
          });
        } catch (error: any) {
          console.error(`Error importing building ${buildingId}:`, error);
          errors.push(`${buildingData.info.name}: ${error.message}`);
        }
      }

      if (importedCount > 0) {
        toast({
          title: "✅ Backup importado com sucesso!",
          description: `${importedCount} condomínio(s) foram importados.`,
        });
        
        if (onImportComplete) {
          onImportComplete();
        }
      }

      if (errors.length > 0) {
        toast({
          title: "Alguns erros ocorreram",
          description: errors.join(', '),
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error importing backup:', error);
      toast({
        title: "Erro ao importar backup",
        description: error.message || "Arquivo de backup inválido ou corrompido.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      // Reset file input
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar Backup
          </CardTitle>
          <CardDescription>
            Selecione os Condomínios que Deseja Fazer Backup e Baixe um Arquivo com Todos os Dados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {buildings.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Nenhum condomínio cadastrado para fazer backup.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Selecionar Todos
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  Desmarcar Todos
                </Button>
              </div>

              <ScrollArea className="h-64 border rounded-lg p-4">
                <div className="space-y-3">
                  {buildings.map((building) => (
                    <div key={building.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`export-${building.id}`}
                        checked={selectedBuildings.includes(building.id)}
                        onCheckedChange={() => toggleBuilding(building.id)}
                      />
                      <Label
                        htmlFor={`export-${building.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <span className="font-medium">{building.name}</span>
                        {building.address && (
                          <span className="text-sm text-muted-foreground ml-2">
                            - {building.address}
                          </span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Button
                onClick={exportBackup}
                disabled={isExporting || selectedBuildings.length === 0}
                className="w-full gradient-primary text-white"
              >
                {isExporting ? (
                  <>
                    <Database className="mr-2 h-4 w-4 animate-pulse" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Baixar Backup ({selectedBuildings.length})
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Import Section */}
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Backup
          </CardTitle>
          <CardDescription>
            Restaure Dados de um Arquivo de Backup Anteriormente Exportado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Atenção:</strong> Se um condomínio com o mesmo ID já existir, você será
              perguntado se deseja sobrescrever os dados. Esta ação não pode ser desfeita.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 space-y-4">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">Selecione um arquivo de backup</p>
              <p className="text-xs text-muted-foreground">Formato: .json</p>
            </div>
            <Label htmlFor="backup-file" className="cursor-pointer">
              <Input
                id="backup-file"
                type="file"
                accept=".json"
                onChange={importBackup}
                disabled={isImporting}
                className="hidden"
              />
              <Button
                variant="outline"
                disabled={isImporting}
                asChild
              >
                <span>
                  {isImporting ? (
                    <>
                      <Database className="mr-2 h-4 w-4 animate-pulse" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Escolher Arquivo
                    </>
                  )}
                </span>
              </Button>
            </Label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BackupManager;
