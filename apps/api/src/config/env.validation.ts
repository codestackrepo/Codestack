import * as Joi from 'joi';

/**
 * Boot-time validation of every environment variable the app relies on.
 * Fails fast (process exits) if a required var is missing or malformed.
 */
export const envValidationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGINS: Joi.string().allow('').default(''),

  // Database
  DATABASE_URL: Joi.string().optional(),
  DATABASE_HOST: Joi.string().default('localhost'),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_USER: Joi.string().default('codestack'),
  DATABASE_PASSWORD: Joi.string().allow('').default('codestack'),
  DATABASE_NAME: Joi.string().default('codestack'),
  DATABASE_SSL: Joi.boolean().default(false),
  DATABASE_LOGGING: Joi.boolean().default(false),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().default(0),

  // Auth — secrets must be long enough to resist offline brute-force of the
  // HMAC (these sign the access/refresh JWTs; a short secret is forgeable).
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('1d'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),
  AUTH_COOKIE_DOMAIN: Joi.string().default('localhost'),
  AUTH_COOKIE_SECURE: Joi.boolean().default(false),
  AUTH_COOKIE_SAMESITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),

  // Platform (#62) — comma-separated SuperAdmin bootstrap emails (optional).
  CODESTACK_SUPERADMIN_EMAILS: Joi.string().allow('').default(''),

  // Piston
  PISTON_URLS: Joi.string().default('http://localhost:2000/api/v2/execute'),
  PISTON_MAX_INFLIGHT: Joi.number().default(16),
  PISTON_CONNECT_TIMEOUT_MS: Joi.number().default(2000),

  // Runtimes / limits
  PYTHON_VERSION: Joi.string().default('3.11.0'),
  CPP_VERSION: Joi.string().default('10.2.0'),
  JAVA_VERSION: Joi.string().default('15.0.2'),
  JS_VERSION: Joi.string().default('20.11.1'),
  DEFAULT_RUN_TIMEOUT_MS: Joi.number().default(3000),
  DEFAULT_RUN_MEMORY_LIMIT: Joi.number().default(256000000),
  DEFAULT_MAX_PROCESS_COUNT: Joi.number().default(64),
  DEFAULT_OUTPUT_MAX_BYTES: Joi.number().default(65536),

  // Judge queue
  JUDGE_WORKER_CONCURRENCY: Joi.number().default(8),
  JUDGE_QUEUE_RATE_MAX: Joi.number().default(100),
  JUDGE_QUEUE_RATE_DURATION_MS: Joi.number().default(1000),

  // Throttling
  THROTTLE_RUN_PER_MIN: Joi.number().default(5),
  THROTTLE_RUN_PER_DAY: Joi.number().default(50),
  THROTTLE_SUBMIT_PER_MIN: Joi.number().default(1),
  THROTTLE_SUBMIT_PER_DAY: Joi.number().default(50),
  THROTTLE_GLOBAL_PER_DAY: Joi.number().default(1000),

  // Email
  // EMAIL_HOST is required ONLY when the mailer is on. Expressed as a single
  // Joi.when, not as `.allow('')` plus a separate rule — two rules would let the
  // empty-string allowance leak into the enabled branch, and a blank host fails
  // at first send instead of at boot.
  EMAIL_ENABLED: Joi.boolean().default(false),
  // Which provider delivers (#118). Defaults to smtp, so an existing deployment
  // and a fresh local checkout both behave exactly as before.
  EMAIL_PROVIDER: Joi.string().valid('smtp', 'resend').default('smtp'),
  // Now conditional on the PROVIDER too: Resend goes over HTTPS and has no host to
  // configure, so requiring one would make a valid Resend deployment fail to boot.
  EMAIL_HOST: Joi.when('EMAIL_ENABLED', {
    is: true,
    then: Joi.when('EMAIL_PROVIDER', {
      is: 'resend',
      then: Joi.string().allow('').default(''),
      otherwise: Joi.string().min(1).required(),
    }),
    otherwise: Joi.string().allow('').default(''),
  }),
  // Required ONLY when the mailer is on AND the provider is resend. Nested rather
  // than combined into one condition for the reason EMAIL_HOST is: a disabled
  // mailer must never require a credential, so `EMAIL_ENABLED=false` has to
  // short-circuit before the provider is even consulted.
  RESEND_API_KEY: Joi.when('EMAIL_ENABLED', {
    is: true,
    then: Joi.when('EMAIL_PROVIDER', {
      is: 'resend',
      then: Joi.string().min(1).required(),
      otherwise: Joi.string().allow('').default(''),
    }),
    otherwise: Joi.string().allow('').default(''),
  }),
  EMAIL_PORT: Joi.number().default(587),
  EMAIL_USER: Joi.string().allow('').default(''),
  EMAIL_PASSWORD: Joi.string().allow('').default(''),
  EMAIL_USE_TLS: Joi.boolean().default(true),
  DEFAULT_FROM_EMAIL: Joi.string().default('no-reply@codestack.dev'),
  DEMO_NOTIFICATION_EMAILS: Joi.string().allow('').default(''),
  EMAIL_WORKER_CONCURRENCY: Joi.number().default(4),
  // No default when sending through Resend — the operator must choose it.
  // The default of 20/s is safe for mailpit and for a real SMTP relay, and is far
  // above Resend's account limit, so inheriting it silently is what produces a 429
  // storm on the first bulk roster import. Resend's real POST /emails limit is not
  // the one its read endpoints report; `ResendMailTransport` logs the observed
  // limit off the first successful send, and this value should be at most half of
  // it (the BullMQ limiter is Redis-global across ALL worker pods, and any other
  // Resend API traffic shares the same account budget).
  EMAIL_RATE_MAX: Joi.when('EMAIL_ENABLED', {
    is: true,
    then: Joi.when('EMAIL_PROVIDER', {
      is: 'resend',
      then: Joi.number().min(1).required(),
      otherwise: Joi.number().default(20),
    }),
    otherwise: Joi.number().default(20),
  }),
  EMAIL_RATE_DURATION_MS: Joi.number().default(1000),

  // Public origin of the WEB app — every mailed link is built from it.
  // main.ts additionally refuses to boot in production while it is a loopback
  // address; a URI check alone would happily accept http://localhost:5173.
  WEB_APP_URL: Joi.string().uri().default('http://localhost:5173'),

  // AI (Phase 2)
  LLM_PROVIDER: Joi.string().valid('anthropic', 'openai').default('anthropic'),
  LLM_API_KEY: Joi.string().allow('').default(''),
  LLM_MODEL: Joi.string().default('claude-opus-4-8'),
  LLM_MAX_INPUT_TOKENS: Joi.number().default(12000),
  LLM_MAX_OUTPUT_TOKENS: Joi.number().default(8000),
  LLM_TIMEOUT_MS: Joi.number().default(120000),
  LLM_MAX_COST_USD_PER_REQUEST: Joi.number().default(1.0),
  AI_FREE_GENERATIONS_PER_MONTH: Joi.number().default(2),
  AI_MAX_FILE_BYTES: Joi.number().default(10485760),
  AI_RATE_LIMIT_PER_HOUR: Joi.number().default(5),

  // Billing (Phase 3)
  PAYMENT_PROVIDER: Joi.string().valid('stripe').default('stripe'),
  STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  STRIPE_PUBLISHABLE_KEY: Joi.string().allow('').default(''),
  BILLING_SUCCESS_URL: Joi.string().default('http://localhost:5173/billing/success'),
  BILLING_CANCEL_URL: Joi.string().default('http://localhost:5173/billing/cancel'),
});
