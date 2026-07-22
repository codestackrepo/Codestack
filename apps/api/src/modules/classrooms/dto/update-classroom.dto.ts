import { PartialType } from '@nestjs/swagger';
import { CreateClassroomDto } from './create-classroom.dto';

/** Membership additions are additive; removal is via dedicated endpoints. */
export class UpdateClassroomDto extends PartialType(CreateClassroomDto) {}
