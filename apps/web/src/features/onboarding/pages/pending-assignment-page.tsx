import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, RefreshCw, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/context/auth-context';
import { invitesApi, inviteKeys } from '@/features/invites/api/invites.api';
import { MinimalTopBar } from '../components/minimal-top-bar';

/**
 * The confined holding state: a self-registered student with no organization.
 *
 * Every tenant route 403s `no_organization` for them, so this page has to explain
 * the state and offer the two ways out — wait to be assigned, or claim an
 * invitation addressed to them.
 */
export function PendingAssignmentPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // On the @AllowsUnassigned allowlist — owner-scoped to the actor's own address.
  const { data: invites = [] } = useQuery({
    queryKey: inviteKeys.mine(),
    queryFn: invitesApi.mine,
    retry: false,
  });

  return (
    <div className="min-h-svh bg-background">
      <MinimalTopBar />
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-16">
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10">
              <Clock className="size-5 text-primary" />
            </div>
            <CardTitle>Waiting for your organization</CardTitle>
            <CardDescription>
              Your account is ready, but it is not part of an organization yet. A teacher or
              administrator at your school needs to add you before you can start.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You signed up as <span className="font-medium text-foreground">{user?.email}</span>.
              Make sure that is the address your school has for you.
            </p>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={async () => {
                // No refetchInterval anywhere — AuthProvider owns the session
                // query, and a second poller would fight it.
                await queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
                toast.info('Checked — still waiting.');
              }}
            >
              <RefreshCw className="size-4" /> Check again
            </Button>
          </CardContent>
        </Card>

        {invites.length > 0 && (
          <Card>
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10">
                <Mail className="size-5 text-primary" />
              </div>
              <CardTitle>You have an invitation</CardTitle>
              <CardDescription>
                Accepting adds this account to the organization — nothing moves without you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div className="text-sm">
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-muted-foreground">
                      Expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  {/* The claim endpoint takes the raw token, which no listing
                      carries — so this row links to the emailed link instead of
                      pretending it can accept in place. */}
                  <span className="text-xs text-muted-foreground">Use the link in your email</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
