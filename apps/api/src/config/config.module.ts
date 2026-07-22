import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { allConfigs } from './configuration';
import { envValidationSchema } from './env.validation';

/**
 * Global configuration module. Loads namespaced config and validates the
 * environment at boot (fail-fast on missing/invalid vars).
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: allConfigs,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
      envFilePath: ['.env.local', '.env'],
    }),
  ],
})
export class AppConfigModule {}
