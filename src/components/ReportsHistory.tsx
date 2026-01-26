import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Calendar, Users, Trophy, Eye, Trash2, Edit, Save, X, FileSpreadsheet, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAppContext } from "@/context/AppContext";
import { exportDataAsJSON, generateLotteryPDF, exportToExcel } from "@/utils/pdfGenerator";
import { useToast } from "@/hooks/use-toast";
import { LotterySession, LotteryResult } from "@/types/lottery";

export const ReportsHistory = () => {
  const { lotterySessions, participants, parkingSpots, buildings, selectedBuilding, deleteLotterySession, updateLotterySession, republishLotterySession } = useAppContext();
  const { toast } = useToast();
  const [selectedSession, setSelectedSession] = useState<LotterySession | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedResults, setEditedResults] = useState<LotteryResult[]>([]);

  // Filter by selected building - use useMemo to ensure it updates when lotterySessions changes
  const buildingSessions = useMemo(() =>
    lotterySessions
      .filter((s) => s.buildingId === selectedBuilding?.id)
      .sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date);
        const dateB = b.date instanceof Date ? b.date : new Date(b.date);
        return dateB.getTime() - dateA.getTime(); // Mais recentes primeiro
      }),
    [lotterySessions, selectedBuilding?.id]
  );

  const buildingParticipants = useMemo(() =>
    participants.filter((p) => p.buildingId === selectedBuilding?.id),
    [participants, selectedBuilding?.id]
  );

  const buildingSpots = useMemo(() =>
    parkingSpots.filter((s) => s.buildingId === selectedBuilding?.id),
    [parkingSpots, selectedBuilding?.id]
  );

  const generatePDFReport = (session: LotterySession, orderBy: 'participant' | 'spot' = 'participant') => {
    if (session && session.results.length > 0) {
      const sessionParticipants = participants.filter((p) => session.participants.includes(p.id));
      const sessionSpots = parkingSpots.filter((s) => session.availableSpots.includes(s.id));
      generateLotteryPDF(
        session.name,
        session.results,
        sessionParticipants,
        sessionSpots,
        selectedBuilding?.company || 'exvagas',
        selectedBuilding?.name,
        orderBy
      );
      toast({
        title: "Relatório gerado",
        description: `O arquivo PDF foi aberto (ordenado por ${orderBy === 'spot' ? 'Vaga' : 'Participante'}).`,
      });
    }
  };

  const generateExcelReport = async (session: LotterySession) => {
    if (session && session.results.length > 0) {
      const sessionParticipants = participants.filter((p) => session.participants.includes(p.id));
      const sessionSpots = parkingSpots.filter((s) => session.availableSpots.includes(s.id));
      
      try {
        await exportToExcel(
          session.name,
          session.results,
          sessionParticipants,
          sessionSpots,
          selectedBuilding?.name
        );
        toast({
          title: "Excel gerado",
          description: "O arquivo Excel foi baixado com sucesso.",
        });
      } catch (error) {
        console.error('Erro ao gerar Excel:', error);
        toast({
          title: "Erro ao gerar Excel",
          description: "Ocorreu um erro ao gerar o arquivo Excel.",
          variant: "destructive",
        });
      }
    }
  };

  const handleViewDetails = (session: LotterySession) => {
    setSelectedSession(session);
    setEditedResults([...session.results]);
    setIsEditMode(false);
    setShowDetailsDialog(true);
  };

  const handleEditMode = () => {
    setIsEditMode(true);
    setEditedResults([...selectedSession!.results]);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditedResults([...selectedSession!.results]);
  };

  const handleSaveEdit = async () => {
    if (!selectedSession) {
      console.error('❌ Nenhuma sessão selecionada');
      return;
    }

    // 🔥 VALIDAR ANTES DE TUDO
    if (!selectedSession.buildingId) {
      toast({
        title: "❌ Erro",
        description: "Building ID não encontrado na sessão.",
        variant: "destructive",
      });
      return;
    }

    console.log('💾 Iniciando salvamento das edições...', {
      sessionId: selectedSession.id,
      buildingId: selectedSession.buildingId, // 🔥 DA SESSÃO, NÃO DO CONTEXTO
      originalResults: selectedSession.results.length,
      editedResults: editedResults.length
    });

    const updatedSession = {
      ...selectedSession,
      results: editedResults,
      lastModified: new Date().toISOString()
    };

    // 1. Atualizar no contexto
    console.log('📝 Atualizando sessão no contexto...');
    updateLotterySession(updatedSession);

    // 2. Aguardar salvamento no Firebase
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. Republicar resultados públicos
    try {
      // 🔥 BUSCAR O BUILDING COMPLETO PELA SESSION
      const sessionBuilding = buildings.find(b => b.id === selectedSession.buildingId);

      if (!sessionBuilding) {
        throw new Error(`Building ${selectedSession.buildingId} não encontrado`);
      }

      console.log('📤 Iniciando republicação...', {
        buildingId: sessionBuilding.id, // 🔥 GARANTIDO QUE EXISTE
        buildingName: sessionBuilding.name,
        participantsCount: participants.length,
        parkingSpotsCount: parkingSpots.length,
        company: sessionBuilding.company
      });

      // Importar a função diretamente
      const { savePublicResults } = await import('@/utils/publicResults');

      const result = await savePublicResults(
        updatedSession,
        sessionBuilding.name, // 🔥 DA SESSION BUILDING
        participants,
        parkingSpots,
        sessionBuilding.company // 🔥 DA SESSION BUILDING
      );

      console.log('📊 Resultado da republicação:', result);

      if (result && result.success) {
        toast({
          title: "✅ Alterações salvas e publicadas",
          description: `Publicado em: public/results/${sessionBuilding.id}`,
        });

        console.log('✅ Publicação concluída com sucesso!');
      } else {
        console.error('❌ Falha na publicação:', result);
        toast({
          title: "⚠️ Alterações salvas localmente",
          description: "Erro ao publicar: " + (result?.error || "Erro desconhecido"),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Erro ao republicar:', error);
      toast({
        title: "⚠️ Erro ao publicar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }

    setSelectedSession(updatedSession);
    setIsEditMode(false);
  };

  const handleSpotChange = (resultId: string, newSpotId: string) => {
    console.log('🔄 Changing spot:', { resultId, newSpotId });
    const newResults = editedResults.map(result => {
      if (result.id === resultId) {
        return {
          ...result,
          parkingSpotId: newSpotId
        };
      }
      return result;
    });
    console.log('✅ Updated results:', newResults);
    setEditedResults(newResults);
  };

  const getParticipantName = (id: string) => {
    return participants.find((p) => p.id === id)?.name || "Participante não encontrado";
  };

  const getSpotInfo = (id: string) => {
    return parkingSpots.find((s) => s.id === id);
  };

  const handleExportData = () => {
    const exportData = {
      participants: buildingParticipants,
      parkingSpots: buildingSpots,
      lotterySessions: buildingSessions,
      exportDate: new Date().toISOString(),
    };

    exportDataAsJSON(exportData, `sistema-sorteio-${new Date().toISOString().split("T")[0]}`);
    toast({
      title: "Dados exportados",
      description: "Os dados foram exportados em formato JSON.",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-success text-success-foreground">Concluído</Badge>;
      case "pending":
        return <Badge className="bg-warning text-warning-foreground">Pendente</Badge>;
      case "running":
        return <Badge className="bg-accent text-accent-foreground">Em Andamento</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleDeleteSession = (sessionId: string) => {
    console.log('🗑️ Deleting session from UI:', sessionId);
    deleteLotterySession(sessionId);
    setSessionToDelete(null);

    // Se o diálogo de detalhes está aberto para esta sessão, fechá-lo
    if (selectedSession?.id === sessionId) {
      setShowDetailsDialog(false);
      setSelectedSession(null);
    }

    toast({
      title: "Sorteio removido",
      description: "O sorteio foi removido do histórico com sucesso.",
    });
  };

  // Pegar vagas disponíveis para o select (apenas as vagas que estavam no sorteio original)
  const getAvailableSpotsForEdit = () => {
    if (!selectedSession) return [];
    return parkingSpots.filter((s) => selectedSession.availableSpots.includes(s.id));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-success rounded-lg flex items-center justify-center">
            <FileText className="h-6 w-6 text-success-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Histórico e Relatório</h1>
            <p className="text-muted-foreground">Consulte Relatórios e Histórico de Sorteios Realizados</p>
          </div>
        </div>

        <Button className="gradient-primary text-white shadow-medium" onClick={handleExportData}>
          <Download className="mr-2 h-4 w-4" />
          Exportar Dados
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Sorteios</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{buildingSessions.length}</div>
            <p className="text-xs text-muted-foreground">
              {buildingSessions.filter((s) => s.status === "completed").length} concluídos
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Participantes Únicos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {new Set(buildingSessions.flatMap((s) => s.participants)).size}
            </div>
            <p className="text-xs text-muted-foreground">Desde o primeiro sorteio</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vagas Sorteadas</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {buildingSessions.reduce((acc, session) => acc + session.results.length, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total histórico</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Último Sorteio</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {buildingSessions.length > 0
                ? new Date(Math.max(...buildingSessions.map((s) => {
                  const date = s.date instanceof Date ? s.date : new Date(s.date);
                  return date.getTime();
                }))).toLocaleDateString("pt-BR")
                : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Data do último sorteio</p>
          </CardContent>
        </Card>
      </div>

      {/* Sessions History */}
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Histórico dos Sorteios</CardTitle>
          <CardDescription>Lista Completa de Todos os Sorteios Realizados</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <ScrollArea className="h-[500px]">
            <div className="min-w-[800px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome da Sessão</TableHead>
                    <TableHead>Participantes</TableHead>
                    <TableHead>Vagas Disponíveis</TableHead>
                    <TableHead>Resultados</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buildingSessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <div className="font-medium">{session.name}</div>
                        <div className="text-sm text-muted-foreground hidden sm:block">ID: {session.id}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{session.participants.length}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{session.availableSpots.length}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{session.results.length}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(session.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-1 sm:space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => handleViewDetails(session)} title="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {session.status === "completed" && (
                            <>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" title="Gerar PDF">
                                    <Download className="h-4 w-4" />
                                    <ChevronDown className="h-3 w-3 ml-1" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-background">
                                  <DropdownMenuItem onClick={() => generatePDFReport(session, 'participant')}>
                                    PDF por Participante
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => generatePDFReport(session, 'spot')}>
                                    PDF por Vaga
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button variant="ghost" size="sm" onClick={() => generateExcelReport(session)} title="Exportar Excel">
                                <FileSpreadsheet className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSessionToDelete(session.id)}
                            title="Remover sorteio"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Detalhes do Sorteio</span>
              {!isEditMode && (
                <Button variant="outline" size="sm" onClick={handleEditMode}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar Resultados
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedSession?.name} -{" "}
              {selectedSession?.date
                ? (selectedSession.date instanceof Date ? selectedSession.date : new Date(selectedSession.date)).toLocaleDateString("pt-BR")
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedSession && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{selectedSession.participants.length}</div>
                      <div className="text-sm text-muted-foreground">Participantes</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{selectedSession.availableSpots.length}</div>
                      <div className="text-sm text-muted-foreground">Vagas Disponíveis</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{isEditMode ? editedResults.length : selectedSession.results.length}</div>
                      <div className="text-sm text-muted-foreground">Sorteadas</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Results */}
              <Card>
                <CardHeader>
                  <CardTitle>
                    {isEditMode ? "Editar Resultados do Sorteio" : "Resultados do Sorteio"}
                  </CardTitle>
                  {isEditMode && (
                    <CardDescription className="text-amber-600">
                      Selecione as vagas para alterar as alocações. As alterações serão salvas permanentemente.
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[500px]">
                    <div className="min-w-[600px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16 text-center">#</TableHead>
                            <TableHead>Bloco - Unidade</TableHead>
                            <TableHead>Vaga</TableHead>
                            <TableHead>Localização</TableHead>
                            <TableHead>Tipo da Vaga</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            const resultsToShow = isEditMode ? editedResults : selectedSession.results;
                            // Ordenar resultados por bloco/unidade
                            const sortedResults = [...resultsToShow].sort((a, b) => {
                              const participantA = participants.find(p => p.id === a.participantId);
                              const participantB = participants.find(p => p.id === b.participantId);

                              const blockA = participantA?.block || '';
                              const blockB = participantB?.block || '';
                              if (blockA !== blockB) {
                                return blockA.localeCompare(blockB, 'pt-BR', { numeric: true });
                              }

                              const unitA = participantA?.unit || '';
                              const unitB = participantB?.unit || '';
                              return unitA.localeCompare(unitB, 'pt-BR', { numeric: true });
                            });

                            return sortedResults.map((result, index) => {
                              const spot = getSpotInfo(result.parkingSpotId);
                              const participant = participants.find(p => p.id === result.participantId);
                              const spotTypesRaw = spot?.type ? (Array.isArray(spot.type) ? spot.type.join(', ') : spot.type) : 'N/A';
                              const coverage = spot?.isCovered ? 'Coberta' : (spot?.isUncovered ? 'Descoberta' : '');
                              const spotTypes = [spotTypesRaw, coverage].filter(Boolean).join(', ');

                              return (
                                <TableRow key={result.id}>
                                  <TableCell className="text-center font-bold text-primary">
                                    {index + 1}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">
                                        Bloco {participant?.block} - Unidade {participant?.unit}
                                      </span>
                                      {result.priority === 'special-needs' && (
                                        <Badge variant="destructive" className="text-xs">PcD</Badge>
                                      )}
                                      {result.priority === 'elderly' && (
                                        <Badge className="bg-orange-500 text-white text-xs">Idoso</Badge>
                                      )}
                                      {participant?.hasLargeCar && (
                                        <Badge className="bg-green-500 text-white text-xs">Veículo Grande</Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-bold">
                                    {isEditMode ? (
                                      <Select
                                        value={result.parkingSpotId}
                                        onValueChange={(value) => handleSpotChange(result.id, value)}
                                      >
                                        <SelectTrigger className="w-[140px]">
                                          <SelectValue>
                                            {spot ? `#${spot.number}` : 'Selecione'}
                                          </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                          {getAvailableSpotsForEdit().map((availableSpot) => (
                                            <SelectItem key={availableSpot.id} value={availableSpot.id}>
                                              #{availableSpot.number}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      `#${spot?.number || 'N/A'}`
                                    )}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {spot?.floor || 'N/A'}
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm">{spotTypes}</span>
                                  </TableCell>
                                </TableRow>
                              );
                            });
                          })()}
                        </TableBody>
                      </Table>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex justify-end space-x-2">
                {isEditMode ? (
                  <>
                    <Button variant="outline" onClick={handleCancelEdit}>
                      <X className="mr-2 h-4 w-4" />
                      Cancelar
                    </Button>
                    <Button onClick={handleSaveEdit} className="bg-green-600 hover:bg-green-700 text-white">
                      <Save className="mr-2 h-4 w-4" />
                      Salvar Alterações
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                      Fechar
                    </Button>
                    <Button
                      onClick={() => {
                        generatePDFReport(selectedSession);
                        setShowDetailsDialog(false);
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Gerar PDF
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!sessionToDelete} onOpenChange={() => setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover sorteio do histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O sorteio será permanentemente removido do histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => sessionToDelete && handleDeleteSession(sessionToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};