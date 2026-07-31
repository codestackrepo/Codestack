import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/shared/logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { useAuth } from '@/features/auth/context/auth-context';

/**
 * The chrome for /pending and /suspended.
 *
 * These pages deliberately sit OUTSIDE `AppShell`. AppShell mounts a Sidebar and
 * a Navbar whose dropdown links to /home/profile and /home/settings — both of
 * which ProtectedRoute would bounce straight back to /pending, giving the user a
 * nav where every item is a no-op.
 *
 * NotificationBell is safe here: `NotificationsController` is on the
 * `@AllowsUnassigned` allowlist and every handler is keyed on `actor.id`. It is
 * hidden on /suspended, where that endpoint 403s like everything else.
 */
export function MinimalTopBar({ showNotifications = true }: { showNotifications?: boolean }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-4 md:px-6">
      <Logo />
      <div className="flex items-center gap-1">
        <ThemeToggle />
        {showNotifications && <NotificationBell />}
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={async () => {
            await logout();
            toast.success('Signed out');
            navigate('/login', { replace: true });
          }}
        >
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>
    </header>
  );
}
