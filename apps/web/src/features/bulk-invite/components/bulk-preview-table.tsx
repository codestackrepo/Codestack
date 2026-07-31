import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { RosterAction, type RosterPreview, type RosterRow, type RosterRowError } from '@/types/bulk';

/**
 * The reviewed roster, split by outcome.
 *
 * "Will be asked to join" is its OWN tab, not folded in with the invites,
 * because it is a materially different action: those people already have an
 * account, nothing happens to it, and they have to click. Presenting the two
 * together would let an admin believe they had added someone when they had only
 * asked.
 */
export function BulkPreviewTable({ preview }: { preview: RosterPreview }) {
  const rows = (action: RosterAction): RosterRow[] =>
    preview.rows.filter((r) => r.action === action);

  const invites = rows(RosterAction.INVITE);
  const claims = rows(RosterAction.CLAIM);
  const skipped = rows(RosterAction.SKIP);
  const errored = rows(RosterAction.ERROR);

  return (
    <Tabs defaultValue="invite">
      <TabsList>
        <TabsTrigger value="invite">Will invite ({invites.length})</TabsTrigger>
        <TabsTrigger value="claim">Will be asked to join ({claims.length})</TabsTrigger>
        <TabsTrigger value="skip">Skipped ({skipped.length})</TabsTrigger>
        <TabsTrigger value="error">Errors ({errored.length + preview.errors.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="invite">
        <RowTable rows={invites} empty="Nobody new in this file." />
      </TabsContent>
      <TabsContent value="claim">
        {claims.length === 0 ? (
          <EmptyState title="Nobody to ask" description="No existing accounts matched this file." />
        ) : (
          <>
            <p className="px-1 pb-3 pt-1 text-sm text-muted-foreground">
              These people already have a CodeStack account with no organization. They will get an
              invitation to join — their account is not moved until they accept.
            </p>
            <RowTable rows={claims} empty="" />
          </>
        )}
      </TabsContent>
      <TabsContent value="skip">
        <RowTable rows={skipped} showReason empty="Nothing was skipped." />
      </TabsContent>
      <TabsContent value="error">
        <ErrorTable rows={errored} parseErrors={preview.errors} />
      </TabsContent>
    </Tabs>
  );
}

function RowTable({
  rows,
  empty,
  showReason,
}: {
  rows: RosterRow[];
  empty: string;
  showReason?: boolean;
}) {
  if (rows.length === 0) {
    return empty ? <EmptyState title={empty} description="" /> : null;
  }
  return (
    <div className="rounded-lg border border-border">
      <Table density="compact">
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Row</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Name</TableHead>
            {showReason && <TableHead>Why</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.rowNumber}>
              <TableCell className="text-muted-foreground">{r.rowNumber}</TableCell>
              <TableCell className="font-medium">{r.email}</TableCell>
              <TableCell className="text-muted-foreground">
                {[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}
              </TableCell>
              {showReason && (
                <TableCell className="text-muted-foreground">{r.message ?? r.reason}</TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Classification errors and parse errors together — both are "this row is out". */
function ErrorTable({ rows, parseErrors }: { rows: RosterRow[]; parseErrors: RosterRowError[] }) {
  const all = [
    ...rows.map((r) => ({ rowNumber: r.rowNumber, email: r.email, message: r.message ?? r.reason })),
    ...parseErrors.map((e) => ({
      rowNumber: e.rowNumber,
      email: e.email ?? '—',
      message: e.message,
    })),
  ].sort((a, b) => a.rowNumber - b.rowNumber);

  if (all.length === 0) {
    return <EmptyState title="No errors" description="Every row in this file is usable." />;
  }
  return (
    <div className="rounded-lg border border-border">
      <Table density="compact">
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Row</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Problem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {all.map((r) => (
            <TableRow key={`${r.rowNumber}-${r.email}`}>
              <TableCell className="text-muted-foreground">{r.rowNumber}</TableCell>
              <TableCell className="font-medium">{r.email}</TableCell>
              <TableCell className="text-muted-foreground">{r.message}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
