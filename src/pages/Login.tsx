import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Target, Lock, Mail } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().trim().email({ message: "Email inválido" }),
  password: z.string().min(6, { message: "Senha deve ter no mínimo 6 caracteres" })
});

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    // Validate input
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: any = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0]] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (error) {
      // Error handling is done in AuthContext
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background tactical-grid flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-primary/30 p-8 scan-line">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Target className="w-16 h-16 text-primary glow-primary" />
          </div>
          <h1 className="text-3xl font-bold font-tactical text-foreground mb-2">
            TACTICAL OS
          </h1>
          <p className="text-muted-foreground text-sm uppercase tracking-wider">
            Sistema de Acesso Restrito
          </p>
          <div className="mt-4 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"></div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground uppercase text-xs tracking-wider flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className={`bg-muted border-border focus:border-primary ${errors.email ? 'border-destructive' : ''}`}
              disabled={loading}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground uppercase text-xs tracking-wider flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              Senha
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`bg-muted border-border focus:border-primary ${errors.password ? 'border-destructive' : ''}`}
              disabled={loading}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/80 text-primary-foreground font-bold uppercase tracking-wider h-12 text-base"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                Autenticando...
              </span>
            ) : (
              'Acessar Sistema'
            )}
          </Button>
        </form>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-border">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-success pulse-glow"></div>
            <span className="uppercase font-tactical">Sistema Seguro</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Login;
