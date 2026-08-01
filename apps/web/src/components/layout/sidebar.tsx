import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AppModuleKey, Role, atLeast } from '@/types/common';
import { OrganizationType } from '@/types/organization';
import { useAuth } from '@/features/auth/context/auth-context';
import { useModuleAccess } from '@/features/auth/hooks/use-module-access';
import { Logo } from '@/components/shared/logo';
import { OrgLockup } from '@/components/shared/org-lockup';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileCode2,
  Globe,
  GraduationCap,
  Inbox,
  Layers,
  LayoutDashboard,
  LogOut,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Terminal,
  Upload,
  UserPlus,
  UserCheck,
  Users,
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
  /** Restrict to these roles. Omitted = visible to everyone. Rank-aware. */
  roles?: Role[];
  /**
   * Hide from these roles outright, overriding rank.
   *
   * `roles` is rank-aware, so `[PROFESSOR]` also matches a SUPERADMIN — and the
   * org console is meaningless for them (`scopeToOrg` no-ops, and their
   * `organization` is null). This is the sidebar half of `RequireRole`'s
   * `exclude`; the route gate is the half that actually enforces it.
   */
  excludeRoles?: Role[];
  /**
   * Hide for members of the open community tenant (#118).
   *
   * That tenant's members are mutually anonymous strangers, so the org-staff read
   * surfaces are refused server-side with `community_restricted`. Without this flag
   * the nav would advertise sections that 403 on click — which reads as the app being
   * broken rather than as a surface that does not apply to them.
   *
   * Separate from `roles` because it is not about rank: an open PROFESSOR outranks a
   * student and still must not see a member directory.
   */
  orgOnly?: boolean;
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
    items: [
      { to: '/home/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      {
        /*
         * Plan + usage. Top-level rather than under Organization, because it applies
         * to an individual on the open platform just as much as to an institution —
         * nesting it under a heading that says "Organization" would read as staff-only
         * to exactly the audience that can actually self-serve an upgrade.
         *
         * Not `orgOnly` for the same reason. Excluded for SUPERADMIN alone: they are
         * charged to no tenant, so `quotas` is null and there is nothing to meter.
         */
        to: '/home/subscription',
        label: 'Subscription',
        icon: Sparkles,
        excludeRoles: [Role.SUPERADMIN],
      },
    ],
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
      },
      {
        // #77. Staff-only: the inbox is the professor's queue of students waiting.
        // `@Roles(PROFESSOR)` on the server is minimum-rank, so admin+ also pass.
        to: '/home/doubts',
        label: 'Doubts & feedback',
        icon: Inbox,
        roles: [Role.PROFESSOR, Role.ADMIN, Role.SUPERADMIN],
      },
      // Visible to everyone: the backend scopes students to their enrolled,
      // student-visible assignments, so this is how students reach the solve editor.
      {
        to: '/home/assignments',
        label: 'Assignments',
        icon: ClipboardList,
        module: AppModuleKey.ASSIGNMENTS,
      },
      {
        to: '/home/playground',
        label: 'Playground',
        icon: Terminal,
        module: AppModuleKey.PLAYGROUND,
      },
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
        // Excluded explicitly for the same reason the Organization section is: this
        // list is org-scoped, a SuperAdmin's org is null, so `scopeToOrg` renders it
        // permanently empty. The adjacent Doubts item names SUPERADMIN outright, so
        // leaving it out here was intent — but `roles` is minimum-rank, and rank let
        // them back in regardless.
        to: '/home/grading',
        label: 'Gradebook',
        icon: ClipboardCheck,
        roles: [Role.ADMIN, Role.PROFESSOR],
        excludeRoles: [Role.SUPERADMIN],
        module: AppModuleKey.GRADING,
      },
      /*
       * Students can ask to become a professor; staff never see this.
       *
       * `roles: [STUDENT]` ALONE DOES NOT SAY THAT. `roles` is minimum-rank
       * (`atLeast`), and student is the lowest rank, so on its own it matches every
       * role — which is why an admin was being offered "Become a professor". The
       * exclusion is what actually narrows it to exactly one role.
       *
       * This is the one item in the nav whose intent is an EXACT role rather than a
       * floor, so it is the one place the rank default is wrong by construction.
       */
      {
        to: '/home/request-access',
        label: 'Become a professor',
        icon: UserPlus,
        roles: [Role.STUDENT],
        excludeRoles: [Role.PROFESSOR, Role.ADMIN, Role.SUPERADMIN],
      },
    ],
  },
  {
    // Renamed from "Admin": half of it is now a professor's job too, so naming it
    // after the tenant rather than after one role stops reading as a lie.
    heading: 'Organization',
    // EVERY item here is `orgOnly` (#118): the whole section is about administering a
    // tenant, and the open community tenant is not a tenant anyone administers. The
    // server already refuses these surfaces there, so showing them would only produce
    // a section where every link 403s.
    items: [
      {
        to: '/home/admin',
        label: 'Overview',
        icon: LayoutDashboard,
        roles: [Role.ADMIN],
        excludeRoles: [Role.SUPERADMIN],
        orgOnly: true,
        end: true,
      },
      // People / Invites / Bulk / Unassigned are PROFESSOR-and-up (rank-aware, so
      // an admin inherits them) — the write boundary stays server-side.
      {
        to: '/home/admin/users',
        label: 'People',
        icon: Users,
        roles: [Role.PROFESSOR],
        excludeRoles: [Role.SUPERADMIN],
        orgOnly: true,
      },
      {
        to: '/home/admin/invites',
        label: 'Invites',
        icon: Mail,
        roles: [Role.PROFESSOR],
        excludeRoles: [Role.SUPERADMIN],
        orgOnly: true,
      },
      {
        to: '/home/admin/bulk-invite',
        label: 'Bulk import',
        icon: Upload,
        roles: [Role.PROFESSOR],
        excludeRoles: [Role.SUPERADMIN],
        orgOnly: true,
      },
      /*
       * "Unassigned students" is deliberately ABSENT from the org console (#118).
       *
       * The pool is `organization_id IS NULL AND role = 'student'`, but open
       * self-signups are created inside the COMMUNITY TENANT, which is a non-null
       * org. Nothing in the current onboarding flow produces an org-less student, so
       * for an org admin this pool is structurally empty — a permanent "no results"
       * page advertised in the nav.
       *
       * It is also the wrong shape for a closed tenant even when non-empty: those
       * users are strangers to the institution, and a university's roster is built
       * from its own invites, not by claiming people out of a shared pool.
       *
       * The PLATFORM section keeps its own copy, which is where the surface belongs —
       * a superadmin is the one who resolves genuinely org-less accounts. The org
       * route still exists and is still guarded; only the signpost is gone.
       */
      {
        // The org ADMIN's review queue for members already inside the tenant asking to
        // be promoted. Distinct from invites, which address an EMAIL and answer
        // `already_member` with no role change for someone who is already here — so
        // this is the only in-tenant promotion path, and it belongs in this section.
        to: '/home/admin/requests',
        label: 'Access requests',
        icon: Inbox,
        roles: [Role.ADMIN],
        excludeRoles: [Role.SUPERADMIN],
        orgOnly: true,
      },
    ],
  },
  {
    // SUPERADMIN is rank 3, so `roles: [SUPERADMIN]` is exactly superadmin-only —
    // nothing outranks it.
    heading: 'Platform',
    items: [
      {
        to: '/home/platform/organizations',
        label: 'Organizations',
        icon: Building2,
        roles: [Role.SUPERADMIN],
      },
      // #118. Institutions apply for themselves now, so this queue is the entry point
      // to every new tenant — it sits directly under Organizations because approving an
      // application is how one gets created.
      {
        to: '/home/platform/organization-applications',
        label: 'Org applications',
        icon: Inbox,
        roles: [Role.SUPERADMIN],
      },
      // The other half of #118's review work: individuals asking to teach on the open
      // platform. Kept separate from org applications because approving them does
      // something quite different — an invite into the community tenant, not a new one.
      {
        to: '/home/platform/professor-applications',
        label: 'Professor requests',
        icon: UserCheck,
        roles: [Role.SUPERADMIN],
      },
      /*
       * "Unassigned students" is gone from the platform console too (#118).
       *
       * The pool is `organization_id IS NULL AND role = 'student'`, and since open
       * self-signups are created inside the COMMUNITY TENANT — a non-null org —
       * nothing produces a row for it any more. It is a permanently empty page, and
       * the empty state reads as "no open students exist", which is the opposite of
       * true: they exist, they are just members of a tenant.
       *
       * Repointing it at community-tenant students was considered and rejected: that
       * is a different operation (moving a member BETWEEN tenants, with seat
       * accounting on both sides), `assignOrganization` deliberately 404s anything
       * outside the pool, and open members are not meant to be claimable into a
       * closed institution anyway.
       *
       * The route and its guard remain, so a genuinely org-less account left by a
       * data repair is still reachable and fixable by URL.
       */
      {
        // #70. `problems.global` has an EMPTY role ceiling — SuperAdmin only — so
        // this catalog is not reachable or authorable from any other role.
        to: '/home/platform/global-problems',
        label: 'Global problems',
        icon: Globe,
        roles: [Role.SUPERADMIN],
      },
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
  const { user, logout, organization } = useAuth();
  const { canAccess } = useModuleAccess();
  /**
   * Members of the open community tenant. The server refuses org-staff surfaces for
   * them (`community_restricted`), so the nav must not offer them.
   *
   * Keyed on the org TYPE, never on `origin`: an open-platform student who accepts a
   * university invite is a full member of that university and must see its console
   * items, while keeping `origin: 'open'` forever.
   */
  const inCommunityTenant = organization?.type === OrganizationType.COMMUNITY;
  /**
   * Whether to render the co-branded lockup instead of plain CodeStack (#118).
   *
   * Not simply `!inCommunityTenant`: a SUPERADMIN has no organization at all, and that
   * must fall through to plain CodeStack rather than to a lockup with nothing to pair
   * with. Three states, two outcomes — a real org co-brands, the community tenant and
   * no-org do not.
   */
  const showOrgLockup = !!organization && organization.type !== OrganizationType.COMMUNITY;
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
    (!item.excludeRoles || !user || !item.excludeRoles.includes(user.role)) &&
    (!item.roles || !user || item.roles.some((r) => atLeast(user.role, r))) &&
    (!item.orgOnly || !inCommunityTenant) &&
    (!item.module || canAccess(item.module));

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(canSee),
  })).filter((section) => section.items.length > 0);

  // Collapse only applies to the desktop rail; the mobile drawer is always full.
  const isCollapsed = allowCollapse && collapsed;
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || 'U';

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
          <Link to="/home" title="CodeStack home" onClick={onNavigate} className="min-w-0">
            {/*
              Co-branded for members of a real organization, plain CodeStack otherwise
              (#118). `OrgLockup` owns that rule — it keys off `organization.type`, not
              `origin`, so an open-platform student who joins a university sees the
              university's identity from that moment on.
            */}
            {showOrgLockup ? (
              <OrgLockup className="text-white" />
            ) : (
              <Logo wordmarkClassName="text-white" accentClassName="text-[hsl(248_62%_82%)]" />
            )}
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
