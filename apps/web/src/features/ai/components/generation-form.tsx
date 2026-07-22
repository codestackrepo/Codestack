import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { FileText, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { aiApi } from '../api/ai.api';
import type { GenerationRequest } from '../types';

const ACCEPTED_EXTENSIONS = '.pdf,.txt,.md,.docx';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — server rejects larger with 413.

const MODE = { PROMPT: 'prompt', FILE: 'file' } as const;
type Mode = (typeof MODE)[keyof typeof MODE];

const generateSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(1, 'Topic is required')
    .max(255, 'Keep the topic under 255 characters'),
  prompt: z.string().max(8000, 'Keep study material under 8000 characters').optional(),
  count: z.number().int().min(1).max(3),
});

type GenerateFormValues = z.infer<typeof generateSchema>;

export function GenerationForm({
  onGenerated,
}: {
  onGenerated: (generation: GenerationRequest) => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(MODE.PROMPT);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [entitlementBlocked, setEntitlementBlocked] = useState(false);

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateSchema),
    defaultValues: { topic: '', prompt: '', count: 2 },
  });

  const mutation = useMutation({
    mutationFn: aiApi.create,
    onSuccess: (generation) => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'generations'] });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      form.resetField('prompt');
      toast.success('Generation queued — watch its progress on the right.');
      onGenerated(generation);
    },
    onError: (error) => {
      const body = parseApiError(error);
      if (body.reason === 'entitlement_required' && body.entitlement === 'ai') {
        setEntitlementBlocked(true);
        return;
      }
      toast.error(body.message);
    },
  });

  function handleFileChange(selected: File | null) {
    setFileError(null);
    if (selected && selected.size > MAX_FILE_BYTES) {
      setFile(null);
      setFileError('File is larger than the 10 MB limit.');
      return;
    }
    setFile(selected);
  }

  function onSubmit(values: GenerateFormValues) {
    setEntitlementBlocked(false);

    if (mode === MODE.PROMPT) {
      if (!values.prompt || values.prompt.trim().length === 0) {
        form.setError('prompt', { message: 'Add some study material to generate from' });
        return;
      }
    } else if (!file) {
      setFileError('Choose a file to generate from');
      return;
    }

    mutation.mutate({
      topic: values.topic,
      count: values.count,
      prompt: mode === MODE.PROMPT ? values.prompt : undefined,
      file: mode === MODE.FILE ? file : null,
    });
  }

  if (entitlementBlocked) {
    return (
      <Card className="border-brand/40">
        <CardHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-brand/15 text-brand">
            <Sparkles className="size-5" />
          </div>
          <CardTitle>You've reached your free AI limit</CardTitle>
          <CardDescription>
            You've used your free monthly AI generations. Upgrade for unlimited AI-generated
            problems.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
            <Link to="/home/billing">
              <Sparkles className="size-4" />
              Upgrade to generate with AI
            </Link>
          </Button>
          <Button variant="ghost" onClick={() => setEntitlementBlocked(false)}>
            Back to form
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand" />
          Generate problems
        </CardTitle>
        <CardDescription>
          Describe a topic and provide study material or a document. We&apos;ll draft, solve and
          validate new practice problems.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="topic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topic</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Binary search on answer" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <Label>Source</Label>
              <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value={MODE.PROMPT}>
                    <FileText className="size-3.5" />
                    Prompt
                  </TabsTrigger>
                  <TabsTrigger value={MODE.FILE}>
                    <Upload className="size-3.5" />
                    Upload file
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {mode === MODE.PROMPT ? (
                <FormField
                  control={form.control}
                  name="prompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          rows={7}
                          placeholder="Paste study material, notes, or a description of the problems you want…"
                          className="custom-scrollbar max-h-64"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>Up to 8000 characters.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    className="sr-only"
                    id="ai-source-file"
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{file.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(0)} KB
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove file"
                        onClick={() => {
                          setFile(null);
                          setFileError(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <label
                      htmlFor="ai-source-file"
                      className={cn(
                        'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-8 text-center transition-colors hover:bg-accent',
                      )}
                    >
                      <Upload className="size-5 text-muted-foreground" />
                      <span className="text-sm font-medium">Click to upload a document</span>
                      <span className="text-xs text-muted-foreground">
                        PDF, DOCX, TXT or MD — up to 10 MB
                      </span>
                    </label>
                  )}
                  {fileError && <p className="text-sm text-destructive">{fileError}</p>}
                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name="count"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number of problems</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[1, 2, 3].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} problem{n > 1 ? 's' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
