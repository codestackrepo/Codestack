import { useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { assignmentsApi } from '../api/assignments.api';
import { classroomsApi } from '@/features/classrooms/api/classrooms.api';
import { batchesApi } from '@/features/classrooms/api/batches.api';
import { parseApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import { CheckboxList } from '@/components/shared/checkbox-list';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  AssignmentKind,
  AssignmentTargetType,
  type CreateAssignmentInput,
} from '@/types/assignment';

const assignmentSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().max(5000).optional(),
    classroomId: z.string().min(1, 'Select a classroom'),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    kind: z.enum(['assignment', 'test']),
    targetType: z.enum(['classroom', 'batch']),
    // Kept as the raw <input> string; validated/converted below and on submit.
    durationMinutes: z.string().optional(),
    targetBatchIds: z.array(z.string()),
    asDraft: z.boolean(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'test') {
      const n = Number(val.durationMinutes);
      if (!val.durationMinutes || !Number.isInteger(n) || n < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['durationMinutes'],
          message: 'Enter a duration of at least 1 minute.',
        });
      }
    }
    if (val.targetType === 'batch' && val.targetBatchIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetBatchIds'],
        message: 'Select at least one batch.',
      });
    }
    if (val.startDate && val.endDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End must be on or after the start.',
      });
    }
  });

type AssignmentFormValues = z.infer<typeof assignmentSchema>;

