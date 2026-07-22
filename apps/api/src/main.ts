import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig, AuthConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  // rawBody:true preserves the unparsed request body (as `req.rawBody`)
  // alongside the normal parsed `req.body` — needed to verify the Stripe
  // webhook's HMAC signature, which is computed over the exact raw bytes.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });

  const config = app.get(ConfigService);
  const appCfg = config.getOrThrow<AppConfig>('app');
  const authCfg = config.getOrThrow<AuthConfig>('auth');
  const logger = new Logger('Bootstrap');

  // The access/refresh tokens are httpOnly cookies; without Secure they are
  // sent over plaintext HTTP. Refuse to boot in production with it unset.
  if (appCfg.isProd && !authCfg.cookieSecure) {
    throw new Error('AUTH_COOKIE_SECURE must be true in production');
  }

  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix(appCfg.apiPrefix);
  app.enableShutdownHooks();

  // Global validation is registered once, via APP_PIPE in AppModule — do not
  // duplicate it here (a second app.useGlobalPipes() would double-validate
  // every request with a second, divergent config).

  // Cookie-based auth means CORS + credentials must never resolve to a
  // reflected/wildcard origin: that would let any origin read authenticated
  // responses via the browser-sent httpOnly cookie. Fail closed in
  // production if no explicit allow-list is configured.
  if (appCfg.isProd && appCfg.corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must be set to an explicit allow-list in production');
  }
  app.enableCors({
    origin: appCfg.corsOrigins.length ? appCfg.corsOrigins : true,
    credentials: true,
  });

  // The interactive API explorer maps the entire surface area for anyone who
  // can reach it — keep it out of production deployments.
  if (!appCfg.isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CodeStack API')
      .setDescription('LeetCode-style coding-education platform')
      .setVersion('1.0')
      .addCookieAuth('access_token')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`Swagger docs at :${appCfg.port}/api/docs`);
  }

  await app.listen(appCfg.port);
  logger.log(`CodeStack API listening on :${appCfg.port}/${appCfg.apiPrefix}`);
}

void bootstrap();
