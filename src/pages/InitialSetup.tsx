import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set, get } from 'firebase/database';
import { database } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import exeventosLogo from '@/assets/exeventos-logo.png';
import { DEFAULT_ADMIN_PERMISSIONS } from '@/types/auth';

export const InitialSetup = () => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const createAdminUser = async () => {
    setLoading(true);
    try {
      const adminUid = 'dfaUAPTL5kg7JG3RzLjL9iweV0S2';
      
      // Check if user already exists
      const userRef = ref(database, `users/${adminUid}`);
      const snapshot = await get(userRef);
      
      if (snapshot.exists()) {
        toast({
          title: "Usuário já existe",
          description: "O usuário administrador já foi configurado!",
        });
        setSuccess(true);
        setTimeout(() => navigate('/login'), 2000);
        return;
      }

      // Create admin user data
      const adminData = {
        email: "admin@exeventos.com",
        displayName: "Administrador",
        role: "admin",
        isActive: true,
        createdAt: new Date().toISOString(),
        buildingAccess: [],
        permissions: DEFAULT_ADMIN_PERMISSIONS,
      };

      // Save to database
      await set(userRef, adminData);

      toast({
        title: "✅ Usuário criado com sucesso!",
        description: "O administrador foi configurado no sistema.",
      });

      setSuccess(true);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);

    } catch (error) {
      console.error('Error creating admin user:', error);
      toast({
        title: "Erro ao criar usuário",
        description: "Ocorreu um erro ao configurar o administrador.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md shadow-elegant">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-2xl bg-white p-4 shadow-medium">
              <img 
                src={exeventosLogo} 
                alt="Ex Eventos" 
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          <div>
            <CardTitle className="text-3xl font-bold">
              <span className="font-ink-free text-red-600">Ex</span>{" "}
              <span className="font-cambria text-foreground">Eventos</span>
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Configuração Inicial do Sistema
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!success ? (
            <>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Clique no botão abaixo para criar o usuário administrador no banco de dados.
                </p>
                <div className="p-4 bg-muted rounded-lg text-left space-y-1">
                  <p className="text-xs font-medium text-foreground">Credenciais do Admin:</p>
                  <p className="text-xs text-muted-foreground">Email: admin@exeventos.com</p>
                  <p className="text-xs text-muted-foreground">Senha: (a que você criou no Firebase Auth)</p>
                  <p className="text-xs text-muted-foreground mt-2">UID: dfaUAPTL5kg7JG3RzLjL9iweV0S2</p>
                </div>
              </div>

              <Button
                onClick={createAdminUser}
                disabled={loading}
                className="w-full gradient-primary text-white shadow-medium"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Configurando...
                  </>
                ) : (
                  'Criar Usuário Administrador'
                )}
              </Button>
            </>
          ) : (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Configuração Concluída!</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Redirecionando para a página de login...
                </p>
              </div>
            </div>
          )}

          <div className="pt-4 border-t text-center">
            <p className="text-xs text-muted-foreground">
              Esta página só precisa ser executada uma vez
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InitialSetup;
