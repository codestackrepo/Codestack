import { EcosystemBadge } from '@/components/shared/org-lockup';
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

  const dashboard = (() => {
    switch (user.role) {
      case Role.ADMIN:
        return <AdminDashboard user={user} />;
      case Role.PROFESSOR:
        return <ProfessorDashboard user={user} />;
      default:
        return <StudentDashboard user={user} />;
    }
  })();

  return (
    <div className="space-y-4">
      {/*
        "You're part of the {org} ecosystem" (#118). Renders for admins, professors and
        students of a real organization, and NOTHING for open-platform members — who
        belong to the shared community tenant, which is not an institution anyone
        joined. `EcosystemBadge` owns that rule so it cannot drift from the header
        lockup's.
      */}
      <EcosystemBadge />
      {dashboard}
    </div>
  );
}
