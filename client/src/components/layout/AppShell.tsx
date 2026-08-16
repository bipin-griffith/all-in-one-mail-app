import { AlertCircle, Inbox, LayoutDashboard, LogOut, MessageCircle, RefreshCcw, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useLogout } from '@/features/auth/hooks/useLogout';
import type { EmailAccount } from '@/features/email/api/email.api';
import { useEmailAccounts, useSyncEmailAccount } from '@/features/email/hooks/useEmailAccounts';
import { avatarColorFor, initialsFor } from '@/lib/avatar';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

const NAV_ITEMS = [
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/chat', label: 'Ask your inbox', icon: MessageCircle },
] as const;

/**
 * Mirrors the server's SYNC_LOCK_STALE_MS (email.service.ts): a 'syncing'
 * account whose worker died mid-job (crash, restart) without ever flipping
 * status back would otherwise disable this button forever, since the raw
 * status alone can't distinguish "genuinely in flight" from "orphaned
 * lock." The backend already accepts a retry past this threshold — the
 * button needs to agree, or a stuck account becomes unrecoverable from the
 * UI even though the API would happily take the request.
 */
const SYNC_LOCK_STALE_MS = 10 * 60 * 1000;

function isActivelySyncing(account: EmailAccount): boolean {
  if (account.syncStatus !== 'syncing') return false;
  if (!account.syncStartedAt) return true;
  return Date.now() - new Date(account.syncStartedAt).getTime() <= SYNC_LOCK_STALE_MS;
}

export function AppShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();
  const { data: accounts } = useEmailAccounts();
  const sync = useSyncEmailAccount();
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r bg-card p-4">
        <div className="mb-8 flex items-center gap-2.5 px-1 font-semibold">
          <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-[15px] tracking-tight">AI Mail Assistant</span>
        </div>

        <nav className="flex-1 space-y-1 text-sm">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                  active && 'bg-accent font-medium text-accent-foreground',
                )}
              >
                {active && (
                  <span className="brand-gradient absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full" />
                )}
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t pt-3 text-sm">
          {accounts?.map((account) => {
            const syncing = isActivelySyncing(account);
            return (
              <div
                key={account._id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      account.syncStatus === 'error'
                        ? 'bg-destructive'
                        : syncing
                          ? 'animate-pulse bg-amber-500'
                          : 'bg-emerald-500',
                    )}
                    title={`Sync status: ${account.syncStatus}`}
                  />
                  <span className="truncate text-xs text-muted-foreground">{account.emailAddress}</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => sync.mutate(account._id)}
                  disabled={sync.isPending || syncing}
                  title={account.syncStatus === 'error' ? 'Last sync failed — retry' : 'Sync now'}
                >
                  {account.syncStatus === 'error' ? (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <RefreshCcw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
                  )}
                </Button>
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white',
                  avatarColorFor(user?.email ?? user?.name ?? ''),
                )}
              >
                {initialsFor(user?.name ?? user?.email ?? '?')}
              </span>
              <span className="truncate text-sm">{user?.name}</span>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => logout.mutate()} title="Log out">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
