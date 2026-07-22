import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';
import { parseApiError } from '@/lib/api-client';
import { aiApi } from '../api/ai.api';
import { GenerationStatusBadge } from './status-badge';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function PastGenerations({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['ai', 'generations'],
    queryFn: aiApi.list,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="Couldn't load your generations"
        description={parseApiError(error).message}
      />
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No generations yet"
        description="Your past AI generations will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Topic</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Count</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((gen) => (
            <TableRow
              key={gen.id}
              onClick={() => onSelect(gen.id)}
              className={cn(
                'cursor-pointer',
                gen.id === activeId && 'bg-muted/60 hover:bg-muted/60',
              )}
            >
              <TableCell className="max-w-[16rem] truncate font-medium">{gen.topic}</TableCell>
              <TableCell>
                <Badge variant="outline" className="uppercase">
                  {gen.sourceType}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{gen.requestedCount}</TableCell>
              <TableCell>
                <GenerationStatusBadge status={gen.status} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDate(gen.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
