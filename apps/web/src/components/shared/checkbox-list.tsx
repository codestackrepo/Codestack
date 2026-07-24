import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface CheckboxListItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
}

/**
 * A scrollable multi-select rendered as a list of checkboxes. Selection state
 * is fully controlled by the caller (`selectedIds` + `onToggle`).
 */
export function CheckboxList({
  items,
  selectedIds,
  onToggle,
  className,
}: {
  items: CheckboxListItem[];
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
  className?: string;
}) {
  const selected = new Set(selectedIds);
  return (
    <div
      className={cn(
        'max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1',
        className,
      )}
    >
      {items.map((item) => (
        <label
          key={item.id}
          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60"
        >
          <Checkbox
            checked={selected.has(item.id)}
            onCheckedChange={(v) => onToggle(item.id, v === true)}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{item.label}</span>
            {item.description && (
              <span className="block truncate text-xs text-muted-foreground">
                {item.description}
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}
