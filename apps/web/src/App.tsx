import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import {
  ProtectedRoute,
  RequireModule,
  RequireRole,
  RequireSuperAdmin,
} from '@/components/layout/protected-route';
import { AppModuleKey, Role } from '@/types/common';

// Route-level code-splitting: each page is its own async chunk so the initial
// bundle stays lean. The heavy screens in particular (Monaco editor + playground,
// recharts gradebook, react-markdown AI preview) only load when navigated to.
// Named exports are adapted to the default-export shape React.lazy expects.
const LandingPage = lazy(() =>
  import('@/features/marketing/pages/landing-page').then((m) => ({ default: m.LandingPage })),
);
const InviteAcceptPage = lazy(() =>
  import('@/features/invites/pages/invite-accept-page').then((m) => ({
    default: m.InviteAcceptPage,
  })),
);
const PendingAssignmentPage = lazy(() =>
  import('@/features/onboarding/pages/pending-assignment-page').then((m) => ({
    default: m.PendingAssignmentPage,
  })),
);
const SuspendedPage = lazy(() =>
  import('@/features/onboarding/pages/suspended-page').then((m) => ({ default: m.SuspendedPage })),
);
const OrgInvitesPage = lazy(() =>
  import('@/features/admin/pages/org-invites-page').then((m) => ({ default: m.OrgInvitesPage })),
);
const OrgUnassignedPage = lazy(() =>
  import('@/features/admin/pages/org-unassigned-page').then((m) => ({
    default: m.OrgUnassignedPage,
  })),
);
const BulkInvitePage = lazy(() =>
  import('@/features/bulk-invite/pages/bulk-invite-page').then((m) => ({
    default: m.BulkInvitePage,
  })),
);
const PlatformOrganizationsPage = lazy(() =>
  import('@/features/platform/pages/platform-organizations-page').then((m) => ({
    default: m.PlatformOrganizationsPage,
  })),
);
const PlatformOrgDetailPage = lazy(() =>
  import('@/features/platform/pages/platform-org-detail-page').then((m) => ({
    default: m.PlatformOrgDetailPage,
  })),
);
const PlatformGlobalProblemsPage = lazy(() =>
  import('@/features/platform/pages/platform-global-problems-page').then((m) => ({
    default: m.PlatformGlobalProblemsPage,
  })),
);
const PlatformUnassignedPage = lazy(() =>
  import('@/features/platform/pages/platform-unassigned-page').then((m) => ({
    default: m.PlatformUnassignedPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import('@/features/auth/pages/forgot-password-page').then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import('@/features/auth/pages/reset-password-page').then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const AuthPage = lazy(() =>
  import('@/features/auth/pages/auth-page').then((m) => ({ default: m.AuthPage })),
);
const DashboardPage = lazy(() =>
  import('@/features/dashboard/pages/dashboard-page').then((m) => ({ default: m.DashboardPage })),
);
const ClassroomsListPage = lazy(() =>
  import('@/features/classrooms/pages/classrooms-list-page').then((m) => ({
    default: m.ClassroomsListPage,
  })),
);
const ClassroomDetailPage = lazy(() =>
  import('@/features/classrooms/pages/classroom-detail-page').then((m) => ({
    default: m.ClassroomDetailPage,
  })),
);
const ClassroomFormPage = lazy(() =>
  import('@/features/classrooms/pages/classroom-form-page').then((m) => ({
    default: m.ClassroomFormPage,
  })),
);
const ProblemsListPage = lazy(() =>
  import('@/features/problems/pages/problems-list-page').then((m) => ({
    default: m.ProblemsListPage,
  })),
);
const ProblemDetailPage = lazy(() =>
  import('@/features/problems/pages/problem-detail-page').then((m) => ({
    default: m.ProblemDetailPage,
  })),
);
const AssignmentsListPage = lazy(() =>
  import('@/features/assignments/pages/assignments-list-page').then((m) => ({
    default: m.AssignmentsListPage,
  })),
);
const AssignmentFormPage = lazy(() =>
  import('@/features/assignments/pages/assignment-form-page').then((m) => ({
    default: m.AssignmentFormPage,
  })),
);
const AssignmentBuilderPage = lazy(() =>
  import('@/features/assignments/pages/assignment-builder-page').then((m) => ({
    default: m.AssignmentBuilderPage,
  })),
);
const AssignmentTakePage = lazy(() =>
  import('@/features/assignments/pages/assignment-take-page').then((m) => ({
    default: m.AssignmentTakePage,
  })),
);
const CodeEditorPage = lazy(() =>
  import('@/features/editor/pages/code-editor-page').then((m) => ({ default: m.CodeEditorPage })),
);
const PracticeEditorPage = lazy(() =>
  import('@/features/editor/pages/practice-editor-page').then((m) => ({
    default: m.PracticeEditorPage,
  })),
);
const PlaygroundPage = lazy(() =>
  import('@/features/playground/pages/playground-page').then((m) => ({
    default: m.PlaygroundPage,
  })),
);
const GradingPage = lazy(() =>
  import('@/features/grading/pages/grading-page').then((m) => ({ default: m.GradingPage })),
);
const TopicsPage = lazy(() =>
  import('@/features/engagement/pages/topics-page').then((m) => ({ default: m.TopicsPage })),
);
const TopicDetailPage = lazy(() =>
  import('@/features/engagement/pages/topic-detail-page').then((m) => ({
    default: m.TopicDetailPage,
  })),
);
const DoubtsInboxPage = lazy(() =>
  import('@/features/engagement/pages/doubts-inbox-page').then((m) => ({
    default: m.DoubtsInboxPage,
  })),
);
const RequestAccessPage = lazy(() =>
  import('@/features/onboarding/pages/request-access-page').then((m) => ({
    default: m.RequestAccessPage,
  })),
);
const AdminOverviewPage = lazy(() =>
  import('@/features/admin/pages/admin-overview-page').then((m) => ({
    default: m.AdminOverviewPage,
  })),
);
const AdminUsersPage = lazy(() =>
  import('@/features/admin/pages/admin-users-page').then((m) => ({
    default: m.AdminUsersPage,
  })),
);
const AdminRequestsPage = lazy(() =>
  import('@/features/onboarding/pages/admin-requests-page').then((m) => ({
    default: m.AdminRequestsPage,
  })),
);
const ProfilePage = lazy(() =>
  import('@/features/profile/pages/profile-page').then((m) => ({ default: m.ProfilePage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/pages/settings-page').then((m) => ({ default: m.SettingsPage })),
);

function RouteFallback() {
  return (
    <div className="flex h-full min-h-64 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage initialMode="login" />} />
        <Route path="/register" element={<AuthPage initialMode="register" />} />
        {/* Public recovery — declared with the other public auth routes and well
            before the path="*" catch-all. */}
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

        <Route element={<ProtectedRoute />}>
          {/* Inside ProtectedRoute (they need a session) but OUTSIDE AppShell:
              AppShell's navbar links to /home/profile and /home/settings, which
              ProtectedRoute would bounce straight back here — a nav where every
              item is a no-op. Each page composes its own minimal top bar. */}
          <Route path="/pending" element={<PendingAssignmentPage />} />
          <Route path="/suspended" element={<SuspendedPage />} />

          <Route path="/home" element={<AppShell />}>
            <Route index element={<Navigate to="dashboard" replace />} />

            {/* SYSTEM modules — always-on, never module-gated */}
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            {/* Role-gated onboarding surfaces (not toggleable modules) */}
            <Route path="request-access" element={<RequestAccessPage />} />

            {/* Toggleable modules (§9.7) */}
            <Route element={<RequireModule module={AppModuleKey.CLASSROOMS} />}>
              <Route path="classrooms" element={<ClassroomsListPage />} />
              <Route path="classrooms/:id" element={<ClassroomDetailPage />} />
              {/* Staff-only classroom create/edit (#23) */}
              <Route element={<RequireRole roles={[Role.ADMIN, Role.PROFESSOR]} />}>
                <Route path="classrooms/new" element={<ClassroomFormPage />} />
                <Route path="classrooms/:id/edit" element={<ClassroomFormPage />} />
              </Route>
            </Route>
            <Route element={<RequireModule module={AppModuleKey.PROBLEMS} />}>
              <Route path="problems" element={<ProblemsListPage />} />
              <Route path="problems/:id" element={<ProblemDetailPage />} />
            </Route>
            <Route element={<RequireModule module={AppModuleKey.ASSIGNMENTS} />}>
              <Route path="assignments" element={<AssignmentsListPage />} />
              {/* Student/member take surface (#22); server assertCanView gates access. */}
              <Route path="assignments/:id/take" element={<AssignmentTakePage />} />
              {/* Staff-only create/edit (#23) + item builder (#22) */}
              <Route element={<RequireRole roles={[Role.ADMIN, Role.PROFESSOR]} />}>
                <Route path="assignments/new" element={<AssignmentFormPage />} />
                <Route path="assignments/:id/edit" element={<AssignmentFormPage />} />
                <Route path="assignments/:id/build" element={<AssignmentBuilderPage />} />
              </Route>
            </Route>
            <Route element={<RequireModule module={AppModuleKey.PLAYGROUND} />}>
              <Route path="playground" element={<PlaygroundPage />} />
            </Route>
            <Route element={<RequireModule module={AppModuleKey.TOPICS} />}>
              <Route path="topics" element={<TopicsPage />} />
              <Route path="topics/:topicId" element={<TopicDetailPage />} />
              <Route path="doubts" element={<DoubtsInboxPage />} />
            </Route>

            {/* Staff-only gradebook, additionally module-gated */}
            <Route element={<RequireRole roles={[Role.ADMIN, Role.PROFESSOR]} />}>
              <Route element={<RequireModule module={AppModuleKey.GRADING} />}>
                <Route path="grading" element={<GradingPage />} />
              </Route>
            </Route>

            {/* Org console. `exclude` is load-bearing, not cosmetic: RequireRole is
                rank-aware, so roles={[PROFESSOR]} admits a SUPERADMIN — and
                scopeToOrg no-ops for them, so they would get a CROSS-ORG list
                under an "Everyone in {organization.name}" heading where
                `organization` is null. Hiding the sidebar link does not gate the
                route. */}
            <Route element={<RequireRole roles={[Role.PROFESSOR]} exclude={[Role.SUPERADMIN]} />}>
              <Route path="admin/users" element={<AdminUsersPage />} />
              <Route path="admin/invites" element={<OrgInvitesPage />} />
              <Route path="admin/bulk-invite" element={<BulkInvitePage />} />
              <Route path="admin/unassigned" element={<OrgUnassignedPage />} />
            </Route>
            <Route element={<RequireRole roles={[Role.ADMIN]} exclude={[Role.SUPERADMIN]} />}>
              <Route path="admin" element={<AdminOverviewPage />} />
              <Route path="admin/requests" element={<AdminRequestsPage />} />
            </Route>

            {/* Platform console — greenfield. RequireSuperAdmin fails CLOSED. */}
            <Route element={<RequireSuperAdmin />}>
              <Route path="platform/organizations" element={<PlatformOrganizationsPage />} />
              <Route path="platform/organizations/:orgId" element={<PlatformOrgDetailPage />} />
              <Route path="platform/unassigned" element={<PlatformUnassignedPage />} />
              <Route path="platform/global-problems" element={<PlatformGlobalProblemsPage />} />
            </Route>
          </Route>

          {/* Full-bleed editors: own top bar, no sidebar/padding from AppShell.
              OUTSIDE /home, so each MUST be module-wrapped explicitly (§9.8):
              assignment solve → ASSIGNMENTS, practice solve → PROBLEMS. */}
          <Route element={<RequireModule module={AppModuleKey.ASSIGNMENTS} />}>
            <Route path="/solve/:apId" element={<CodeEditorPage />} />
          </Route>
          <Route element={<RequireModule module={AppModuleKey.PROBLEMS} />}>
            <Route path="/practice/:problemId" element={<PracticeEditorPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
