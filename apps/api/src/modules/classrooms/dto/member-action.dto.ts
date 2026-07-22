import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RemoveStudentDto {
  @ApiProperty()
  @IsUUID()
  studentId!: string;
}

export class RemoveGraderDto {
  @ApiProperty()
  @IsUUID()
  graderId!: string;
}
