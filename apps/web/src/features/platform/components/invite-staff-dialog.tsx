import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parseApiError } from '@/lib/api-client';
import { Role } from '@/types/common';
import { platformApi, platformKeys } from '../api/platform.api';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  // superadmin is absent on purpose: the policy refuses it from every actor, and
  // the seed is the only path. Offering it would render a control that 403s.
  role: z.enum([Role.ADMIN, Role.PROFESSOR, Role.STUDENT]),
  firstName: z.string().max(150).optional(),
  lastName: z.string().max(150).optional(),
});

/**
 * Invite staff into a specific organization.
 *
 * This exists on the PLATFORM console, not the org one, because an ADMIN may not
 * invite a PROFESSOR — staff onboarding is deliberately a SuperAdmin operation, so
 * a compromised org admin cannot manufacture teaching staff inside their tenant.
 */
export function InviteStaffDialog({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', role: Role.ADMIN, firstName: '', lastName: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => platformApi.inviteToOrg(orgId, values),
    onSuccess: () => {
      // The org detail's seat usage moves too — a pending invite reserves one.
      void queryClient.invalidateQueries({ queryKey: platformKeys.organization(orgId) });
      void queryClient.invalidateQueries({ queryKey: platformKeys.unassigned() });
      toast.success('Invitation sent');
      form.reset();
      setOpen(false);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <UserRoundPlus className="size-4" /> Invite staff
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite someone to {orgName}</DialogTitle>
          <DialogDescription>
            Only a platform administrator can invite an admin or professor. The invitation reserves
            a seat in this organization.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="invite-staff-form"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="admin@university.edu" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                      <SelectItem value={Role.PROFESSOR}>Professor</SelectItem>
                      <SelectItem value={Role.STUDENT}>Student</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
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
          <Button type="submit" form="invite-staff-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Sending…' : 'Send invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
