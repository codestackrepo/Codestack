import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Role } from '@/types/common';
import { useAuth } from '@/features/auth/context/auth-context';
import { Logo } from '@/components/shared/logo';
import {
  LayoutDashboard,
  GraduationCap,
  FileCode2,
  ClipboardList,
  ClipboardCheck,
  Terminal,
  Sparkles,
  CreditCard,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/home/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/home/classrooms', label: 'Classrooms', icon: GraduationCap },
  { to: '/home/problems', label: 'Problems', icon: FileCode2 },
  // Visible to everyone: the backend scopes students to their enrolled,
  // student-visible assignments, so this is how students reach the solve editor.
  { to: '/home/assignments', label: 'Assignments', icon: ClipboardList },
  {
    to: '/home/grading',
    label: 'Gradebook',
    icon: ClipboardCheck,
    roles: [Role.ADMIN, Role.PROFESSOR],
  },
  { to: '/home/playground', label: 'Playground', icon: Terminal },
  { to: '/home/ai', label: 'AI Generate', icon: Sparkles },
  { to: '/home/billing', label: 'Billing', icon: CreditCard },
];

interface SidebarProps {
  className?: string;
  /** Called when a nav link is chosen — used to close the mobile drawer. */
  onNavigate?: () => void;
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const { user } = useAuth();

  const items = NAV_ITEMS.filter(
    (item) => !item.roles || !user || user.role === Role.ADMIN || item.roles.includes(user.role),
  );

  return (
    <aside
      className={cn(
        'flex h-svh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground',
        className,
      )}
    >
      <div className="flex h-16 shrink-0 items-center px-5">
        <Logo />
      </div>
      <nav className="custom-scrollbar flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute top-1/2 left-0 h-5 -translate-y-1/2 rounded-r-full bg-sidebar-primary transition-all',
                    isActive ? 'w-1' : 'w-0',
                  )}
                />
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="shrink-0 border-t border-sidebar-border/60 px-5 py-3 text-xs text-sidebar-foreground/45">
        CodeStack · v0.1
      </div>
    </aside>
  );
}
