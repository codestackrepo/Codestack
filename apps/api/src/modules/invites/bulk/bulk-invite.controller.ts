import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  ForbiddenException,
  HttpCode,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { extname } from 'path';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { assertOrgAllowsStaffDirectory } from '../../../common/tenancy/community-policy';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BulkInviteService } from './bulk-invite.service';
import { BulkInviteResultDto, CommitBulkInviteDto, RosterPreviewDto } from './dto/bulk-invite.dto';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.csv', '.xlsx'];
const ALLOWED_MIMETYPES = [
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel', // what Excel-on-Windows sends for a .csv
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // some browsers for an unknown type
];

/**
 * Maps multer's size rejection to the roster contract.
 *
 * `@Catch(MulterError)` can NEVER fire: Nest's `transformException` converts a
 * MulterError into an HttpException inside the interceptor, before any filter
 * runs. What actually arrives is a PayloadTooLargeException whose message is the
 * literal string 'File too large', so that is what this keys on.
 */
@Catch(PayloadTooLargeException)
export class RosterUploadSizeFilter implements ExceptionFilter {
  catch(exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const isMulterSize = exception.message === 'File too large';
    res.status(413).json(
      isMulterSize
        ? {
            reason: 'file_too_large',
            maxBytes: MAX_UPLOAD_BYTES,
            message: `That file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
          }
        : exception.getResponse(),
    );
  }
}

/**
 * Bulk student onboarding.
 *
 * Both routes are `@Roles(ADMIN, PROFESSOR)` and org-scoped from the actor — the
 * tenant never arrives in the request, so there is no cross-org parameter to
 * validate.
 */
@ApiTags('invites')
@ApiCookieAuth('access_token')
@Controller('invites/bulk')
@UseFilters(RosterUploadSizeFilter)
export class BulkInviteController {
  constructor(private readonly bulk: BulkInviteService) {}

  @Post('preview')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @HttpCode(200)
  @Throttle({ hour: { limit: 20, ttl: 3_600_000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      // No `storage:` — memory IS multer's default when no `dest` is given, and
      // naming it would mean importing `memoryStorage` from a package that pnpm's
      // isolated linker does not expose to this workspace.
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
      // Layer 1 + 2 of 3: extension and mimetype. Both are client-supplied and
      // spoofable, so this is only a cheap early reject — the authoritative check
      // is magic bytes in detectRosterFileType. An HttpException thrown here
      // propagates verbatim.
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname ?? '').toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return cb(
            new BadRequestException({
              reason: 'unsupported_file_type',
              message: 'Upload a .csv or .xlsx file.',
            }),
            false,
          );
        }
        if (file.mimetype && !ALLOWED_MIMETYPES.includes(file.mimetype)) {
          return cb(
            new BadRequestException({
              reason: 'unsupported_file_type',
              message: 'Upload a .csv or .xlsx file.',
            }),
            false,
          );
        }
        return cb(null, true);
      },
    }),
  )
  async preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RosterPreviewDto> {
    if (!file) {
      throw new BadRequestException({ reason: 'file_required', message: 'Attach a file.' });
    }
    return this.bulk.preview(file, actor, this.requireOrg(actor));
  }

  @Post('commit')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @Throttle({ hour: { limit: 20, ttl: 3_600_000 } })
  async commit(
    @Body() dto: CommitBulkInviteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BulkInviteResultDto> {
    return this.bulk.commit(dto, actor, this.requireOrg(actor));
  }

  /**
   * RolesGuard is minimum-rank, so a SUPERADMIN passes `@Roles(ADMIN, PROFESSOR)`
   * and TenantContextGuard early-returns for them — without this they would reach
   * the service with a null org.
   */
  private requireOrg(actor: AuthenticatedUser): string {
    if (!actor.organizationId) {
      throw new ForbiddenException({
        reason: 'no_organization',
        message: 'Bulk upload runs against your own organization.',
      });
    }
    /**
     * Bulk upload is closed to the community tenant (#118), and this is the sharpest
     * leak of the set — sharper than the member list it mirrors.
     *
     * `POST /invites/bulk/preview` accepts 2000 addresses and answers with a per-address
     * classification, running an UNSCOPED lookup: `already_member` is a definitive "this
     * address is in the community tenant" and `not_available` is "this address has an
     * account somewhere on CodeStack". That is a batch existence oracle over arbitrary
     * addresses, handed to anyone who obtained a community professor account — which the
     * PUBLIC professor-application endpoint makes obtainable.
     *
     * `commit` is worse in a different way: it mints invites into the shared tenant and
     * mails claim-invitations that pull org-less students into it.
     */
    assertOrgAllowsStaffDirectory(actor);
    return actor.organizationId;
  }
}
