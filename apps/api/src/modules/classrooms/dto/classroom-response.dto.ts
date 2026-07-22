import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { Classroom } from '../entities/classroom.entity';

export class ClassroomResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() courseId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() term!: string;
  @ApiProperty() startDate!: Date;
  @ApiProperty() endDate!: Date;
  @ApiProperty() totalUsers!: number;
  @ApiProperty() createdById!: string;
  @ApiPropertyOptional({ type: UserResponseDto, nullable: true })
  professor!: UserResponseDto | null;
  @ApiPropertyOptional({ type: [UserResponseDto] }) students?: UserResponseDto[];
  @ApiPropertyOptional({ type: [UserResponseDto] }) graders?: UserResponseDto[];

  static from(c: Classroom, includeMembers = false): ClassroomResponseDto {
    const dto: ClassroomResponseDto = {
      id: c.id,
      courseId: c.courseId,
      title: c.title,
      description: c.description,
      term: c.term,
      startDate: c.startDate,
      endDate: c.endDate,
      totalUsers: c.totalUsers,
      createdById: c.createdById,
      professor: c.professor ? UserResponseDto.from(c.professor) : null,
    };
    if (includeMembers) {
      dto.students = (c.students ?? []).map(UserResponseDto.from);
      dto.graders = (c.graders ?? []).map(UserResponseDto.from);
    }
    return dto;
  }
}
