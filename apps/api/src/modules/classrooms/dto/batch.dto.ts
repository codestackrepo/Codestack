import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { Batch } from '../entities/batch.entity';

export class CreateBatchDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Initial members (subset of classroom students)',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Type(() => String)
  studentIds?: string[];
}

export class UpdateBatchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Replaces the full membership when provided',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Type(() => String)
  studentIds?: string[];
}

export class BatchStudentsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  @Type(() => String)
  studentIds!: string[];
}

export class BatchResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() classroomId!: string;
  @ApiProperty({ type: [UserResponseDto] }) students!: UserResponseDto[];
  @ApiProperty() studentCount!: number;

  static from(batch: Batch): BatchResponseDto {
    const students = (batch.students ?? []).map(UserResponseDto.from);
    return {
      id: batch.id,
      name: batch.name,
      classroomId: batch.classroomId,
      students,
      studentCount: students.length,
    };
  }
}
