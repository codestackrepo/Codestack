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
import { parseApiError } from '@/lib/api-client';
import { Role } from '@/types/common';
import { invitesApi, inviteKeys } from '@/features/invites/api/invites.api';
import { adminUserKeys } from '../api/users.api';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  firstName: z.string().max(150).optional(),
  lastName: z.string().max(150).optional(),
});

/**
 * Invite one student.
 *
 * Students only: the role policy refuses an ADMIN inviting a PROFESSOR, so
 * offering a role picker here would render a control that always 403s. Staff
 * onboarding is a SuperAdmin operation on the platform console.
 */
export function InviteStudentDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', firstName: '', lastName: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      invitesApi.create({ ...values, role: Role.STUDENT }),
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserRoundPlus className="size-4" /> Invite student
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a student</DialogTitle>
          <DialogDescription>
            They get an email with a link to set a password and join. The invitation reserves a seat
            until it is accepted or expires.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
            id="invite-student-form"
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="student@university.edu" {...field} />
                  </FormControl>
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
          <Button type="submit" form="invite-student-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Sending…' : 'Send invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
