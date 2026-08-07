import { Inbox, LayoutDashboard, LogOut, MessageCircle, RefreshCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useLogout } from '@/features/auth/hooks/useLogout';
import { useEmailAccounts, useSyncEmailAccount } from '@/features/email/hooks/useEmailAccounts';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

const NAV_ITEMS = [
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/chat', label: 'Ask your inbox', icon: MessageCircle },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();
  const { data: accounts } = useEmailAccounts();
  const sync = useSyncEmailAccount();
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r bg-card p-4">
        <div className="mb-6 flex items-center gap-2 font-semibold">
          <Inbox className="h-5 w-5" />
          AI Mail Assistant
        </div>

        <nav className="flex-1 space-y-1 text-sm">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 hover:bg-accent',
                location.pathname.startsWith(to) && 'bg-accent font-medium',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="space-y-2 border-t pt-4 text-sm">
          {accounts?.map((account) => (
            <div key={account._id} className="flex items-center justify-between gap-2">
              <span className="truncate text-muted-foreground">{account.emailAddress}</span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => sync.mutate(account._id)}
                disabled={sync.isPending || account.syncStatus === 'syncing'}
                title="Sync now"
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="flex items-center justify-between pt-2">
            <span className="truncate">{user?.name}</span>
            <Button size="icon" variant="ghost" onClick={() => logout.mutate()} title="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
