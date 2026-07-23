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
  Layers,
  UserPlus,
  Inbox,
  Mail,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Restrict to these roles. Omitted = visible to everyone. Admin always sees all. */
  roles?: Role[];
  /** Renders a muted "Soon" badge; the item still navigates (to a placeholder page). */
  comingSoon?: boolean;
}

interface NavSection {
  /** Section heading; omit for the top (primary) group. */
  heading?: string;
  items: NavItem[];
}

// Grouped into role-oriented sections. Per-item `roles` still governs visibility,
// so a section renders only if at least one of its items is visible to the user.
const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ to: '/home/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    heading: 'Learn',
    items: [
      { to: '/home/problems', label: 'Problems', icon: FileCode2 },
      { to: '/home/topics', label: 'Topics', icon: Layers, comingSoon: true },
      // Visible to everyone: the backend scopes students to their enrolled,
      // student-visible assignments, so this is how students reach the solve editor.
      { to: '/home/assignments', label: 'Assignments', icon: ClipboardList },
      { to: '/home/playground', label: 'Playground', icon: Terminal },
    ],
  },
  {
    heading: 'Classroom',
    items: [
      { to: '/home/classrooms', label: 'Classrooms', icon: GraduationCap },
      {
        to: '/home/grading',
        label: 'Gradebook',
        icon: ClipboardCheck,
        roles: [Role.ADMIN, Role.PROFESSOR],
      },
      // Students can ask to become a professor; staff never see this.
      {
        to: '/home/request-access',
        label: 'Become a professor',
        icon: UserPlus,
        roles: [Role.STUDENT],
      },
    ],
  },
  {
    heading: 'Admin',
    items: [
      { to: '/home/admin/requests', label: 'Access requests', icon: Inbox, roles: [Role.ADMIN] },
      { to: '/home/admin/invites', label: 'Invites', icon: Mail, roles: [Role.ADMIN] },
    ],
  },
];

interface SidebarProps {
  className?: string;
  /** Called when a nav link is chosen — used to close the mobile drawer. */
  onNavigate?: () => void;
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const { user } = useAuth();

  const canSee = (item: NavItem) =>
    !item.roles || !user || user.role === Role.ADMIN || item.roles.includes(user.role);

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(canSee),
  })).filter((section) => section.items.length > 0);

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
      <nav className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {sections.map((section, i) => (
          <div key={section.heading ?? `section-${i}`} className="space-y-0.5">
            {section.heading && (
              <p className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-wider text-sidebar-foreground/40 uppercase">
                {section.heading}
              </p>
            )}
            {section.items.map((item) => (
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
                    <span className="flex-1">{item.label}</span>
                    {item.comingSoon && (
                      <span className="rounded-full bg-sidebar-foreground/10 px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wide text-sidebar-foreground/50 uppercase">
                        Soon
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-sidebar-border/60 px-5 py-3 text-xs text-sidebar-foreground/45">
        CodeStack · v0.1
      </div>
    </aside>
  );
}
