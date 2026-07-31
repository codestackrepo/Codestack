import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { OrganizationStatus, type PlatformOrganization } from '@/types/organization';
import { platformApi, platformKeys } from '../api/platform.api';
import { OrganizationFormDialog } from '../components/organization-form-dialog';

/**
 * Every tenant on the platform.
 *
 * Deliberately renders NO member count: `PlatformOrganizationDto` does not carry
 * one, and faking it would mean a request per row. The census lives on the detail
 * page, where one request answers it.
 */
export function PlatformOrganizationsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: platformKeys.organizations(),
    queryFn: platformApi.listOrganizations,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Organizations" description="Every tenant on the platform." />
        <OrganizationFormDialog />
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : isError ? (
        <EmptyState
          title="Couldn't load organizations"
          description={parseApiError(error).message}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No organizations yet"
          description="Create the first one to start onboarding people."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((org: PlatformOrganization) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/home/platform/organizations/${org.id}`}
                      className="hover:text-primary hover:underline"
                    >
                      {org.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {org.slug}
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">{org.type}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        org.status === OrganizationStatus.ACTIVE ? 'secondary' : 'destructive'
                      }
                    >
                      {org.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(org.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
