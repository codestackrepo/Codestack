import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { OrgApplicationStatus } from '../../organizations/enums/organization-application.enums';

/**
 * Pagination plus the review-queue status filter.
 *
 * THIS EXISTS BECAUSE `@Query('status')` ALONE IS NOT ENOUGH. The global
 * ValidationPipe runs with `forbidNonWhitelisted`, and `@Query() q: PaginationQueryDto`
 * validates the ENTIRE query object — so a `?status=` the DTO does not declare is not
 * merely ignored, it fails the whole request with
 * `400 property status should not exist`.
 *
 * Both review queues had exactly that bug: the parameter was extracted by a second
 * decorator and passed to a working service filter that never ran, because the request
 * died in the pipe first. The symptom is silent — the client renders the failed query
 * as an empty list, so a queue with a pending row showed "nothing waiting for review"
 * on every tab except All (which sends no parameter and therefore validates).
 *
 * The lesson generalises: any list route that adds a filter must declare it on the DTO
 * it validates, not just read it off the request.
 */
export class ListApplicationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: OrgApplicationStatus,
    description: 'Restrict to one review state. Omit for every application.',
  })
  @IsOptional()
  @IsEnum(OrgApplicationStatus)
  status?: OrgApplicationStatus;
}
