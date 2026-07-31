import { cn } from '@/lib/utils';

/**
 * The switch used in every access matrix cell.
 *
 * Extracted from `module-access-matrix.tsx` when #70 added the per-org platform
 * matrices: there is no `ui/switch` primitive in this project, and a second copy of
 * this markup would be a second place for the checked/disabled styling and the
 * `role="switch"` + `aria-checked` pairing to drift.
 *
 * A plain `<button role="switch">` rather than a checkbox: the control commits
 * immediately (each toggle is its own PATCH), so there is no form to submit and
 * nothing for a checkbox's name/value to contribute.
 */
export function CellToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        checked ? 'bg-brand' : 'bg-muted-foreground/30',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span
        className={cn(
          'inline-block size-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
