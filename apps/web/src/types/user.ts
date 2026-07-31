import type { Role } from './common';

/**
 * Mirrors `UserResponseDto` (api: users/dto/user-response.dto.ts).
 *
 * Widened from `{id,email,firstName,lastName,role}` to the whole DTO, which the
 * API has always sent. `features/admin/api/users.api.ts` carried a near-identical
 * `AdminUser` for the extra fields; that duplicate is deleted, because two shapes
 * for one payload drift and the consumers already receive this one.
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  /** null for a SUPERADMIN, and for a self-registered student awaiting assignment. */
  organizationId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
