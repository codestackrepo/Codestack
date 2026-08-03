import { ConfigService } from '@nestjs/config';
import { EmailConfig } from '../../config/configuration';
import { MailModule } from './mail.module';
import {
  DisabledMailTransport,
  MAIL_TRANSPORT,
  MailTransport,
  SmtpMailTransport,
} from './mail.transport';
import { ResendMailTransport } from './resend-mail.transport';
import { BrevoApiMailTransport } from './brevo-mail.transport';

jest.mock('nodemailer', () => ({ createTransport: jest.fn().mockReturnValue({}) }));
jest.mock('./resend-mail.transport', () => {
  // A spy constructor, so "was Resend ever constructed?" is directly observable —
  // that is the property locked decision 8 actually asks for.
  const ctor = jest.fn();
  return {
    ResendMailTransport: class {
      constructor(...args: unknown[]) {
        ctor(...args);
      }
      send = jest.fn();
      close = jest.fn();
      static ctor = ctor;
    },
  };
});
jest.mock('./brevo-mail.transport', () => {
  const ctor = jest.fn();
  return {
    BrevoApiMailTransport: class {
      constructor(...args: unknown[]) {
        ctor(...args);
      }
      send = jest.fn();
      close = jest.fn();
      static ctor = ctor;
    },
  };
});

const resendCtor = (ResendMailTransport as unknown as { ctor: jest.Mock }).ctor;
const brevoCtor = (BrevoApiMailTransport as unknown as { ctor: jest.Mock }).ctor;

const cfg = (over: Partial<EmailConfig> = {}): EmailConfig =>
  ({
    enabled: true,
    provider: 'smtp',
    resendApiKey: '',
    brevoApiKey: '',
    host: 'smtp.example.com',
    port: 587,
    user: '',
    password: '',
    useTls: true,
    from: 'no-reply@codestack.dev',
    notificationEmails: [],
    workerConcurrency: 4,
    rateMax: 20,
    rateDurationMs: 1000,
    ...over,
  }) as EmailConfig;

/**
 * Pulls the real factory off the module metadata rather than re-implementing it.
 * A copied factory in the spec would keep passing after the module's own logic
 * changed, which is the failure mode this indirection avoids.
 */
function resolveTransport(over: Partial<EmailConfig> = {}): MailTransport {
  const providers = Reflect.getMetadata('providers', MailModule) as Array<
    { provide?: unknown; useFactory?: (c: ConfigService) => MailTransport } | unknown
  >;
  const entry = providers.find(
    (p): p is { provide: unknown; useFactory: (c: ConfigService) => MailTransport } =>
      typeof p === 'object' &&
      p !== null &&
      (p as { provide?: unknown }).provide === MAIL_TRANSPORT,
  );
  if (!entry) throw new Error('MAIL_TRANSPORT provider not found on MailModule');

  const config = { getOrThrow: jest.fn().mockReturnValue(cfg(over)) } as unknown as ConfigService;
  return entry.useFactory(config);
}

beforeEach(() => {
  resendCtor.mockClear();
  brevoCtor.mockClear();
});

describe('MailModule — provider selection', () => {
  it('defaults to SMTP', () => {
    expect(resolveTransport({ provider: 'smtp' })).toBeInstanceOf(SmtpMailTransport);
  });

  it('selects Resend when the provider says so', () => {
    resolveTransport({ provider: 'resend', resendApiKey: 're_live_key_value' });
    expect(resendCtor).toHaveBeenCalledTimes(1);
    expect(brevoCtor).not.toHaveBeenCalled();
  });

  it('selects Brevo when the provider says so', () => {
    resolveTransport({ provider: 'brevo', brevoApiKey: 'xkeysib-live-key-value' });
    expect(brevoCtor).toHaveBeenCalledTimes(1);
    expect(resendCtor).not.toHaveBeenCalled();
  });
});

describe('MailModule — a disabled mailer needs no credential', () => {
  // Locked decision 8. The `enabled` check has to come FIRST: ResendMailTransport
  // throws on a missing key, so constructing it and only then noticing the mailer is
  // off would turn a deliberately-disabled deployment into a failed boot.
  it('returns the disabled transport and constructs NO provider when EMAIL_ENABLED=false', () => {
    const t = resolveTransport({ enabled: false, provider: 'resend', resendApiKey: '' });
    expect(t).toBeInstanceOf(DisabledMailTransport);
    expect(resendCtor).not.toHaveBeenCalled();
  });

  it('short-circuits even when the provider is resend and the key is absent', () => {
    expect(() =>
      resolveTransport({ enabled: false, provider: 'resend', resendApiKey: '' }),
    ).not.toThrow();
  });

  it('short-circuits even when the provider is brevo and the key is absent', () => {
    expect(() =>
      resolveTransport({ enabled: false, provider: 'brevo', brevoApiKey: '' }),
    ).not.toThrow();
    expect(brevoCtor).not.toHaveBeenCalled();
  });

  it('does not build an SMTP transport either when disabled', () => {
    expect(resolveTransport({ enabled: false, provider: 'smtp' })).not.toBeInstanceOf(
      SmtpMailTransport,
    );
  });
});
