import { Check, MessageSquareText, Pencil } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { User } from '@/types/user';
import { formatScore, scorePercent, type ProblemScore, type StudentScore } from '../types';

interface GradebookTableProps {
  students: StudentScore[];
  studentsById: Map<string, User>;
  canEdit: boolean;
  onEdit: (studentId: string, studentName: string, problem: ProblemScore) => void;
}

export function GradebookTable({ students, studentsById, canEdit, onEdit }: GradebookTableProps) {
  // Every StudentScore lists the same assignment-problems in creation order —
  // use the first student's list for the column headers.
  const columns = students[0]?.problems ?? [];

  return (
    <div className="custom-scrollbar overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="sticky left-0 z-10 bg-muted/50 backdrop-blur">Student</TableHead>
            {columns.map((p) => (
              <TableHead key={p.assignmentProblemId} className="text-center">
                <span className="line-clamp-1 max-w-40" title={p.title || 'Untitled problem'}>
                  {p.title || 'Untitled problem'}
                </span>
                <span className="font-normal text-muted-foreground">
                  / {formatScore(p.maxScore)}
                </span>
              </TableHead>
            ))}
            <TableHead className="text-right">Final</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student) => {
            const user = studentsById.get(student.userId);
            const name = user
              ? `${user.firstName} ${user.lastName}`.trim() || user.email
              : student.userId;
            const byAp = new Map(student.problems.map((p) => [p.assignmentProblemId, p]));
            const pct = scorePercent(
              student.assignmentScore.finalScore,
              student.assignmentScore.maxScore,
            );
            return (
              <TableRow key={student.userId}>
                <TableCell className="sticky left-0 z-10 bg-card">
                  <div className="font-medium">{name}</div>
                  {user && <div className="text-xs text-muted-foreground">{user.email}</div>}
                </TableCell>

                {columns.map((col) => {
                  const p = byAp.get(col.assignmentProblemId) ?? col;
                  return (
                    <TableCell key={col.assignmentProblemId} className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {p.solved && (
                          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        )}
                        <span className={cn(p.score > 0 ? 'font-medium' : 'text-muted-foreground')}>
                          {formatScore(p.score)}
                        </span>
                        {p.feedback && (
                          <MessageSquareText
                            className="size-3 text-muted-foreground"
                            aria-label="Has feedback"
                          />
                        )}
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground"
                            aria-label={`Edit ${name}'s score for ${p.title || 'this problem'}`}
                            onClick={() => onEdit(student.userId, name, p)}
                          >
                            <Pencil />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  );
                })}

                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-semibold">
                      {formatScore(student.assignmentScore.finalScore)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      / {formatScore(student.assignmentScore.maxScore)}
                    </span>
                    <Badge variant="secondary" className="tabular-nums">
                      {Math.round(pct)}%
                    </Badge>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
