import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Building2 } from 'lucide-react';
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
  FormDescription,
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
import { OrganizationType } from '@/types/organization';
import { platformApi, platformKeys } from '../api/platform.api';

const schema = z.object({
  name: z.string().min(1, 'Required').max(200),
  // Optional: the server slugifies the name when this is blank, and a clash is a
  // 409 with the taken slug named, rather than a silent suffix.
  slug: z
    .string()
    .max(80)
    .regex(/^[a-z0-9-]*$/, 'Lowercase letters, numbers and hyphens only')
    .optional(),
  type: z.enum([OrganizationType.UNIVERSITY, OrganizationType.ORGANIZATION]),
});

/** Creates a tenant. The ONLY way one comes into existence. */
export function OrganizationFormDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '', type: OrganizationType.UNIVERSITY },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      platformApi.createOrganization({ ...values, slug: values.slug || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.organizations() });
      toast.success('Organization created');
      form.reset();
      setOpen(false);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Building2 className="size-4" /> New organization
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create an organization</DialogTitle>
          <DialogDescription>
            It starts active and empty. Invite an administrator afterwards to hand it over.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="org-form"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme University" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="acme-university" {...field} />
                  </FormControl>
                  <FormDescription>
                    Derived from the name when left blank. Cannot be changed later.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {/* Exactly these two — the DB CHECK permits no others. */}
                      <SelectItem value={OrganizationType.UNIVERSITY}>University</SelectItem>
                      <SelectItem value={OrganizationType.ORGANIZATION}>Organization</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="org-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
