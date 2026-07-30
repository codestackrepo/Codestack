import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AppModuleKey, Role, atLeast } from '@/types/common';
import { useAuth } from '@/features/auth/context/auth-context';
import { useModuleAccess } from '@/features/auth/hooks/use-module-access';
import { Logo } from '@/components/shared/logo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  LayoutDashboard,
  GraduationCap,
  FileCode2,
  ClipboardList,
  ClipboardCheck,
  Terminal,
  Layers,
  UserPlus,
  Users,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from 'lucide-react';

const COLLAPSE_KEY = 'codestack-sidebar-collapsed';
const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Administrator',
  professor: 'Professor',
  student: 'Student',
};

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Restrict to these roles. Omitted = visible to everyone. Admin always sees all. */
  roles?: Role[];
  /** Hide when this toggleable module is disabled for the user's role. Admin always sees all. */
  module?: AppModuleKey;
  /** Renders a muted "Soon" badge; the item still navigates (to a placeholder page). */
  comingSoon?: boolean;
  /** Exact-match active state (NavLink `end`) — for parent paths like /home/admin. */
  end?: boolean;
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
      { to: '/home/problems', label: 'Problems', icon: FileCode2, module: AppModuleKey.PROBLEMS },
      {
        to: '/home/topics',
        label: 'Topics',
        icon: Layers,
        module: AppModuleKey.TOPICS,
        comingSoon: true,
      },
      // Visible to everyone: the backend scopes students to their enrolled,
      // student-visible assignments, so this is how students reach the solve editor.
      {
        to: '/home/assignments',
        label: 'Assignments',
        icon: ClipboardList,
        module: AppModuleKey.ASSIGNMENTS,
      },
      { to: '/home/playground', label: 'Playground', icon: Terminal, module: AppModuleKey.PLAYGROUND },
    ],
  },
  {
    heading: 'Classroom',
    items: [
      {
        to: '/home/classrooms',
        label: 'Classrooms',
        icon: GraduationCap,
        module: AppModuleKey.CLASSROOMS,
      },
      {
        to: '/home/grading',
        label: 'Gradebook',
        icon: ClipboardCheck,
        roles: [Role.ADMIN, Role.PROFESSOR],
        module: AppModuleKey.GRADING,
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
      { to: '/home/admin', label: 'Overview', icon: LayoutDashboard, roles: [Role.ADMIN], end: true },
      { to: '/home/admin/users', label: 'Users', icon: Users, roles: [Role.ADMIN] },
      { to: '/home/admin/requests', label: 'Access requests', icon: Inbox, roles: [Role.ADMIN] },
    ],
  },
];

interface SidebarProps {
  className?: string;
  /** Called when a nav link is chosen — used to close the mobile drawer. */
  onNavigate?: () => void;
  /** Desktop rail can collapse to icons; the mobile drawer passes false. */
  allowCollapse?: boolean;
}

export function Sidebar({ className, onNavigate, allowCollapse = true }: SidebarProps) {
  const { user, logout } = useAuth();
  const { canAccess } = useModuleAccess();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  });

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage failures
      }
      return next;
    });
  };

  const canSee = (item: NavItem) =>
    (!item.roles || !user || item.roles.some((r) => atLeast(user.role, r))) &&
    (!item.module || canAccess(item.module));

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(canSee),
  })).filter((section) => section.items.length > 0);

  // Collapse only applies to the desktop rail; the mobile drawer is always full.
  const isCollapsed = allowCollapse && collapsed;
  const initials =
    `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || 'U';

  return (
    <aside
      className={cn(
        'sidebar-surface relative flex h-svh shrink-0 flex-col rounded-r-2xl text-sidebar-foreground shadow-[6px_0_28px_-16px_rgba(0,0,0,0.5)] transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        isCollapsed ? 'w-[4.75rem]' : 'w-64',
        className,
      )}
    >
      {/* Header: logo (→ home) + collapse toggle. When collapsed they stack so
          the toggle is always visible inside the rail (never clipped). */}
      {isCollapsed ? (
        <div className="flex shrink-0 flex-col items-center gap-2 px-2 pt-4 pb-2">
          <Link to="/home" title="CodeStack home" onClick={onNavigate}>
            <Logo variant="mark" className="size-9" />
          </Link>
          {allowCollapse && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              title="Expand"
              className="grid size-8 place-items-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-3.5">
          <Link to="/home" title="CodeStack home" onClick={onNavigate}>
            <Logo wordmarkClassName="text-white" accentClassName="text-[hsl(248_62%_82%)]" />
          </Link>
          {allowCollapse && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              title="Collapse"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="custom-scrollbar flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-3 py-3">
        {sections.map((section, i) => (
          <div key={section.heading ?? `section-${i}`} className="space-y-1">
            {section.heading && !isCollapsed && (
              <p className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-wider text-sidebar-foreground/55 uppercase">
                {section.heading}
              </p>
            )}
            {section.heading && isCollapsed && <div className="mx-3 border-t border-white/10" />}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    isCollapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-white text-sidebar shadow-soft'
                      : 'text-sidebar-foreground/75 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <item.icon
                  className={cn(
                    'size-[1.15rem] shrink-0 transition-transform duration-200 group-hover:scale-110',
                  )}
                />
                {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!isCollapsed && item.comingSoon && (
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wide text-sidebar-foreground/60 uppercase">
                    Soon
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer: user card + sign out */}
      <div className="shrink-0 border-t border-white/10 p-3">
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Avatar className="size-9 ring-2 ring-white/15">
              <AvatarFallback className="bg-white/15 text-xs font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Sign out"
              title="Sign out"
              className="grid size-8 place-items-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        ) : (
          <div className="rounded-xl bg-white/5 p-2.5">
            <div className="flex items-center gap-2.5">
              <Avatar className="size-9 ring-2 ring-white/15">
                <AvatarFallback className="bg-white/15 text-xs font-semibold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold text-white">
                  {user ? `${user.firstName} ${user.lastName}` : 'Guest'}
                </p>
                <p className="truncate text-xs text-sidebar-foreground/60">
                  {user ? (ROLE_LABEL[user.role] ?? user.role) : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                aria-label="Sign out"
                title="Sign out"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
