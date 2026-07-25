import { Role } from '../../common/enums/role.enum';

/**
 * Minimal structural types for the Clerk webhook payloads we act on. Only the
 * fields we read are modelled — Clerk sends much more. The svix-verified body is
 * cast to `ClerkWebhookEvent` after the `type` discriminator is checked.
 */
export interface ClerkWebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

export interface ClerkUserData {
  id: string;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  public_metadata?: { role?: string } | null;
  banned?: boolean;
}

export interface ClerkDeletedData {
  id: string;
  deleted?: boolean;
}

export interface ClerkOrganizationData {
  id: string;
  name?: string | null;
  slug?: string | null;
}

/** Embedded in an organizationMembership event — enough to provision the user standalone. */
export interface ClerkPublicUserData {
  user_id: string;
  identifier?: string | null; // the primary email/username for the member
  first_name?: string | null;
  last_name?: string | null;
}

export interface ClerkMembershipData {
  role?: string;
  organization: ClerkOrganizationData;
  public_user_data: ClerkPublicUserData;
}

export interface ClerkInvitationData {
  id: string;
  email_address?: string | null;
  role?: string | null;
  organization_id?: string | null;
  status?: string | null;
  public_metadata?: { role?: string } | null;
  private_metadata?: { role?: string } | null;
}

/** Clerk system role for the platform SuperAdmin, carried in user.public_metadata.role. */
const SUPERADMIN_METADATA_ROLE = 'superadmin';

/**
 * Map a Clerk ORG role (e.g. `org:admin`, `org:professor`, `org:member`) to a
 * local Role. Unknown roles fall back to STUDENT — the least-privileged default,
 * so a mis-mapped role never silently grants elevated access. Case-insensitive
 * and tolerant of the bare (unprefixed) form.
 */
export function mapClerkOrgRole(clerkRole: string | null | undefined): Role {
  const normalized = (clerkRole ?? '').toLowerCase().replace(/^org:/, '');
  switch (normalized) {
    case 'admin':
      return Role.ADMIN;
    case 'professor':
      return Role.PROFESSOR;
    default:
      return Role.STUDENT;
  }
}

/** True when the Clerk user carries the platform SuperAdmin metadata role. */
export function isSuperAdminMetadata(metadata: { role?: string } | null | undefined): boolean {
  return (metadata?.role ?? '').toLowerCase() === SUPERADMIN_METADATA_ROLE;
}

/** Extract the primary email from a Clerk user payload (null when unresolved). */
export function primaryEmailOf(user: ClerkUserData): string | null {
  const list = user.email_addresses ?? [];
  const primary = list.find((e) => e.id === user.primary_email_address_id);
  return primary?.email_address ?? list[0]?.email_address ?? null;
}
