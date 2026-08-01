import { useNavigate } from 'react-router-dom';
import { BookOpen, Code2, Sparkles, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/context/auth-context';
import { MinimalTopBar } from '../components/minimal-top-bar';

/**
 * Where an open-platform signup lands immediately after confirming their address
 * (#118).
 *
 * Deliberately a WELCOME, not a form. It is tempting to collect a timezone or a
 * skill level here, but this is the first authenticated screen of a funnel that has
 * already asked for four fields and a trip to an inbox — another form is where people
 * leave. Timezone already defaults to UTC on the user row and is editable in
 * settings; nothing here is required for the product to work.
 *
 * It exists at all because the alternative — dropping someone straight onto a
 * dashboard — gives no signal that the confirmation worked, which is the one thing
 * they came back to find out.
 *
 * Rendered OUTSIDE the app shell (like /pending and /suspended) so a brand-new member
 * is not handed a full navigation tree before they have seen anything. `/home` is one
 * click away and is where the shell takes over.
 */
export function OpenOnboardingPage() {
  const { user, organization } = useAuth();
  const navigate = useNavigate();

  // An open member belongs to the community tenant, which is not an institution they
  // joined — so it is never named here. If a real organization ever invites them,
  // `organization.type` stops being 'community' and the app shell picks up that
  // tenant's identity; this page is only ever the open-platform arrival.
  const isCommunity = !organization || organization.type === 'community';

  return (
    <div className="min-h-svh bg-background">
      <MinimalTopBar />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16">
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
            </div>
            <CardTitle>You&apos;re all set{user?.firstName ? `, ${user.firstName}` : ''}</CardTitle>
            <CardDescription>
              {isCommunity
                ? 'Your email is confirmed and your account is ready. Here is what you can do right now.'
                : `Your email is confirmed. You are part of ${organization?.name} on CodeStack.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ul className="grid gap-3 sm:grid-cols-3">
              <Highlight
                icon={<BookOpen className="size-4" aria-hidden="true" />}
                title="Practice problems"
                body="Work through the catalogue at your own pace."
              />
              <Highlight
                icon={<Code2 className="size-4" aria-hidden="true" />}
                title="Playground"
                body="Run code in Python, C++, Java or JavaScript."
              />
              <Highlight
                icon={<Trophy className="size-4" aria-hidden="true" />}
                title="Streaks"
                body="Solve something daily and keep the streak alive."
              />
            </ul>

            <div className="space-y-3">
              <Button
                size="lg"
                className="w-full"
                onClick={() => navigate('/home', { replace: true })}
              >
                Start practising
              </Button>
              {isCommunity && (
                <p className="text-xs text-muted-foreground">
                  Studying somewhere that uses CodeStack? When they invite you, this same account
                  joins their workspace — you don&apos;t need a second one.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Highlight({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      <p className="text-xs text-muted-foreground">{body}</p>
    </li>
  );
}
