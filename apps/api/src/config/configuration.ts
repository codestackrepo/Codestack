import { registerAs } from '@nestjs/config';

const bool = (v: string | undefined, def = false): boolean =>
  v === undefined ? def : v === 'true' || v === '1';
const num = (v: string | undefined, def: number): number =>
  v === undefined || v === '' ? def : Number(v);
const list = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigins: list(process.env.CORS_ORIGINS),
  isProd: process.env.NODE_ENV === 'production',
  // Public origin of the WEB app, not the API — every mailed link is built from
  // it. Read in exactly one place (`MailService.webUrl`), and main.ts refuses to
  // boot in production if it still points at localhost: a wrong value here ships
  // unusable links to every invitee, and nothing else would notice.
  webAppUrl: (process.env.WEB_APP_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: num(process.env.DATABASE_PORT, 5432),
  username: process.env.DATABASE_USER ?? 'codestack',
  password: process.env.DATABASE_PASSWORD ?? 'codestack',
  database: process.env.DATABASE_NAME ?? 'codestack',
  ssl: bool(process.env.DATABASE_SSL),
  logging: bool(process.env.DATABASE_LOGGING),
}));

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: num(process.env.REDIS_PORT, 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  db: num(process.env.REDIS_DB, 0),
}));

export const authConfig = registerAs('auth', () => ({
  // Joi's envValidationSchema requires (and length-checks) these at boot, so
  // the app never starts without them — no insecure fallback needed here.
  accessSecret: process.env.JWT_ACCESS_SECRET as string,
  refreshSecret: process.env.JWT_REFRESH_SECRET as string,
  accessTtl: process.env.JWT_ACCESS_TTL ?? '1d',
  refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  cookieDomain: process.env.AUTH_COOKIE_DOMAIN ?? 'localhost',
  cookieSecure: bool(process.env.AUTH_COOKIE_SECURE),
  cookieSameSite: (process.env.AUTH_COOKIE_SAMESITE ?? 'lax') as 'lax' | 'strict' | 'none',
}));

export const pistonConfig = registerAs('piston', () => ({
  urls: list(process.env.PISTON_URLS).length
    ? list(process.env.PISTON_URLS)
    : ['http://localhost:2000/api/v2/execute'],
  maxInflight: num(process.env.PISTON_MAX_INFLIGHT, 16),
  connectTimeoutMs: num(process.env.PISTON_CONNECT_TIMEOUT_MS, 2000),
}));

export const runtimeConfig = registerAs('runtime', () => ({
  pythonVersion: process.env.PYTHON_VERSION ?? '3.11.0',
  cppVersion: process.env.CPP_VERSION ?? '10.2.0',
  javaVersion: process.env.JAVA_VERSION ?? '15.0.2',
  jsVersion: process.env.JS_VERSION ?? '20.11.1',
  defaultTimeoutMs: num(process.env.DEFAULT_RUN_TIMEOUT_MS, 3000),
  defaultMemoryLimit: num(process.env.DEFAULT_RUN_MEMORY_LIMIT, 256000000),
  defaultMaxProcessCount: num(process.env.DEFAULT_MAX_PROCESS_COUNT, 64),
  defaultOutputMaxBytes: num(process.env.DEFAULT_OUTPUT_MAX_BYTES, 65536),
}));

export const judgeConfig = registerAs('judge', () => ({
  workerConcurrency: num(process.env.JUDGE_WORKER_CONCURRENCY, 8),
  queueRateMax: num(process.env.JUDGE_QUEUE_RATE_MAX, 100),
  queueRateDurationMs: num(process.env.JUDGE_QUEUE_RATE_DURATION_MS, 1000),
}));

export const throttleConfig = registerAs('throttle', () => ({
  runPerMin: num(process.env.THROTTLE_RUN_PER_MIN, 5),
  runPerDay: num(process.env.THROTTLE_RUN_PER_DAY, 50),
  submitPerMin: num(process.env.THROTTLE_SUBMIT_PER_MIN, 1),
  submitPerDay: num(process.env.THROTTLE_SUBMIT_PER_DAY, 50),
  globalPerDay: num(process.env.THROTTLE_GLOBAL_PER_DAY, 1000),
}));

/**
 * Transactional mail (#103). These vars existed but had no reader until now, so
 * the namespace is extended rather than replaced — there is deliberately no
 * `MAIL_*` twin.
 *
 * `enabled` defaults FALSE, which is what makes a fresh clone safe: with it off
 * the mailer logs the rendered text body instead of sending, and only outside
 * production (otherwise the default posture would be "every invite token in the
 * application log").
 */
