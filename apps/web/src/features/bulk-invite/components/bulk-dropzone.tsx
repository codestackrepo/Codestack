import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCEPT = '.csv,.xlsx';

/**
 * File picker with native drag-and-drop.
 *
 * A hidden `<input type="file">` behind a `<label>` rather than react-dropzone:
 * that would be a new dependency for about forty lines with no other consumer in
 * the tree. The label keeps it keyboard-accessible for free.
 *
 * `accept` is a convenience, not a check — the server validates by magic bytes,
 * so a renamed `.xlsx` is caught there rather than trusted here.
 */
export function BulkDropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <label
        htmlFor="roster-file"
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-10 text-center transition-colors',
          dragging && 'border-primary bg-primary/5',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Upload className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Drop a roster here, or click to choose</p>
          <p className="text-sm text-muted-foreground">CSV or Excel (.xlsx), up to 2&nbsp;MB</p>
        </div>
        <input
          id="roster-file"
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            // Reset so re-picking the SAME file after a failed upload still fires
            // a change event.
            e.target.value = '';
          }}
        />
      </label>

      <a
        href="/templates/student-roster-template.csv"
        download
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary hover:underline"
      >
        <FileSpreadsheet className="size-4" /> Download the template
      </a>
    </div>
  );
}
