import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter';

function runFilter(exception: unknown) {
  const filter = new AllExceptionsFilter();
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { method: 'POST', url: '/api/v1/x' };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  };

  filter.catch(exception, host as any);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('AllExceptionsFilter', () => {
  it('passes through custom fields on an object-response HttpException (e.g. entitlement reason for a UI deep-link)', () => {
    const { status, body } = runFilter(
      new ForbiddenException({
        reason: 'entitlement_required',
        entitlement: 'ai',
        message: 'Nope',
      }),
    );

    expect(status).toBe(403);
    expect(body).toMatchObject({
      statusCode: 403,
      message: 'Nope',
      reason: 'entitlement_required',
      entitlement: 'ai',
    });
  });

  it('never lets custom fields override the well-known statusCode/path/timestamp', () => {
    const { body } = runFilter(
      new ForbiddenException({ message: 'x', statusCode: 999, path: '/evil', timestamp: 'evil' }),
    );

    expect(body.statusCode).toBe(403);
    expect(body.path).toBe('/api/v1/x');
    expect(typeof body.timestamp).toBe('string');
    expect(body.timestamp).not.toBe('evil');
  });

  it('handles a plain string message unchanged', () => {
    const { status, body } = runFilter(new NotFoundException('Problem not found'));
    expect(status).toBe(404);
    expect(body).toEqual(
      expect.objectContaining({
        statusCode: 404,
        message: 'Problem not found',
        error: 'Not Found',
      }),
    );
    expect(body.reason).toBeUndefined();
  });

  it('joins a class-validator array message into `message` and keeps the array as `errors`', () => {
    const { body } = runFilter(new BadRequestException(['a is required', 'b must be a string']));
    expect(body.message).toBe('a is required, b must be a string');
    expect(body.errors).toEqual(['a is required', 'b must be a string']);
  });

  it('maps a QueryFailedError to 409 without leaking SQL internals', () => {
    const err = Object.assign(
      new QueryFailedError('INSERT ...', [], new Error('duplicate key')),
      {},
    );
    const { status, body } = runFilter(err);
    expect(status).toBe(409);
    expect(body.message).toBe('Database constraint violation');
  });

  it('falls back to 500 for a plain, non-Http Error', () => {
    const { status, body } = runFilter(new Error('boom'));
    expect(status).toBe(500);
    expect(body.message).toBe('boom');
  });

  /**
   * #140. Nest fills `message` from the exception's CLASS NAME when the thrown body is an
   * object without a `message` — which is how every guard in this codebase rejects. The
   * envelope went out saying `"Forbidden Exception"`, and that string reached a student
   * where their grade belonged.
   */
  describe('never emits a Nest exception class name as `message` (#140)', () => {
    it('replaces the placeholder on a reason-only ForbiddenException', () => {
      const { status, body } = runFilter(new ForbiddenException({ reason: 'org_suspended' }));

      expect(status).toBe(403);
      expect(body.message).not.toBe('Forbidden Exception');
      expect(body.message).toBe('Not permitted');
      // `reason` is the real payload and must survive untouched — it is what the client
      // maps to copy, and what deep-links off this rejection.
      expect(body.reason).toBe('org_suspended');
    });

    it('does the same for the module gate, which is where this was reported', () => {
      const { body } = runFilter(
        new ForbiddenException({ reason: 'module_disabled', module: 'grading' }),
      );
      expect(body.message).toBe('Not permitted');
      expect(body).toMatchObject({ reason: 'module_disabled', module: 'grading' });
    });

    it('covers the other statuses guards and services actually throw', () => {
      expect(runFilter(new NotFoundException({ reason: 'x' })).body.message).toBe('Not found');
      expect(runFilter(new BadRequestException({ reason: 'x' })).body.message).toBe('Bad request');
      expect(runFilter(new ConflictException({ reason: 'quota_exceeded' })).body.message).toBe(
        'Conflict',
      );
      expect(runFilter(new UnauthorizedException({ reason: 'x' })).body.message).toBe(
        'Authentication required',
      );
    });

    it('leaves a real message alone — this must not flatten copy the API does write', () => {
      // The `auth.service` pattern the issue holds up as correct: a reason AND a sentence.
      const { body } = runFilter(
        new ForbiddenException({
          reason: 'email_unverified',
          message: 'Confirm your email address to sign in.',
        }),
      );
      expect(body.message).toBe('Confirm your email address to sign in.');
      expect(body.reason).toBe('email_unverified');
    });

    it('keeps a string-constructed message, the most common shape in the codebase', () => {
      expect(runFilter(new ForbiddenException('You do not have access to this assignment')).body.message).toBe(
        'You do not have access to this assignment',
      );
    });

    /**
     * The detection recomputes Nest's derivation instead of matching known strings, so it
     * holds for exception classes that do not exist yet.
     */
    it('detects the placeholder on a custom exception subclass it has never seen', () => {
      class TeapotBrewingException extends ForbiddenException {}
      const { body } = runFilter(new TeapotBrewingException({ reason: 'x' }));
      expect(body.message).not.toBe('Teapot Brewing Exception');
      expect(body.message).toBe('Not permitted');
    });

    it('falls back by status class for a status with no specific wording', () => {
      class TeapotException extends HttpException {
        constructor() {
          super({ reason: 'x' }, HttpStatus.I_AM_A_TEAPOT);
        }
      }
      expect(runFilter(new TeapotException()).body.message).toBe('Request failed');

      class GatewayException extends HttpException {
        constructor() {
          super({ reason: 'x' }, HttpStatus.BAD_GATEWAY);
        }
      }
      expect(runFilter(new GatewayException()).body.message).toBe('Internal server error');
    });
  });
});
