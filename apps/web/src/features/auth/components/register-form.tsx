import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { GraduationCap, Lock, Mail, MailCheck, Presentation, User } from 'lucide-react';
import { toast } from 'sonner';
import { ProfessorApplyForm } from './professor-apply-form';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';

const FIELD = 'h-10 bg-muted/30 pl-9 transition-colors focus-visible:bg-transparent';
const ICON =
  'pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground';
import { passwordSchema } from '../password-schema';
import { useAuth } from '../context/auth-context';
import { parseApiError } from '@/lib/api-client';

const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(150),
  lastName: z.string().min(1, 'Last name is required').max(150),
  email: z.string().email('Enter a valid email address'),
  password: passwordSchema,
});

type RegisterFormValues = z.infer<typeof registerSchema>;

/**
 * Register form body. Used inside AuthPage.
 *
 * Opens on a ROLE CHOICE (#118), because the two open-platform paths are genuinely
 * different and neither is a variant of the other:
 *
 *   student    signs up, confirms the address, and is in immediately.
 *   professor  submits a request a CodeStack superadmin reviews; approval mails an
 *              invite to set a password. There is no password on that form at all.
 *
 * Presenting one form with a role dropdown would imply the outcomes are the same, and
 * the professor would fill in a password that is thrown away.
 */
export function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const { register } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  /** Non-null once submitted — swaps the whole form for the inbox notice. */
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  /** null = still choosing. The chooser is the default state. */
  const [role, setRole] = useState<'student' | 'professor' | null>(null);

  // No invite handling here any more. Self-registration always produces an
  // org-less STUDENT; an invitee lands on /invite/:token instead, which is its own
  // surface with its own accept call. Reading `?invite=` here would have kept a
  // second, quota-free path into a role.

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: RegisterFormValues) {
    setFormError(null);
    try {
      await register(values);
      /*
       * Straight to "check your inbox", NOT to /home (#118).
       *
       * Signup no longer mints a session — the account is unverified, and an
       * unverified account may not hold one. Navigating into the app would land on a
       * 401 and bounce back to login, which reads as the signup having failed.
       *
       * The address is shown back to the user because a typo is the single most
       * common reason this flow stalls, and it is the one thing they can check
       * without leaving the page.
       */
      setSubmittedEmail(values.email);
    } catch (error) {
      setFormError(parseApiError(error).message);
    }
  }

  /*
   * The confirmation state is deliberately identical for every outcome.
   *
   * The server answers the same 200 whether an account was created, the address was
   * already taken, or a pending signup had its link re-sent — because `users.email`
   * is unique and this endpoint is public, so any difference would confirm that an
   * address has an account. Rendering a distinguishable success would hand back the
   * oracle the API just closed.
   */
  if (submittedEmail) {
    return <CheckYourInbox email={submittedEmail} onBackToSignIn={onSwitch} />;
  }

  if (role === null) {
    return <RoleChooser onChoose={setRole} onSwitch={onSwitch} />;
  }

  if (role === 'professor') {
    return <ProfessorApplyForm onBack={() => setRole(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Sign up to practise on CodeStack. If your school invites you later, your account joins
          their workspace.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className={ICON} />
                      <Input autoComplete="given-name" className={FIELD} {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className={ICON} />
                      <Input autoComplete="family-name" className={FIELD} {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className={ICON} />
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@school.edu"
                      className={FIELD}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className={ICON} />
                    <PasswordInput
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className={FIELD}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => setRole(null)}
          className="font-semibold text-primary hover:underline"
        >
          Back
        </button>
        {' · '}
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitch}
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}

/**
 * The two open-platform doors.
 *
 * Both say what actually happens next, because the difference is the whole point of
 * asking: a student is in within a minute, a professor waits for a human. Discovering
 * that only after filling in a form is how people conclude the product is broken.
 *
 * Organisations are a third door and deliberately NOT here — an institution applying for
 * a workspace is not signing up for an account, and its flow ends with a superadmin
 * setting seat limits. It gets its own page, linked at the bottom.
 */
function RoleChooser({
  onChoose,
  onSwitch,
}: {
  onChoose: (role: 'student' | 'professor') => void;
  onSwitch: () => void;
}) {
  const options = [
    {
      role: 'student' as const,
      icon: GraduationCap,
      title: 'I’m a student',
      body: 'Practise problems, run code and build a streak. Confirm your email and you’re in.',
    },
    {
      role: 'professor' as const,
      icon: Presentation,
      title: 'I’m a professor',
      body: 'Teach on CodeStack. Our team reviews every request, then emails you a setup link.',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Join CodeStack</h1>
        <p className="text-sm text-muted-foreground">How will you be using it?</p>
      </div>

      <div className="grid gap-3">
        {options.map((option) => (
          <button
            key={option.role}
            type="button"
            onClick={() => onChoose(option.role)}
            className="group flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
          >
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <option.icon className="size-4 text-primary" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-semibold">{option.title}</span>
              <span className="block text-sm text-muted-foreground">{option.body}</span>
            </span>
          </button>
        ))}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Bringing a whole institution?{' '}
        <Link to="/for-organizations" className="font-semibold text-primary hover:underline">
          Apply for a workspace
        </Link>
      </p>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitch}
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}

/**
 * The post-signup state. One screen for every outcome — see the note at the call
 * site for why that is a security property rather than laziness.
 *
 * The copy avoids claiming an account was created. "If we could create your account"
 * is doing real work: it is true when the address was already taken, true when a
 * pending signup was re-sent its link, and true when a new account was made, so the
 * user is never told something false and a prober is never told something useful.
 */
function CheckYourInbox({ email, onBackToSignIn }: { email: string; onBackToSignIn: () => void }) {
  const { resendVerification } = useAuth();
  const [sending, setSending] = useState(false);

  async function onResend() {
    setSending(true);
    try {
      await resendVerification(email);
      // Same uniform copy as the server's. A toast that said "sent!" would assert
      // something this client cannot know.
      toast.success('If that address needs confirming, a new link is on its way.');
    } catch {
      // Throttled (3/min) or offline. Nothing here is worth a scary error: the user
      // can simply try again, and the original link is probably still valid.
      toast.error('Could not request another link just now. Try again in a minute.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
        <MailCheck className="size-6 text-primary" aria-hidden="true" />
      </div>

      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Check your inbox</h1>
        <p className="text-sm text-muted-foreground">
          If we could create your account, a confirmation link is on its way to{' '}
          <span className="font-medium text-foreground">{email}</span>. Open it to finish signing up
          — the link works once and expires in 24 hours.
        </p>
      </div>

      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={onResend}
          disabled={sending}
        >
          {sending ? 'Sending…' : 'Send the link again'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Nothing arrived? Check spam, and confirm the address above is spelled correctly. If it
          isn't, sign up again with the right one.
        </p>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Already confirmed?{' '}
        <button
          type="button"
          onClick={onBackToSignIn}
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
