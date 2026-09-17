import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['dist/src/**/*.entity.js'],
  migrations: ['dist/src/**/*.migration.js'],
  /** Allow migrations (e.g. Postgres enum ADD VALUE) to set `transaction = false`. */
  migrationsTransactionMode: 'each',
});
