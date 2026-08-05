import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

interface ErrorBody {
  statusCode: number;
  message: string;
  error: string;
  errors?: unknown;
  path: string;
  timestamp: string;
  /** Custom fields a thrown exception's object body carried (e.g. `reason`, for deep-linking). */
  [key: string]: unknown;
}

/**
 * Neutral, status-derived wording for a rejection that supplied no message of its own.
 * Plain HTTP semantics, not product copy — the client maps `reason` to a sentence.
 */
const STATUS_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad request',
  [HttpStatus.UNAUTHORIZED]: 'Authentication required',
  [HttpStatus.FORBIDDEN]: 'Not permitted',
  [HttpStatus.NOT_FOUND]: 'Not found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Could not process this request',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests',
};

/**
 * Global exception filter producing a consistent error envelope for every
 * failure (revives the intent of the original app's unused custom handler).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'InternalServerError';
    let errors: unknown;
    let extra: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      error = exception.name;
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        message = this.stringifyMessage(body.message) ?? this.fallbackMessage(exception, status);
        error = (body.error as string) ?? error;
        if (Array.isArray(body.message)) errors = body.message;
        // Anything beyond the well-known Nest fields is caller-supplied
        // structured data (e.g. `{ reason: 'entitlement_required' }` for a
        // frontend deep-link) — pass it through instead of silently dropping it.
        const { message: _m, error: _e, statusCode: _s, ...rest } = body;
        if (Object.keys(rest).length) extra = rest;
      }
    } else if (exception instanceof QueryFailedError) {
      // Map unique-violation etc. to 409 without leaking SQL internals.
      status = HttpStatus.CONFLICT;
      error = 'QueryFailedError';
      message = 'Database constraint violation';
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      message,
      error,
      ...(errors ? { errors } : {}),
      ...extra,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private stringifyMessage(message: unknown): string | undefined {
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(', ');
    return undefined;
  }

  /**
   * What to say when the thrown object carried no `message` of its own (#140).
   *
   * `exception.message` is the wrong answer here. Nest derives it from the exception's
   * CLASS NAME whenever the response body is an object without a `message`:
   *
   * ```
   * this.message = this.constructor.name.match(/[A-Z][a-z]+|[0-9]+/g)?.join(' ') ?? 'Error'
   * ```
   *
   * Which is exactly how every guard in this codebase throws — `new ForbiddenException({
   * reason: 'org_suspended' })` — so the envelope went out carrying
   * `message: "Forbidden Exception"`. `reason` was always the real payload, but `message`
   * is what a client renders, and a student was shown that string where their grade
   * belonged.
   *
   * The placeholder is detected by RECOMPUTING Nest's own derivation rather than matching
   * a list of known strings: if `message` is identical to what the class name produces,
   * nobody wrote it. That stays correct for exception classes that do not exist yet.
   *
   * Note what this deliberately does NOT do: turn `reason` into a sentence. The
   * reason→copy table lives in the web app (`toast-reasons.ts`) and is the single source
   * of that wording; duplicating it here — with no shared package between `apps/api` and
   * `apps/web` to keep the two honest — would recreate the "one failure, two different
   * explanations" problem that file exists to prevent. So the API stops emitting an
   * internal class name, and the client still owns the copy.
   */
  private fallbackMessage(exception: HttpException, status: number): string {
    const derivedFromClassName =
      exception.constructor.name.match(/[A-Z][a-z]+|[0-9]+/g)?.join(' ') ?? 'Error';
    if (exception.message && exception.message !== derivedFromClassName) {
      return exception.message;
    }
    return STATUS_MESSAGES[status] ?? (status >= 500 ? 'Internal server error' : 'Request failed');
  }
}
