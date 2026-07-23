import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute, RequireModule, RequireRole } from '@/components/layout/protected-route';
import { AppModuleKey, Role } from '@/types/common';

// Route-level code-splitting: each page is its own async chunk so the initial
// bundle stays lean. The heavy screens in particular (Monaco editor + playground,
// recharts gradebook, react-markdown AI preview) only load when navigated to.
// Named exports are adapted to the default-export shape React.lazy expects.
const LoginPage = lazy(() =>
  import('@/features/auth/pages/login-page').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('@/features/auth/pages/register-page').then((m) => ({ default: m.RegisterPage })),
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
  import('@/features/topics/pages/topics-page').then((m) => ({ default: m.TopicsPage })),
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
const AdminInvitesPage = lazy(() =>
  import('@/features/onboarding/pages/admin-invites-page').then((m) => ({
    default: m.AdminInvitesPage,
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
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute />}>
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
              {/* Staff-only assignment/test create/edit (#23) */}
              <Route element={<RequireRole roles={[Role.ADMIN, Role.PROFESSOR]} />}>
                <Route path="assignments/new" element={<AssignmentFormPage />} />
                <Route path="assignments/:id/edit" element={<AssignmentFormPage />} />
              </Route>
            </Route>
            <Route element={<RequireModule module={AppModuleKey.PLAYGROUND} />}>
              <Route path="playground" element={<PlaygroundPage />} />
            </Route>
            <Route element={<RequireModule module={AppModuleKey.TOPICS} />}>
              <Route path="topics" element={<TopicsPage />} />
            </Route>

            {/* Staff-only gradebook, additionally module-gated */}
            <Route element={<RequireRole roles={[Role.ADMIN, Role.PROFESSOR]} />}>
              <Route element={<RequireModule module={AppModuleKey.GRADING} />}>
                <Route path="grading" element={<GradingPage />} />
              </Route>
            </Route>

            {/* Admin-only overview, user management, and professor onboarding (#40) */}
            <Route element={<RequireRole roles={[Role.ADMIN]} />}>
              <Route path="admin" element={<AdminOverviewPage />} />
              <Route path="admin/users" element={<AdminUsersPage />} />
              <Route path="admin/requests" element={<AdminRequestsPage />} />
              <Route path="admin/invites" element={<AdminInvitesPage />} />
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
