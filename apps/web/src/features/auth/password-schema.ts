import { z } from 'zod';

/**
 * The ONE client-side password rule, shared by register, invite-accept and
 * password reset.
 *
 * It was duplicated in register-form before three more forms needed it. Three
 * copies drift, and the one that drifts loosest becomes the cheapest way to plant
 * a weak password — so this is exported rather than re-typed. Kept in step with
 * the server rule on CreateUserDto / AcceptInviteDto / ResetPasswordDto.
 */
export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[a-z]/, 'Must contain a lowercase letter')
  .regex(/[0-9]/, 'Must contain a number');

/**
 * `password` + `confirm`, with the mismatch reported on the confirm field.
 *
 * Concrete rather than a generic over extra shape: both consumers need exactly
 * these two fields, and a generic wrapper defeats zod's `refine` inference for no
 * benefit.
 */
export const passwordConfirmSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
