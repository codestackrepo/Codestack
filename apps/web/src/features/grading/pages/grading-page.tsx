import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, Users } from 'lucide-react';
import { classroomsApi } from '@/features/classrooms/api/classrooms.api';
import { assignmentsApi } from '@/features/assignments/api/assignments.api';
import { useAuth } from '@/features/auth/context/auth-context';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parseApiError } from '@/lib/api-client';
import { STAFF_ROLES } from '@/types/common';
import type { User } from '@/types/user';
import { gradingApi } from '../api/grading.api';
import { GradebookTable } from '../components/gradebook-table';
import { ScoreDistributionChart } from '../components/score-distribution-chart';
import { EditScoreDialog } from '../components/edit-score-dialog';
import { formatScore, scorePercent, type ProblemScore } from '../types';

interface EditTarget {
  studentId: string;
  studentName: string;
  problem: ProblemScore;
}

export function GradingPage() {
  const { user } = useAuth();
  const isStaff = !!user && STAFF_ROLES.includes(user.role);

  const [classroomId, setClassroomId] = useState<string | null>(null);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const classroomsQuery = useQuery({
    queryKey: ['grading', 'classrooms'],
    queryFn: () => classroomsApi.list(1, 100),
    enabled: isStaff,
  });

  const assignmentsQuery = useQuery({
    queryKey: ['grading', 'assignments', classroomId],
    queryFn: () => assignmentsApi.list({ classroomId: classroomId!, limit: 100 }),
    enabled: isStaff && !!classroomId,
  });

  // Roster is needed to resolve the scores' userId -> student name/email, since
  // the grading endpoints return only userId.
  const classroomDetailQuery = useQuery({
    queryKey: ['grading', 'classroom-detail', classroomId],
    queryFn: () => classroomsApi.getById(classroomId!),
    enabled: isStaff && !!classroomId,
  });

  const scoresQuery = useQuery({
    queryKey: ['grading', 'students-scores', assignmentId],
    queryFn: () => gradingApi.studentsScores(assignmentId!),
    enabled: isStaff && !!assignmentId,
  });

  const studentsById = useMemo(() => {
    const map = new Map<string, User>();
    for (const s of classroomDetailQuery.data?.students ?? []) map.set(s.id, s);
    return map;
  }, [classroomDetailQuery.data]);

  const scores = useMemo(() => scoresQuery.data ?? [], [scoresQuery.data]);

  const summary = useMemo(() => {
    if (scores.length === 0) return null;
    const maxScore = scores[0].assignmentScore.maxScore;
    const totalFinal = scores.reduce((sum, s) => sum + s.assignmentScore.finalScore, 0);
    const totalPct = scores.reduce(
      (sum, s) => sum + scorePercent(s.assignmentScore.finalScore, s.assignmentScore.maxScore),
      0,
    );
    const graded = scores.filter((s) => s.assignmentScore.finalScore > 0).length;
    return {
      count: scores.length,
      maxScore,
      averageFinal: totalFinal / scores.length,
      averagePct: totalPct / scores.length,
      graded,
    };
  }, [scores]);

  function handleClassroomChange(next: string) {
    setClassroomId(next);
    setAssignmentId(null);
  }

  if (!isStaff) {
    return (
      <div className="space-y-6">
        <PageHeading />
        <EmptyState
          title="Staff access only"
          description="The gradebook is available to professors and administrators."
        />
      </div>
    );
  }

  const assignments = assignmentsQuery.data?.data ?? [];
  const classrooms = classroomsQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeading />

      {/* Selectors */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="grading-classroom">Classroom</Label>
          {classroomsQuery.isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <Select value={classroomId ?? undefined} onValueChange={handleClassroomChange}>
              <SelectTrigger id="grading-classroom" className="w-full">
                <SelectValue placeholder="Select a classroom" />
              </SelectTrigger>
              <SelectContent>
                {classrooms.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                    {c.term ? ` · ${c.term}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!classroomsQuery.isLoading && classrooms.length === 0 && (
            <p className="text-xs text-muted-foreground">You have no classrooms yet.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="grading-assignment">Assignment</Label>
          {classroomId && assignmentsQuery.isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <Select
              value={assignmentId ?? undefined}
              onValueChange={setAssignmentId}
              disabled={!classroomId || assignments.length === 0}
            >
              <SelectTrigger id="grading-assignment" className="w-full">
                <SelectValue
                  placeholder={classroomId ? 'Select an assignment' : 'Select a classroom first'}
                />
              </SelectTrigger>
              <SelectContent>
                {assignments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {classroomId && !assignmentsQuery.isLoading && assignments.length === 0 && (
            <p className="text-xs text-muted-foreground">This classroom has no assignments yet.</p>
          )}
        </div>
      </div>

      {/* Body */}
      {!assignmentId ? (
        <EmptyState
          title="Select an assignment"
          description="Choose a classroom and assignment to view its gradebook."
        />
      ) : scoresQuery.isLoading ? (
        <GradebookSkeleton />
      ) : scoresQuery.isError ? (
        <EmptyState
          title="Couldn't load grades"
          description={parseApiError(scoresQuery.error).message}
        />
      ) : scores.length === 0 ? (
        <EmptyState
          title="No students enrolled"
          description="Once students join this classroom their scores will appear here."
        />
      ) : (
        <div className="space-y-6">
          {summary && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Students"
                value={String(summary.count)}
                icon={<Users className="size-4" />}
              />
              <StatCard
                label="Class average"
                value={`${formatScore(summary.averageFinal)} / ${formatScore(summary.maxScore)}`}
              />
              <StatCard label="Average %" value={`${Math.round(summary.averagePct)}%`} />
              <StatCard label="Scored" value={`${summary.graded} / ${summary.count}`} />
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Score distribution</CardTitle>
              <CardDescription>
                Students grouped by percentage of the maximum score.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScoreDistributionChart students={scores} />
            </CardContent>
          </Card>

          <GradebookTable
            students={scores}
            studentsById={studentsById}
            canEdit
            onEdit={(studentId, studentName, problem) =>
              setEditTarget({ studentId, studentName, problem })
            }
          />
        </div>
      )}

      {editTarget && assignmentId && (
        <EditScoreDialog
          key={`${editTarget.studentId}:${editTarget.problem.assignmentProblemId}`}
          assignmentId={assignmentId}
          studentId={editTarget.studentId}
          studentName={editTarget.studentName}
          problem={editTarget.problem}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

function PageHeading() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <GraduationCap className="size-5" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Gradebook</h1>
        <p className="text-sm text-muted-foreground">
          Review and adjust student scores for an assignment.
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums">{value}</p>
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardContent>
    </Card>
  );
}

function GradebookSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