export const emailConfig = registerAs('email', () => ({
  enabled: bool(process.env.EMAIL_ENABLED, false),
  // Which provider actually delivers (#118). `smtp` is the default so local
  // development keeps working against mailpit with no credentials and no network
  // egress — a change that forced every developer to hold a real API key just to
  // see an invite link would be worked around rather than used.
  provider: (process.env.EMAIL_PROVIDER ?? 'smtp') as 'smtp' | 'resend',
  // SECRET. Never interpolated into a log line, an error message or a thrown
  // exception — see `resend-mail.transport.ts`, which builds every message from
  // the response alone, and the `check-invariants` gate that pins the set of
  // files allowed to read this field.
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  host: process.env.EMAIL_HOST ?? '',
  port: num(process.env.EMAIL_PORT, 587),
  user: process.env.EMAIL_USER ?? '',
  password: process.env.EMAIL_PASSWORD ?? '',
  useTls: bool(process.env.EMAIL_USE_TLS, true),
  from: process.env.DEFAULT_FROM_EMAIL ?? 'no-reply@codestack.dev',
  // Demo-request notifications. Predates the mailer and still has no consumer;
  // wiring DemoService to MailService is deliberately out of #103's scope.
  notificationEmails: list(process.env.DEMO_NOTIFICATION_EMAILS),
  // Worker-side delivery shape. The limiter is Redis-global in BullMQ, which is
  // exactly what an SMTP provider's rate cap needs — a per-pod cap would be
  // multiplied by the pod count.
  workerConcurrency: num(process.env.EMAIL_WORKER_CONCURRENCY, 4),
  // These two are NOT what configures the limiter, and that is not an oversight.
  // BullMQ reads `limiter` once, when the Worker is constructed — before any
  // ConfigService exists — so `mail.processor.ts` reads the same two env vars
  // directly at class-decoration time. These fields are the CROSS-CHECK: the
  // processor compares them against the values it actually baked in and logs
  // loudly if they differ, which is what turns "the env var reached the worker"
  // from an assumption into something observable at boot. Deleting them would
  // remove that check; using them to configure anything would resurrect the bug
  // where the config said 5 and the worker ran at 20.
  rateMax: num(process.env.EMAIL_RATE_MAX, 20),
  rateDurationMs: num(process.env.EMAIL_RATE_DURATION_MS, 1000),
}));

export const aiConfig = registerAs('ai', () => ({
  provider: (process.env.LLM_PROVIDER ?? 'anthropic') as 'anthropic' | 'openai',
  apiKey: process.env.LLM_API_KEY ?? '',
  model: process.env.LLM_MODEL ?? 'claude-opus-4-8',
  maxInputTokens: num(process.env.LLM_MAX_INPUT_TOKENS, 12000),
  maxOutputTokens: num(process.env.LLM_MAX_OUTPUT_TOKENS, 8000),
  timeoutMs: num(process.env.LLM_TIMEOUT_MS, 120000),
  maxCostUsd: num(process.env.LLM_MAX_COST_USD_PER_REQUEST, 1.0),
  freeGenerationsPerMonth: num(process.env.AI_FREE_GENERATIONS_PER_MONTH, 2),
  maxFileBytes: num(process.env.AI_MAX_FILE_BYTES, 10485760),
  rateLimitPerHour: num(process.env.AI_RATE_LIMIT_PER_HOUR, 5),
}));

export const billingConfig = registerAs('billing', () => ({
  provider: (process.env.PAYMENT_PROVIDER ?? 'stripe') as 'stripe',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
  successUrl: process.env.BILLING_SUCCESS_URL ?? 'http://localhost:5173/billing/success',
  cancelUrl: process.env.BILLING_CANCEL_URL ?? 'http://localhost:5173/billing/cancel',
}));

export const platformConfig = registerAs('platform', () => ({
  // Emails bootstrapped to SUPERADMIN by seed-superadmin.ts (#62). This is the
  // only promotion path — a self-registration never yields a SUPERADMIN.
  superadminEmails: list(process.env.CODESTACK_SUPERADMIN_EMAILS).map((e) => e.toLowerCase()),
}));

export const allConfigs = [
  appConfig,
  databaseConfig,
  redisConfig,
  authConfig,
  pistonConfig,
  runtimeConfig,
  judgeConfig,
  throttleConfig,
  emailConfig,
  aiConfig,
  billingConfig,
  platformConfig,
];

export type AppConfig = ReturnType<typeof appConfig>;
export type DatabaseConfig = ReturnType<typeof databaseConfig>;
export type RedisConfig = ReturnType<typeof redisConfig>;
export type AuthConfig = ReturnType<typeof authConfig>;
export type PistonConfig = ReturnType<typeof pistonConfig>;
export type RuntimeConfig = ReturnType<typeof runtimeConfig>;
export type JudgeConfig = ReturnType<typeof judgeConfig>;
export type ThrottleConfig = ReturnType<typeof throttleConfig>;
export type EmailConfig = ReturnType<typeof emailConfig>;
export type AiConfig = ReturnType<typeof aiConfig>;
export type BillingConfig = ReturnType<typeof billingConfig>;
export type PlatformConfig = ReturnType<typeof platformConfig>;
