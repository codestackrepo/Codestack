import { Ban } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MinimalTopBar } from '../components/minimal-top-bar';

/**
 * A member of a SUSPENDED organization.
 *
 * TenantContextGuard rejects every route for them including /auth/verify, so
 * ProtectedRoute routes here off the session error rather than off a user object
 * it will never receive. Notifications are hidden: that endpoint 403s too.
 */
export function SuspendedPage() {
  return (
    <div className="min-h-svh bg-background">
      <MinimalTopBar showNotifications={false} />
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-16">
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <Ban className="size-5 text-destructive" />
            </div>
            <CardTitle>This organization is suspended</CardTitle>
            <CardDescription>
              Access has been paused for everyone in your organization. Your work is not deleted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Contact your administrator to find out more. You will be able to sign in again as soon
              as the suspension is lifted.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
