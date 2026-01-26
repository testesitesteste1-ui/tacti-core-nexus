import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, Mail } from 'lucide-react';
import exeventosLogo from '@/assets/exeventos-logo.png';
import mageventosLogo from '@/assets/mageventos-logo.jpg';
import cityBackground from '@/assets/city-background.jpg';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (error) {
      // Error handled in AuthContext
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        backgroundImage: `url(${cityBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
      <Card className="w-full max-w-md shadow-elegant relative z-10">
        <CardHeader className="space-y-6 text-center">
          <div className="flex justify-center gap-8 items-center mb-4">
            <img 
              src={exeventosLogo} 
              alt="Ex Eventos" 
              className="h-20 w-auto object-contain"
            />
            <img 
              src={mageventosLogo} 
              alt="Mag Eventos" 
              className="h-16 w-auto object-contain"
            />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold text-foreground">
              Sistema de Sorteio de Vagas
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full gradient-primary text-white shadow-medium"
              size="lg"
              disabled={loading}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t text-center">
            <p className="text-xs text-muted-foreground">
              Acesso restrito a usuários autorizados
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
