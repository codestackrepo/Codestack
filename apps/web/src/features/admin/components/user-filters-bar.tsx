import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Role } from '@/types/common';

export interface UserFilters {
  role?: Role;
  isActive?: boolean;
  q?: string;
}

const ANY = '__any__';

/**
 * Role / status / search for the People table.
 *
 * Every change resets the page to 1 via `onChange` — filtering while on page 4 of
 * an unfiltered list otherwise lands on an empty page that looks like "no
 * results" for the filter rather than "no page 4".
 */
export function UserFiltersBar({
  filters,
  onChange,
}: {
  filters: UserFilters;
  onChange: (next: UserFilters) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.q ?? ''}
          onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
          placeholder="Search name or email"
          className="pl-9"
          aria-label="Search people"
        />
      </div>

      <Select
        value={filters.role ?? ANY}
        onValueChange={(v) => onChange({ ...filters, role: v === ANY ? undefined : (v as Role) })}
      >
        <SelectTrigger className="sm:w-40" aria-label="Filter by role">
          <SelectValue placeholder="Any role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any role</SelectItem>
          <SelectItem value={Role.ADMIN}>Admin</SelectItem>
          <SelectItem value={Role.PROFESSOR}>Professor</SelectItem>
          <SelectItem value={Role.STUDENT}>Student</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.isActive === undefined ? ANY : String(filters.isActive)}
        onValueChange={(v) =>
          onChange({ ...filters, isActive: v === ANY ? undefined : v === 'true' })
        }
      >
        <SelectTrigger className="sm:w-40" aria-label="Filter by status">
          <SelectValue placeholder="Any status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any status</SelectItem>
          <SelectItem value="true">Active</SelectItem>
          <SelectItem value="false">No access</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
