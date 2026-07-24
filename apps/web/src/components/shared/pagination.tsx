import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PaginationMeta } from '@/types/common';

/**
 * Client-side pager for bare arrays (endpoints without a server envelope).
 * Slices `items` into pages and synthesizes a `PaginationMeta` so the same
 * `<Pagination>` UI can drive it. Clamps the page if `items` shrinks.
 */
export function useClientPagination<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const pageItems = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );
  const meta: PaginationMeta = {
    page: current,
    limit: pageSize,
    total,
    totalPages,
    hasNext: current < totalPages,
    hasPrev: current > 1,
  };
  return { pageItems, meta, setPage };
}

interface PaginationProps {
  /** The `meta` from a `PaginatedResult`. */
  meta: PaginationMeta | undefined;
  /** Called with the target page (1-based). */
  onPageChange: (page: number) => void;
  /** Disable the buttons while a mutation/fetch is in flight. */
  busy?: boolean;
  /** Plural noun for the count line, e.g. "users", "problems". */
  noun?: string;
  className?: string;
}

/**
 * Shared list pager over a server `PaginatedResult` envelope. Renders a
 * "Page X of Y · N items" line plus Prev/Next. Returns null for a single page.
 */
export function Pagination({
  meta,
  onPageChange,
  busy = false,
  noun = 'items',
  className,
}: PaginationProps) {
  if (!meta || meta.totalPages <= 1) return null;

  return (
    <div className={cn('flex items-center justify-between gap-3 text-sm', className)}>
      <p className="text-muted-foreground">
        Page <span className="font-medium text-foreground">{meta.page}</span> of {meta.totalPages}
        <span className="hidden sm:inline"> · {meta.total} {noun}</span>
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!meta.hasPrev || busy}
          onClick={() => onPageChange(Math.max(1, meta.page - 1))}
        >
          <ChevronLeft className="size-4" /> Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!meta.hasNext || busy}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
