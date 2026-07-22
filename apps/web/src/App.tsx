import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute, RequireRole } from '@/components/layout/protected-route';
import { Role } from '@/types/common';

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
const CodeEditorPage = lazy(() =>
  import('@/features/editor/pages/code-editor-page').then((m) => ({ default: m.CodeEditorPage })),
);
const PlaygroundPage = lazy(() =>
  import('@/features/playground/pages/playground-page').then((m) => ({
    default: m.PlaygroundPage,
  })),
);
const GradingPage = lazy(() =>
  import('@/features/grading/pages/grading-page').then((m) => ({ default: m.GradingPage })),
);
const AiGeneratePage = lazy(() =>
  import('@/features/ai/pages/ai-generate-page').then((m) => ({ default: m.AiGeneratePage })),
);
const BillingPage = lazy(() =>
  import('@/features/billing/pages/billing-page').then((m) => ({ default: m.BillingPage })),
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
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="classrooms" element={<ClassroomsListPage />} />
            <Route path="classrooms/:id" element={<ClassroomDetailPage />} />
            <Route path="problems" element={<ProblemsListPage />} />
            <Route path="problems/:id" element={<ProblemDetailPage />} />
            <Route path="assignments" element={<AssignmentsListPage />} />
            <Route path="playground" element={<PlaygroundPage />} />
            <Route path="ai" element={<AiGeneratePage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />

            {/* Staff-only gradebook */}
            <Route element={<RequireRole roles={[Role.ADMIN, Role.PROFESSOR]} />}>
              <Route path="grading" element={<GradingPage />} />
            </Route>
          </Route>

          {/* Full-bleed editor: its own top bar, no sidebar/padding from AppShell */}
          <Route path="/solve/:apId" element={<CodeEditorPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
