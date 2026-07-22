import { PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

/**
 * All fields optional; password re-hashed only if provided. `role` is
 * accepted here but only honored by UsersService.update() when the actor is
 * an admin — everyone else's role changes are silently ignored.
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {}
