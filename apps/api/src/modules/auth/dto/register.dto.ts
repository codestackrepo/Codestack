import { OmitType } from '@nestjs/swagger';
import { CreateUserDto } from '../../users/dto/create-user.dto';

/** Public self-registration — role is forced to student (cannot be set here). */
export class RegisterDto extends OmitType(CreateUserDto, ['role'] as const) {}
