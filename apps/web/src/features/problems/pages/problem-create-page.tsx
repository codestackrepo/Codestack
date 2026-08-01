import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { MarkdownEditor } from '@/components/shared/markdown-editor';
import { PageHeader } from '@/components/shared/page-header';
import { useModuleAccess } from '@/features/auth/hooks/use-module-access';
import { parseApiError } from '@/lib/api-client';
import {
  Difficulty,
  IO_PRIMITIVES,
  ProblemScope,
  ProblemVisibility,
  TestCaseType,
  type IoParam,
  type IoType,
  type TestCaseInput,
} from '@/types/problem';
import { FeatureKey } from '@/types/entitlement';
import { problemsApi } from '../api/problems.api';

/** Comma/newline separated free text -> a deduped, trimmed list. */
const parseList = (raw: string): string[] =>
  Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );

/**
 * The IoType union rendered as ONE flat dropdown.
 *
 * The wire form is `'int'` or `{array:'int'}` or `{matrix:'int'}` — a shape/primitive
 * pair. Two coupled selects would let an author sit in a half-chosen state and would
 * make "scalar" need a disabled second control; fifteen flat options is the whole
 * domain, and every one of them is valid.
 */
const IO_TYPE_OPTIONS: { label: string; value: string; io: IoType }[] = [
  ...IO_PRIMITIVES.map((p) => ({ label: p, value: p, io: p as IoType })),
  ...IO_PRIMITIVES.map((p) => ({
    label: `${p}[]`,
    value: `array:${p}`,
    io: { array: p } as IoType,
  })),
  ...IO_PRIMITIVES.map((p) => ({
    label: `${p}[][]`,
    value: `matrix:${p}`,
    io: { matrix: p } as IoType,
  })),
];

const ioValue = (t: IoType): string =>
  typeof t === 'string' ? t : 'array' in t ? `array:${t.array}` : `matrix:${t.matrix}`;

const ioFromValue = (v: string): IoType => IO_TYPE_OPTIONS.find((o) => o.value === v)?.io ?? 'int';

const blankParam = (): IoParam => ({ name: '', type: 'int' });

const blankCase = (): TestCaseInput => ({
  inputData: '',
  expectedOutput: '',
  type: TestCaseType.SAMPLE,
  explanation: '',
});

/**
 * Author a problem.
 *
 * The API for this shipped long ago (`POST /problems`, gated by
 * `problems.author`), and the platform's own global-catalog page even told the
 * reader to "create one from the problems section with scope set to global" — but no
 * create screen existed anywhere in the app. This is that screen.
 *
 * TEST CASES ARE PART OF THE SAME REQUEST, not a follow-up. `CreateProblemDto` accepts
 * them and creates them in one transaction; posting them separately would let a
 * problem exist that no submission can be judged against, and there is no UI to
 * repair that state.
 */
