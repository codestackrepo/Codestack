import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { classroomsApi } from '../api/classrooms.api';
import { parseApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import type { CreateClassroomInput } from '@/types/classroom';

const classroomSchema = z
  .object({
    courseId: z.string().min(1, 'Course ID is required').max(255),
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().max(2000).optional(),
    term: z.string().max(50).optional(),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
  })
  .superRefine((val, ctx) => {
    if (val.startDate && val.endDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date must be on or after the start date.',
      });
    }
  });

type ClassroomFormValues = z.infer<typeof classroomSchema>;

/** ISO datetime string -> YYYY-MM-DD for a <input type="date">. */
function toDateInput(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

export function ClassroomFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ['classrooms', id],
    queryFn: () => classroomsApi.getById(id!),
    enabled: isEdit,
  });

  const form = useForm<ClassroomFormValues>({
    resolver: zodResolver(classroomSchema),
    defaultValues: {
      courseId: '',
      title: '',
      description: '',
      term: '',
      startDate: '',
      endDate: '',
    },
  });

  // Seed the form once the existing classroom loads (edit mode).
  useEffect(() => {
    if (!existing) return;
    form.reset({
      courseId: existing.courseId,
      title: existing.title,
      description: existing.description ?? '',
      term: existing.term ?? '',
      startDate: toDateInput(existing.startDate),
      endDate: toDateInput(existing.endDate),
    });
  }, [existing, form]);

  const mutation = useMutation({
    mutationFn: (values: ClassroomFormValues) => {
      // Only the scalar fields — membership is managed via dedicated endpoints,
      // and the update DTO treats studentIds/graderIds as additive.
      const payload: CreateClassroomInput = {
        courseId: values.courseId.trim(),
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        term: values.term?.trim() || undefined,
        startDate: new Date(values.startDate).toISOString(),
        endDate: new Date(values.endDate).toISOString(),
      };
      return isEdit ? classroomsApi.update(id, payload) : classroomsApi.create(payload);
    },
    onSuccess: (classroom) => {
      toast.success(isEdit ? 'Classroom updated.' : 'Classroom created.');
      void queryClient.invalidateQueries({ queryKey: ['classrooms', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['classrooms', classroom.id] });
      navigate(`/home/classrooms/${classroom.id}`);
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });

  const backTo = isEdit ? `/home/classrooms/${id}` : '/home/classrooms';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to={backTo}>
          <ArrowLeft className="size-4" /> Back
        </Link>
      </Button>

      <PageHeader
        title={isEdit ? 'Edit classroom' : 'New classroom'}
        description={
          isEdit
            ? 'Update this classroom’s details.'
            : 'Create a classroom to organise coursework and students.'
        }
      />

      {isEdit && isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <Card>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
                className="space-y-5"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="courseId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Course ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. CS101" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="term"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Term</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Fall 2026" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Introduction to Programming" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="What this course covers…"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button asChild type="button" variant="outline">
                    <Link to={backTo}>Cancel</Link>
                  </Button>
                  <Button
                    type="submit"
                    disabled={mutation.isPending}
                    className="bg-brand text-brand-foreground hover:bg-brand/90"
                  >
                    {mutation.isPending
                      ? 'Saving…'
                      : isEdit
                        ? 'Save changes'
                        : 'Create classroom'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
