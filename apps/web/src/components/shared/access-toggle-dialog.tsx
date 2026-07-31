import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

/**
 * Confirms turning a user's access off or back on.
 *
 * Extracted from the unconfirmed inline toggle on the users page: revoking is a
 * one-click, immediately-effective action against another person's account, and
 * the old badge-button did it with no confirmation at all.
 *
 * The copy says "on their next request", NOT "will be signed out". Revocation
 * binds when the auth guard next re-reads the row, so a user sitting on an open
 * page keeps seeing it until they do something — promising a sign-out would be
 * false, and the difference matters to an admin deciding whether to also call the
 * person.
 */
export function AccessToggleDialog({
  email,
  isActive,
  disabled,
  onConfirm,
}: {
  email: string;
  isActive: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="disabled:cursor-not-allowed disabled:opacity-60"
          title={disabled ? 'You cannot change this account' : 'Change access'}
        >
          <Badge variant={isActive ? 'secondary' : 'outline'}>
            {isActive ? 'Active' : 'No access'}
          </Badge>
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isActive ? 'Turn off access for this account?' : 'Restore access?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isActive ? (
              <>
                <span className="font-medium text-foreground">{email}</span> will stop being able to
                sign in, and any open session will stop working on their next request. Their work is
                not deleted.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{email}</span> will be able to sign in
                again. This takes a seat in your organization.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {isActive ? 'Turn off access' : 'Restore access'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
