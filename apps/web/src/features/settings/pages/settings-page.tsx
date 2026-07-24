import { ComingSoon } from '@/components/shared/coming-soon';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/context/auth-context';
import { Role } from '@/types/common';
import { ModuleAccessMatrix } from '../components/module-access-matrix';

export function SettingsPage() {
  const { user } = useAuth();

  if (user?.role !== Role.ADMIN) {
    return <ComingSoon title="Settings" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Platform configuration. Changes apply to every user in the affected role."
      />
      <Card>
        <CardHeader>
          <CardTitle>Module access</CardTitle>
          <CardDescription>
            Enable or disable each module per role. Admins always retain access. Disabling a
            module hides it from the sidebar, blocks its routes, and rejects its API calls for
            that role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModuleAccessMatrix />
        </CardContent>
      </Card>
    </div>
  );
}
