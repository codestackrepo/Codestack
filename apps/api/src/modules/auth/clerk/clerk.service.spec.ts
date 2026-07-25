import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
  createClerkClient: jest.fn(),
}));

// Imported AFTER jest.mock so we get the mocked bindings.
import { createClerkClient, verifyToken } from '@clerk/backend';
import { ClerkService } from './clerk.service';

const mockVerify = verifyToken as jest.Mock;
const mockCreateClient = createClerkClient as jest.Mock;

type ClerkOverrides = { secretKey?: string; jwtKey?: string | undefined };

function makeService(
  clerk: ClerkOverrides = {},
  app: { corsOrigins: string[] } = { corsOrigins: ['https://app.codestack.dev'] },
): ClerkService {
  const clerkCfg = {
    secretKey: 'sk_test_key',
    publishableKey: 'pk_test',
    webhookSigningSecret: '',
    jwtKey: undefined,
    ...clerk,
  };
  const config = {
    get: jest.fn((key: string) => (key === 'clerk' ? clerkCfg : key === 'app' ? app : undefined)),
  } as unknown as ConfigService;
  return new ClerkService(config);
}

beforeEach(() => jest.clearAllMocks());

describe('ClerkService.isConfigured', () => {
  it('is true when a secret key is present', () => {
    expect(makeService().isConfigured()).toBe(true);
  });

  it('is false when the secret key is empty (JWT-only boot)', () => {
    expect(makeService({ secretKey: '' }).isConfigured()).toBe(false);
  });
});

describe('ClerkService.verifyToken', () => {
  it('passes secretKey, jwtKey and the CORS origins as authorizedParties', async () => {
    mockVerify.mockResolvedValue({ sub: 'user_1', sid: 's1' });
    const svc = makeService({ jwtKey: 'jwt_pem' });
    const claims = await svc.verifyToken('the-token');
    expect(claims.sub).toBe('user_1');
    expect(mockVerify).toHaveBeenCalledWith('the-token', {
      secretKey: 'sk_test_key',
      jwtKey: 'jwt_pem',
      authorizedParties: ['https://app.codestack.dev'],
    });
  });

  it('omits authorizedParties when no CORS origins are configured', async () => {
    mockVerify.mockResolvedValue({ sub: 'user_1' });
    await makeService({}, { corsOrigins: [] }).verifyToken('t');
    expect(mockVerify).toHaveBeenCalledWith(
      't',
      expect.objectContaining({ authorizedParties: undefined }),
    );
  });

  it('maps a verification failure to 401 (never leaks the underlying error)', async () => {
    mockVerify.mockRejectedValue(new Error('token expired'));
    await expect(makeService().verifyToken('bad')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('ClerkService.getUserProfile', () => {
  function stubGetUser(user: unknown) {
    const getUser = jest.fn().mockResolvedValue(user);
    mockCreateClient.mockReturnValue({ users: { getUser } });
    return getUser;
  }

  it('returns the PRIMARY email plus first/last name', async () => {
    stubGetUser({
      emailAddresses: [
        { id: 'e1', emailAddress: 'secondary@x.dev' },
        { id: 'e2', emailAddress: 'primary@x.dev' },
      ],
      primaryEmailAddressId: 'e2',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    await expect(makeService().getUserProfile('user_1')).resolves.toEqual({
      email: 'primary@x.dev',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
  });

  it('returns null email when there is no primary address, and null names', async () => {
    stubGetUser({
      emailAddresses: [],
      primaryEmailAddressId: null,
      firstName: null,
      lastName: null,
    });
    await expect(makeService().getUserProfile('user_1')).resolves.toEqual({
      email: null,
      firstName: null,
      lastName: null,
    });
  });

  it('lazily builds a single backend client and reuses it', async () => {
    const getUser = stubGetUser({
      emailAddresses: [{ id: 'e1', emailAddress: 'a@x.dev' }],
      primaryEmailAddressId: 'e1',
      firstName: 'A',
      lastName: 'B',
    });
    const svc = makeService();
    await svc.getUserProfile('user_1');
    await svc.getUserProfile('user_2');
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
