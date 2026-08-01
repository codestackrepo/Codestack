import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/shared/logo';
import { useAuth } from '@/features/auth/context/auth-context';
import { OrganizationType, type OrgBranding } from '@/types/organization';

/**
 * The co-branded header: CodeStack × the member's institution (#118).
 *
 * THE RULE, in one place so nothing else has to re-derive it: an organization is an
 * "ecosystem" when its `type` is anything other than `community`. That is what makes a
 * member of Acme University see `CodeStack × Acme`, while an open-platform member — who
 * technically also has an organization, the shared community tenant — sees plain
 * CodeStack.
 *
 * Deliberately NOT keyed on `origin`. An open-platform student who accepts a university
 * invite is a full member of that university and must see its identity; their `origin`
 * stays `'open'` forever because that is how they arrived, which is a different
 * question. Branching on origin here would show the wrong brand to exactly the people
 * the invite flow works hardest to welcome.
 */
export function OrgLockup({
  className,
  collapsed = false,
}: {
  className?: string;
  /** Rail-collapsed: render the mark only, with the org name as the tooltip. */
  collapsed?: boolean;
}) {
  const { organization } = useAuth();

  const isEcosystem = !!organization && organization.type !== OrganizationType.COMMUNITY;
  if (!isEcosystem) return <Logo className={className} />;

  const branding: OrgBranding = organization.branding ?? {};
  const label = branding.displayName || organization.name;

  if (collapsed) {
    return <Logo variant="mark" className={className} />;
  }

  return (
    <span
      className={cn('flex min-w-0 items-center gap-2', className)}
      title={`CodeStack × ${label}`}
    >
      <Logo variant="mark" className="size-7 shrink-0" />
      <span aria-hidden="true" className="shrink-0 text-sm text-muted-foreground">
        &times;
      </span>
      <PartnerMark branding={branding} label={label} />
    </span>
  );
}

/**
 * The institution's own mark, falling back to its name.
 *
 * The fallback is not cosmetic. A logo URL can 404, be blocked by a corporate proxy, or
 * point at a host that is briefly down — and a broken-image icon where an institution's
 * identity should be is worse than no logo at all. `onError` swaps to text, so the
 * lockup always says who the tenant is.
 */
function PartnerMark({ branding, label }: { branding: OrgBranding; label: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!branding.logoUrl && !imageFailed;

  return (
    <span className="flex min-w-0 items-center gap-2">
      {showImage && (
        <img
          src={branding.logoUrl}
          alt=""
          className="h-6 w-auto max-w-24 shrink-0 object-contain"
          onError={() => setImageFailed(true)}
        />
      )}
      {/* Rendered even beside a logo: most institutional marks are a symbol, not a
          wordmark, so the name is what actually identifies the tenant. */}
      <span className="truncate text-sm font-semibold">{label}</span>
    </span>
  );
}

/**
 * "You're part of the {org} ecosystem" — the belonging line.
 *
 * Renders nothing for open-platform members, who belong to no institution. Kept next to
 * the lockup so both read the same `type !== 'community'` rule from one file.
 */
export function EcosystemBadge({ className }: { className?: string }) {
  const { organization } = useAuth();
  if (!organization || organization.type === OrganizationType.COMMUNITY) return null;

  const branding: OrgBranding = organization.branding ?? {};
  const label = branding.displayName || organization.name;

  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      You&apos;re part of the <span className="font-medium text-foreground">{label}</span> ecosystem
      on CodeStack.
    </p>
  );
}
