import { Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { googleLoginUrl } from '@/features/auth/api/auth.api';
import { useLogin } from '@/features/auth/hooks/useLogin';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    await login.mutateAsync({ email, password });
    navigate('/inbox');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-accent/40 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm">
            <Sparkles className="h-4.5 w-4.5" />
          </span>
          <span className="font-semibold tracking-tight">AI Mail Assistant</span>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Access your AI-powered inbox</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <a href={googleLoginUrl()}>
              <Button type="button" variant="outline" className="w-full">
                Continue with Google
              </Button>
            </a>

            <div className="relative text-center text-xs text-muted-foreground">
              <span className="bg-card px-2">or</span>
            </div>

            <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)}>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {login.isError && (
                <p className="text-sm text-destructive">Invalid email or password.</p>
              )}
              <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              No account?{' '}
              <Link to="/register" className="underline underline-offset-4">
                Register
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
