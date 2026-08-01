import { useState } from 'react';
import { Link } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Building2, CheckCircle2, Globe, Mail, User } from 'lucide-react';
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
import { AuthLayout } from '@/features/auth/components/auth-layout';
import { OrganizationType } from '@/types/organization';
import { orgApplicationsApi } from '../api/organization-applications.api';

/**
 * Mirrors `CreateOrganizationApplicationDto` — same lengths, same optionality.
 *
 * The caps are not cosmetic: they match the column widths, so a value this schema
 * accepts is a value the API accepts, and the user finds out here rather than after a
 * round trip.
 */
const schema = z.object({
  organizationName: z
    .string()
    .min(2, 'Enter the full name of your institution')
    .max(200, 'That is longer than we can store'),
  organizationType: z.enum([OrganizationType.UNIVERSITY, OrganizationType.ORGANIZATION]),
  website: z
    .string()
    .max(255)
    .url('Include the full address, starting with https://')
    .optional()
    .or(z.literal('')),
  contactName: z.string().min(1, 'Who should we reply to?').max(150),
  contactEmail: z.string().email('Enter a valid email address').max(254),
  message: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * "Join as an organisation" — the public entry to the closed ecosystem (#118).
 *
 * An institution applies, a superadmin reviews it and sets the professor and student
 * seat counts, and approval invites the organisation's administrator. From there the
 * admin invites professors and students, and professors invite students.
 *
 * ONE name field, not two. Asking a procurement officer or a head of department to
 * split their name into first/last boxes is friction for nothing; the API splits it for
 * the mail greeting and joins it back to render, so a mononym or a multi-part surname
 * both come out as exactly what was typed.
 *
 * No logo upload here. Branding is set by the superadmin after approval, so this form
 * accepts nothing that would have to be stored or scanned.
 */
export function OrgApplyPage() {
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationName: '',
      organizationType: OrganizationType.UNIVERSITY,
      website: '',
      contactName: '',
      contactEmail: '',
      message: '',
    },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await orgApplicationsApi.submit({
        ...values,
        // Send nothing rather than an empty string: the column is nullable and `''` is
        // not a website.
        website: values.website || undefined,
        message: values.message || undefined,
      });
      setSubmitted(true);
    } catch (error) {
      setFormError(parseApiError(error).message);
    }
  }

  /*
   * One acknowledgement for every outcome.
   *
   * The API answers the same 202 whether this created an application, an application for
   * that address was already pending, or a concurrent submission won — because the
   * endpoint is public and any difference would confirm which institutions and addresses
   * are already known to us. So there is deliberately nothing here that varies.
   */
  if (submitted) {
    return (
      <AuthLayout
        title="Application received"
        description="We review each application by hand, so give us a little time."
      >
        <div className="space-y-5">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">
            When it&apos;s approved we&apos;ll email your administrator a link to set up the
            workspace, choose a password and start inviting professors and students. Nothing is
            needed from you in the meantime.
          </p>
          <Link
            to="/"
            className="block text-center text-sm font-semibold text-primary hover:underline"
          >
            Back to the homepage
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Bring your institution to CodeStack"
      description="Tell us who you are and we'll set up a workspace for your professors and students."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="organizationName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Institution name</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Acme University" className="pl-9" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="organizationType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: OrganizationType.UNIVERSITY, label: 'University or school' },
                      { value: OrganizationType.ORGANIZATION, label: 'Company or other' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => field.onChange(option.value)}
                        aria-pressed={field.value === option.value}
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          field.value === option.value
                            ? 'border-primary bg-primary/10 font-medium text-foreground'
                            : 'text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Website</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="https://acme.edu" className="pl-9" {...field} />
                  </div>
                </FormControl>
                <FormDescription>
                  Optional, but it helps us confirm who you are — which usually means a faster
                  answer.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="contactName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input autoComplete="name" className="pl-9" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@acme.edu"
                        className="pl-9"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Anything else?</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="How many students you teach, which courses, when you'd like to start…"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Sending…' : 'Send application'}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Just want to practise on your own?{' '}
        <Link to="/register" className="font-semibold text-primary hover:underline">
          Create a personal account
        </Link>
      </p>
    </AuthLayout>
  );
}
