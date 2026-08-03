import { BrowserRouter } from 'react-router-dom';

import { useAuthBootstrap } from '@/features/auth/hooks/useAuthBootstrap';
import { AppRoutes } from '@/routes';

export default function App() {
  const { isLoading } = useAuthBootstrap();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
