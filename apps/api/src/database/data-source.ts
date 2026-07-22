import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

// Load .env for standalone CLI usage (migrations / seeds).
loadEnv({ path: '.env.local' });
loadEnv();

const bool = (v: string | undefined): boolean => v === 'true' || v === '1';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  ...(process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL }
    : {
        host: process.env.DATABASE_HOST ?? 'localhost',
        port: Number(process.env.DATABASE_PORT ?? 5432),
        username: process.env.DATABASE_USER ?? 'codestack',
        password: process.env.DATABASE_PASSWORD ?? 'codestack',
        database: process.env.DATABASE_NAME ?? 'codestack',
      }),
  ssl: bool(process.env.DATABASE_SSL) ? { rejectUnauthorized: false } : false,
  logging: bool(process.env.DATABASE_LOGGING),
  // Anchored to __dirname so ts-node (src/*.ts) and compiled runtime (dist/*.js)
  // each match only their own files — never both (avoids duplicate migrations).
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
