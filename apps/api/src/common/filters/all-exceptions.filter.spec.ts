import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
});
