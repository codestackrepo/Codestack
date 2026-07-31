import { Building2, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ProblemScope } from '@/types/problem';

/**
 * Marks a catalog row as platform-global or org-owned (#74).
 *
 * Only the GLOBAL case is rendered by default. Inside an organization's catalog
 * almost everything is org-owned, so badging that is noise — the badge earns its
 * place by marking the exception. `showOrg` opts into the explicit both-ways
 * rendering for screens that mix scopes deliberately, such as the assignment item
 * picker.
 */
export function ScopeBadge({ scope, showOrg = false }: { scope: ProblemScope; showOrg?: boolean }) {
  if (scope === ProblemScope.GLOBAL) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Globe className="size-3" /> Global
      </Badge>
    );
  }
  if (!showOrg) return null;
  return (
    <Badge variant="outline" className="gap-1">
      <Building2 className="size-3" /> My org
    </Badge>
  );
}