/** ISO -> local "YYYY-MM-DDTHH:mm" for a <input type="datetime-local">. */
function toDateTimeLocal(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** A two-option segmented toggle (Kind / Target). */
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  /** `disabled` marks an option that cannot be chosen YET; `title` says why. */
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
}) {
  return (
    <div className="inline-flex w-fit rounded-lg bg-muted p-[3px]">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-active={value === opt.value}
          disabled={opt.disabled}
          title={opt.title}
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-md px-3.5 py-1 text-sm font-medium text-foreground/60 transition-colors',
            'hover:text-foreground data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm',
            'disabled:pointer-events-none disabled:opacity-40',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function AssignmentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const queryClassroomId = searchParams.get('classroomId') ?? '';

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['assignments', id],
    queryFn: () => assignmentsApi.getById(id!),
    enabled: isEdit,
  });

  const form = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      title: '',
      description: '',
      classroomId: queryClassroomId,
      startDate: '',
      endDate: '',
      kind: AssignmentKind.ASSIGNMENT,
      targetType: AssignmentTargetType.CLASSROOM,
      durationMinutes: '',
      targetBatchIds: [],
      asDraft: false,
    },
  });

  // Seed from the existing assignment (edit mode).
  useEffect(() => {
    if (!existing) return;
    form.reset({
      title: existing.title,
      description: existing.description ?? '',
      classroomId: existing.classroomId,
      startDate: toDateTimeLocal(existing.startDate),
      endDate: toDateTimeLocal(existing.endDate),
      kind: existing.kind,
      targetType: existing.targetType,
      durationMinutes: existing.durationMinutes != null ? String(existing.durationMinutes) : '',
      targetBatchIds: existing.targetBatchIds ?? [],
      asDraft: false,
    });
  }, [existing, form]);

  const classroomId = form.watch('classroomId');
  const kind = form.watch('kind');
  const targetType = form.watch('targetType');

  // Classroom is fixed when editing or when arriving with ?classroomId=.
  const classroomFixed = isEdit || !!queryClassroomId;
  const fixedClassroomId = isEdit ? (existing?.classroomId ?? '') : queryClassroomId;

  const { data: fixedClassroom } = useQuery({
    queryKey: ['classrooms', fixedClassroomId],
    queryFn: () => classroomsApi.getById(fixedClassroomId),
    enabled: classroomFixed && !!fixedClassroomId,
  });

  const { data: classroomsList } = useQuery({
    queryKey: ['classrooms', 'list', 'all'],
    queryFn: () => classroomsApi.list(1, 100),
    enabled: !classroomFixed,
  });

  const { data: batches } = useQuery({
    queryKey: ['batches', classroomId],
    queryFn: () => batchesApi.list(classroomId),
    enabled: !!classroomId,
  });

  const mutation = useMutation({
    mutationFn: (values: AssignmentFormValues) => {
      const payload: CreateAssignmentInput = {
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        classroomId: values.classroomId,
        startDate: new Date(values.startDate).toISOString(),
        endDate: new Date(values.endDate).toISOString(),
        kind: values.kind,
        targetType: values.targetType,
        durationMinutes:
          values.kind === AssignmentKind.TEST ? Number(values.durationMinutes) : undefined,
        targetBatchIds:
          values.targetType === AssignmentTargetType.BATCH ? values.targetBatchIds : undefined,
      };
      if (!isEdit) payload.asDraft = values.asDraft;
      return isEdit ? assignmentsApi.update(id, payload) : assignmentsApi.create(payload);
    },
    onSuccess: (assignment) => {
      toast.success(isEdit ? 'Assignment updated.' : 'Assignment created.');
      void queryClient.invalidateQueries({ queryKey: ['assignments', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments', assignment.id] });
      // #22 builder — may not exist yet; the catch-all route handles that.
      navigate(`/home/assignments/${assignment.id}/build`);
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });

  const backTo = '/home/assignments';

  if (isEdit && loadingExisting) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to={backTo}>
          <ArrowLeft className="size-4" /> Back to assignments
        </Link>
      </Button>

      <PageHeader
        title={isEdit ? 'Edit assignment' : 'New assignment'}
        description="Set the schedule and audience. You'll add problems in the next step."
      />

      <Card>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
              className="space-y-5"
            >
              {/* Classroom */}
              {classroomFixed ? (
                <FormItem>
                  <FormLabel>Classroom</FormLabel>
                  <div className="flex h-8 items-center rounded-lg border border-input bg-muted/40 px-2.5 text-sm text-muted-foreground">
                    {fixedClassroom
                      ? `${fixedClassroom.title} (${fixedClassroom.courseId})`
                      : 'Loading…'}
                  </div>
                </FormItem>
              ) : (
                <FormField
                  control={form.control}
                  name="classroomId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Classroom</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          // Batches are classroom-scoped — reset the selection.
                          form.setValue('targetBatchIds', []);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a classroom" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {classroomsList?.data.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.title} ({c.courseId})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Week 3 — Recursion" {...field} />
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
                      <Textarea rows={3} placeholder="Instructions for students…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Kind */}
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Segmented
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: AssignmentKind.ASSIGNMENT, label: 'Assignment' },
                        { value: AssignmentKind.TEST, label: 'Test' },
                      ]}
                    />
                    <FormDescription>
                      A test is timed — students get a fixed window once they start.
                    </FormDescription>
                  </FormItem>
                )}
              />

              {kind === AssignmentKind.TEST && (
                <FormField
                  control={form.control}
                  name="durationMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration (minutes)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          placeholder="e.g. 90"
                          className="max-w-40"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Schedule */}
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Opens</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
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
                      <FormLabel>Closes</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Target */}
              <FormField
                control={form.control}
                name="targetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Audience</FormLabel>
                    <Segmented
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: AssignmentTargetType.CLASSROOM, label: 'Whole class' },
                        {
                          value: AssignmentTargetType.BATCH,
                          label: 'Specific batches',
                          // Batches belong to a classroom, so this option cannot be
                          // acted on before one is picked. It used to be selectable,
                          // which left the form showing a chosen audience above the
                          // words "Select a classroom first" — a state that reads as
                          // broken rather than as a step not yet done.
                          disabled: !classroomId,
                          title: !classroomId ? 'Select a classroom first' : undefined,
                        },
                      ]}
                    />
                  </FormItem>
                )}
              />

              {targetType === AssignmentTargetType.BATCH && (
                <FormField
                  control={form.control}
                  name="targetBatchIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Batches
                        <span className="font-normal text-muted-foreground">
                          {field.value.length} selected
                        </span>
                      </FormLabel>
                      {!classroomId ? (
                        <p className="text-sm text-muted-foreground">Select a classroom first.</p>
                      ) : (batches?.length ?? 0) === 0 ? (
                        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                          This classroom has no batches yet. Create one from the classroom page.
                        </p>
                      ) : (
                        <CheckboxList
                          items={(batches ?? []).map((b) => ({
                            id: b.id,
                            label: b.name,
                            description: `${b.studentCount} student${b.studentCount === 1 ? '' : 's'}`,
                          }))}
                          selectedIds={field.value}
                          onToggle={(bid, checked) =>
                            field.onChange(
                              checked
                                ? [...field.value, bid]
                                : field.value.filter((x) => x !== bid),
                            )
                          }
                        />
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Draft (create only) */}
              {!isEdit && (
                <FormField
                  control={form.control}
                  name="asDraft"
                  render={({ field }) => (
                    <FormItem>
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(v) => field.onChange(v === true)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="block text-sm font-medium">Save as draft</span>
                          <span className="block text-xs text-muted-foreground">
                            Hidden from students and won't auto-open by date — publish it manually
                            later.
                          </span>
                        </span>
                      </label>
                    </FormItem>
                  )}
                />
              )}

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
                      : 'Create & add problems'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
