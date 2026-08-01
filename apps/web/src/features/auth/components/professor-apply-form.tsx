import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Building2, Mail, MailCheck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { parseApiError } from '@/lib/api-client';
import { professorApplicationsApi } from '@/features/onboarding/api/professor-applications.api';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required').max(150),
  lastName: z.string().min(1, 'Last name is required').max(150),
  email: z.string().email('Enter a valid email address').max(254),
  institution: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Apply to teach on the open platform (#118).
 *
 * NO PASSWORD FIELD, and that is the flow rather than an omission: an approved
 * applicant sets one by accepting the invite approval mints. Collecting it here would
 * mean storing a credential for an account that may never exist, for a person we have
 * not yet decided to admit.
 *
 * Institution is optional. An independent tutor or a bootcamp instructor has none, and
 * requiring one would exclude exactly the people the open platform is for. It is
 * context for the reviewer, not a lookup — naming a university here does not join it.
 */
export function ProfessorApplyForm({ onBack }: { onBack: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', email: '', institution: '', message: '' },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await professorApplicationsApi.submit({
        ...values,
        institution: values.institution || undefined,
        message: values.message || undefined,
      });
      setSubmitted(true);
    } catch (error) {
      setFormError(parseApiError(error).message);
    }
  }

  /*
   * One acknowledgement for every outcome — the API answers the same 202 whether this
   * stored an application, one was already pending, or the address already has an
   * account. Rendering a distinguishable success would hand back the account-existence
   * oracle the endpoint is built to avoid.
   */
  if (submitted) {
    return (
      <div className="space-y-6">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="size-6 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-heading text-2xl font-bold tracking-tight">Request sent</h1>
          <p className="text-sm text-muted-foreground">
            Thanks — our team reviews every request by hand. If it&apos;s approved we&apos;ll email
            you a link to set a password and start teaching. Nothing is needed from you until then.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Apply to teach</h1>
        <p className="text-sm text-muted-foreground">
          Professor accounts are reviewed by the CodeStack team. Tell us a little about yourself and
          we&apos;ll be in touch.
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
                      <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input autoComplete="given-name" className="pl-9" {...field} />
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
                      <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input autoComplete="family-name" className="pl-9" {...field} />
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
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@school.edu"
                      className="pl-9"
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
            name="institution"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Where you teach</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Acme University" className="pl-9" {...field} />
                  </div>
                </FormControl>
                <FormDescription>
                  Optional — independent tutors are welcome. This does not join you to an
                  institution&apos;s workspace.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>What do you teach?</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="Courses, cohort sizes, how you'd like to use CodeStack…"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Sending…' : 'Send request'}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        <button
          type="button"
          onClick={onBack}
          className="font-semibold text-primary hover:underline"
        >
          Back
        </button>
      </p>
    </div>
  );
}
