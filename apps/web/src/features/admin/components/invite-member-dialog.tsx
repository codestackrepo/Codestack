import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { UserRoundPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { QuotaBlockNotice } from '@/components/shared/quota-block-notice';
import { parseApiError } from '@/lib/api-client';
import { Role } from '@/types/common';
import { useAuth } from '@/features/auth/context/auth-context';
import { invitesApi, inviteKeys } from '@/features/invites/api/invites.api';
import { adminUserKeys } from '../api/users.api';

/**
 * Client mirror of the server's `INVITABLE_ROLES` matrix (`invite-policy.ts`).
 *
 * Duplicated rather than fetched because it is a small, rarely-changing constant and
 * a round trip to render a two-item dropdown is not worth it — but it is a MIRROR,
 * not the authority. The server re-checks every invite and answers 403
 * `role_not_invitable`, so a drift here costs a rejected request, never an
 * unauthorised one.
 */
const INVITABLE_BY: Partial<Record<Role, Role[]>> = {
  [Role.ADMIN]: [Role.PROFESSOR, Role.STUDENT],
  [Role.PROFESSOR]: [Role.STUDENT],
};

const ROLE_LABEL: Partial<Record<Role, string>> = {
  [Role.PROFESSOR]: 'Professor',
  [Role.STUDENT]: 'Student',
};

/**
 * Which seat cap a role is charged to — the client half of `seatResourceFor`.
 * Admins are charged to `max_users` only, but an admin is not invitable here.
 */
const SEAT_RESOURCE: Partial<Record<Role, 'max_professors' | 'max_students'>> = {
  [Role.PROFESSOR]: 'max_professors',
  [Role.STUDENT]: 'max_students',
};

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  role: z.nativeEnum(Role),
  firstName: z.string().max(150).optional(),
  lastName: z.string().max(150).optional(),
});

/**
 * Invite one member.
 *
 * Replaces the student-only dialog. An ADMIN may now invite a PROFESSOR
 * (`invite-policy.ts`, #118) — the old "staff onboarding is a SuperAdmin operation"
 * rule was reversed once tenants gained per-role seat caps, and this dialog was the
 * last place still enforcing the retired rule in the UI.
 *
 * The role list comes from the actor's own row in the matrix, so the same component
 * renders a role picker for an admin and a fixed student invite for a professor.
 */
export function InviteMemberDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { quotas, user } = useAuth();

  const invitable = (user?.role && INVITABLE_BY[user.role]) || [];

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      // Default to the least-privileged role the actor may invite, so the
      // higher-privilege option is always a deliberate choice.
      role: invitable[invitable.length - 1] ?? Role.STUDENT,
      firstName: '',
      lastName: '',
    },
  });

  // useWatch, not form.watch(): the latter returns a fresh function each render, which
  // makes React Compiler bail out of memoizing this whole component.
  const selectedRole = useWatch({ control: form.control, name: 'role' });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => invitesApi.create(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inviteKeys.all });
      // A pending invite RESERVES a seat, so the People count and the session's
      // quota block both move.
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
      toast.success('Invitation sent');
      form.reset();
      setOpen(false);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  /*
   * Seat pre-check (#71, extended for per-role caps).
   *
   * A pending invite HOLDS its seat — `countSeats` is active users plus pending
   * invites — so the block has to consider `remaining`, not just the member count.
   * Both `remaining` and `exceeded` come from the server; nothing is derived here,
   * because `limit ?? 0` is exactly how an uncapped org would appear blocked.
   *
   * TWO caps bind, not one: the overall `max_users` AND the seat cap for the role
   * being invited. Checking only `max_users` — as this dialog used to — tells an
   * admin with 90 free member seats but 0 free professor seats that they may invite
   * a professor, and the server then 409s. Whichever cap is exhausted is the one
   * reported, overall first since it bounds everything.
   *
   * This is advisory. The transaction is authoritative and can still 409 on a race,
   * which the mutation's error path already surfaces.
   */
  const isBlocked = (snapshot: { limit: number | null; remaining: number | null } | undefined) =>
    !!snapshot && snapshot.limit !== null && (snapshot.remaining ?? 0) <= 0;

  const overall = quotas?.max_users;
  const roleResource = SEAT_RESOURCE[selectedRole];
  const roleSeats = roleResource ? quotas?.[roleResource] : undefined;

  const blockedBy = isBlocked(overall)
    ? { label: 'member', snapshot: overall }
    : isBlocked(roleSeats)
      ? { label: ROLE_LABEL[selectedRole]?.toLowerCase() ?? 'role', snapshot: roleSeats }
      : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserRoundPlus className="size-4" /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            They get an email with a link to set a password and join. The invitation reserves a seat
            until it is accepted or expires.
          </DialogDescription>
        </DialogHeader>

        {blockedBy && (
          <QuotaBlockNotice
            resourceLabel={`${blockedBy.label} seat`}
            limit={blockedBy.snapshot?.limit}
            used={blockedBy.snapshot?.used}
          />
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
            id="invite-member-form"
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="member@university.edu" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* A single invitable role needs no picker — rendering a one-option
                dropdown would imply a choice the actor does not have. */}
            {invitable.length > 1 && (
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {invitable.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABEL[role] ?? role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="invite-member-form"
            disabled={mutation.isPending || !!blockedBy}
          >
            {mutation.isPending ? 'Sending…' : 'Send invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