export function ProblemCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  /*
   * Gate the scope control on the FEATURE, not on `role === superadmin`.
   *
   * `problems.global` has an empty role ceiling, so the resolver already answers
   * "may this actor author into the global catalog" — and that is the exact question
   * `@RequiresFeature(PROBLEMS_GLOBAL)` asks server-side. Reimplementing it as a role
   * comparison here would be a second copy of the rule that can drift from the first.
   */
  const { canAccessFeature } = useModuleAccess();
  const canAuthorGlobal = canAccessFeature(FeatureKey.PROBLEMS_GLOBAL);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.EASY);
  const [visibility, setVisibility] = useState<ProblemVisibility>(ProblemVisibility.SHARED);
  const [scope, setScope] = useState<ProblemScope>(ProblemScope.ORG);
  const [tags, setTags] = useState('');
  const [companies, setCompanies] = useState('');
  const [cases, setCases] = useState<TestCaseInput[]>([blankCase()]);
  // Judge signature. Empty functionName = a prose-only problem, which is valid and is
  // what the whole section defaults to.
  const [functionName, setFunctionName] = useState('');
  const [params, setParams] = useState<IoParam[]>([blankParam()]);
  const [returns, setReturns] = useState<IoType>('int');

  const create = useMutation({
    mutationFn: () =>
      problemsApi.create({
        title: title.trim(),
        body,
        difficulty,
        visibility,
        // Only a superadmin may say `global`, and only they are offered the control.
        // Sending `org` explicitly is harmless and matches the server default.
        scope: canAuthorGlobal ? scope : undefined,
        tags: parseList(tags),
        companies: parseList(companies),
        // Both or neither: the server 400s `incomplete_judge_spec` otherwise, so the
        // client must not send a name with no signature just because a field was typed
        // in and then cleared.
        ...(judgeReady
          ? {
              functionName: functionName.trim(),
              ioSpec: { params: namedParams, returns },
            }
          : {}),
        // Blank rows are dropped rather than rejected: an author who added a row and
        // changed their mind should not have to delete it to save.
        testCases: cases
          .filter((c) => c.inputData.trim() !== '' || c.expectedOutput.trim() !== '')
          .map((c) => ({ ...c, explanation: c.explanation?.trim() || undefined })),
      }),
    onSuccess: (problem) => {
      void queryClient.invalidateQueries({ queryKey: ['problems'] });
      toast.success('Problem created');
      navigate(`/home/problems/${problem.id}`);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  // Rows the author actually filled in. A blank row is "not finished with this form
  // yet", not an error to block on.
  const namedParams = params.filter((p) => p.name.trim() !== '');
  const judgeReady = functionName.trim() !== '' && namedParams.length > 0;

  const patchParam = (i: number, patch: Partial<IoParam>) =>
    setParams((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const patchCase = (i: number, patch: Partial<TestCaseInput>) =>
    setCases((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const valid =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    // A typed name with no parameters is the one state the server rejects outright;
    // blocking here turns a 400 into a disabled button with an explanation above it.
    (functionName.trim() === '' || namedParams.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="New problem"
        description="Statement, difficulty and the test cases it is judged against."
      />

      <Card className="space-y-4 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Second largest element"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="body">Statement</Label>
          <MarkdownEditor
            id="body"
            value={body}
            onChange={setBody}
            rows={12}
            placeholder={'Given an array of integers, return the second largest distinct value.'}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Difficulty</Label>
            <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(Difficulty).map((d) => (
                  <SelectItem key={d} value={d} className="capitalize">
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as ProblemVisibility)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ProblemVisibility.SHARED}>Shared with my org</SelectItem>
                <SelectItem value={ProblemVisibility.PRIVATE}>Private to me</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Scope is SuperAdmin-only: `problems.global` has an EMPTY role ceiling, so
              for anyone else this control would 403 the moment it was used. */}
          {canAuthorGlobal && (
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as ProblemScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ProblemScope.ORG}>This organization</SelectItem>
                  <SelectItem value={ProblemScope.GLOBAL}>Global catalog</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Global is visible to every tenant.</p>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tags">Topics</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="arrays, sorting"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="companies">Companies</Label>
            <Input
              id="companies"
              value={companies}
              onChange={(e) => setCompanies(e.target.value)}
              placeholder="Optional, comma separated"
            />
          </div>
        </div>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">
            Judge signature{' '}
            <span className="text-sm font-normal text-muted-foreground">
              {judgeReady ? '— this problem can be judged' : '— optional'}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">
            The entry point solvers implement. Drivers and starter code for every language are
            generated from it. Leave the name blank for a prose-only problem — it will be browsable
            but Submit stays disabled.
          </p>
        </div>

        <Card className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="fn">Function name</Label>
            <Input
              id="fn"
              value={functionName}
              onChange={(e) => setFunctionName(e.target.value)}
              placeholder="secondLargest"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Letters, digits and underscores; must not start with a digit. It is written straight
              into the generated driver, so reserved words like <code>class</code> are refused.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Parameters</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setParams((p) => [...p, blankParam()])}
              >
                <Plus className="size-4" /> Add parameter
              </Button>
            </div>
            {params.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  value={p.name}
                  onChange={(e) => patchParam(i, { name: e.target.value })}
                  placeholder="nums"
                  className="w-full font-mono sm:w-56"
                />
                <Select
                  value={ioValue(p.type)}
                  onValueChange={(v) => patchParam(i, { type: ioFromValue(v) })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IO_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="font-mono">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground"
                  disabled={params.length === 1}
                  onClick={() => setParams((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Returns</Label>
            <Select value={ioValue(returns)} onValueChange={(v) => setReturns(ioFromValue(v))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IO_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="font-mono">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {functionName.trim() !== '' && namedParams.length === 0 && (
            <p className="text-sm text-destructive">
              A named function needs at least one parameter — the server refuses half a signature.
            </p>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">Test cases</h2>
            <p className="text-sm text-muted-foreground">
              Sample cases are shown to solvers; hidden ones only judge. Output is compared after
              trimming trailing whitespace.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setCases((c) => [...c, blankCase()])}
          >
            <Plus className="size-4" /> Add case
          </Button>
        </div>

        {cases.map((c, i) => (
          <Card key={i} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <Select
                value={c.type}
                onValueChange={(v) => patchCase(i, { type: v as TestCaseType })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TestCaseType.SAMPLE}>Sample</SelectItem>
                  <SelectItem value={TestCaseType.HIDDEN}>Hidden</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground"
                // Never remove the last row: an empty list reads as a broken form, and
                // a blank row is dropped on submit anyway.
                disabled={cases.length === 1}
                onClick={() => setCases((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-4" /> Remove
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Input</Label>
                <Textarea
                  rows={3}
                  className="font-mono text-sm"
                  value={c.inputData}
                  onChange={(e) => patchCase(i, { inputData: e.target.value })}
                  placeholder="[1, 2, 3, 4]"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expected output</Label>
                <Textarea
                  rows={3}
                  className="font-mono text-sm"
                  value={c.expectedOutput}
                  onChange={(e) => patchCase(i, { expectedOutput: e.target.value })}
                  placeholder="3"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Explanation (optional)</Label>
              <Input
                value={c.explanation ?? ''}
                onChange={(e) => patchCase(i, { explanation: e.target.value })}
                placeholder="Shown with sample cases."
              />
            </div>
          </Card>
        ))}
      </section>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate('/home/problems')}>
          Cancel
        </Button>
        <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Creating…' : 'Create problem'}
        </Button>
      </div>
    </div>
  );
}
