import { Check, Eye, MessageSquareText } from 'lucide-react';
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
import {
  GRADING_STATUS_LABEL,
  ITEM_KIND_LABEL,
  formatScore,
  scorePercent,
  type ItemScore,
  type StudentScore,
} from '../types';

interface GradebookTableProps {
  students: StudentScore[];
  studentsById: Map<string, User>;
  canEdit: boolean;
  onReview: (studentId: string, studentName: string, item: ItemScore) => void;
}

export function GradebookTable({ students, studentsById, canEdit, onReview }: GradebookTableProps) {
  // Every StudentScore lists the same items in order — use the first student's
  // list for the column headers.
  const columns = students[0]?.items ?? [];

  return (
    <div className="custom-scrollbar overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <Table density="compact">
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="sticky left-0 z-10 bg-muted/50 backdrop-blur">Student</TableHead>
            {columns.map((item) => (
              <TableHead key={item.itemId} className="text-center">
                <span className="line-clamp-1 max-w-40" title={item.title || 'Untitled item'}>
                  {item.title || 'Untitled item'}
                </span>
                <span className="flex items-center justify-center gap-1 font-normal text-muted-foreground">
                  <Badge variant="outline" className="px-1 py-0 text-[10px] uppercase">
                    {ITEM_KIND_LABEL[item.kind]}
                  </Badge>
                  / {formatScore(item.maxScore)}
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
            const byItem = new Map(student.items.map((i) => [i.itemId, i]));
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
                  const item = byItem.get(col.itemId) ?? col;
                  return (
                    <TableCell key={col.itemId} className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {item.solved && (
                          <Check className="size-3.5 text-success" />
                        )}
                        {item.score === null ? (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                            {GRADING_STATUS_LABEL[item.gradingStatus]}
                          </Badge>
                        ) : (
                          <span
                            className={cn(item.score > 0 ? 'font-medium' : 'text-muted-foreground')}
                          >
                            {formatScore(item.score)}
                          </span>
                        )}
                        {item.feedback && (
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
                            aria-label={`Review ${name}'s ${item.title || 'item'}`}
                            onClick={() => onReview(student.userId, name, item)}
                          >
                            <Eye />
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
