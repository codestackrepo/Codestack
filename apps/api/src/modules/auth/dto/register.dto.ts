import { OmitType } from '@nestjs/swagger';
import { CreateUserDto } from '../../users/dto/create-user.dto';

/**
 * Public self-registration. Role is forced to STUDENT and cannot be set here.
 *
 * The `inviteToken` field is gone: an invite is redeemed at
 * `POST /invites/accept`, which creates the account with the invited role inside
 * the transaction that consumes the invite and charges the seat. A token field
 * here would be a second path into a role that skipped the quota.
 */
export class RegisterDto extends OmitType(CreateUserDto, ['role'] as const) {}
