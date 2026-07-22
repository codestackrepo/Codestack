import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConfig } from '../config/configuration';

/**
 * Runtime database connection for the Nest app. Uses config namespaces and
 * auto-loads entities from every feature module. Migrations are run via the
 * CLI data-source (never `synchronize` in any environment).
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.getOrThrow<DatabaseConfig>('database');
        return {
          type: 'postgres' as const,
          ...(db.url
            ? { url: db.url }
            : {
                host: db.host,
                port: db.port,
                username: db.username,
                password: db.password,
                database: db.database,
              }),
          ssl: db.ssl ? { rejectUnauthorized: false } : false,
          autoLoadEntities: true,
          synchronize: false,
          logging: db.logging,
          // Connection pool sizing — kept modest; scale via replicas + PgBouncer.
          extra: { max: 20 },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
