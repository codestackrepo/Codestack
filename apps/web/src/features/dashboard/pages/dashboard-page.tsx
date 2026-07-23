import { useAuth } from '@/features/auth/context/auth-context';
import { Role } from '@/types/common';
import { AdminDashboard } from '../components/admin-dashboard';
import { ProfessorDashboard } from '../components/professor-dashboard';
import { StudentDashboard } from '../components/student-dashboard';

/**
 * Role-aware dashboard: each role gets a distinct overview built from the data
 * relevant to it. Students see their learning progress and deadlines, professors
 * see their classrooms and teaching actions, and admins get a platform overview.
 */
export function DashboardPage() {
  const { user } = useAuth();

  if (!user) return null;

  switch (user.role) {
    case Role.ADMIN:
      return <AdminDashboard user={user} />;
    case Role.PROFESSOR:
      return <ProfessorDashboard user={user} />;
    default:
      return <StudentDashboard user={user} />;
  }
}
