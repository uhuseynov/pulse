import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { devDatabaseUrl, TEST_DATABASE, testDatabaseUrl } from './test-env';

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

/**
 * Recreates the test database and applies every migration to it, so the e2e
 * tests always run against the schema that is committed in prisma/migrations.
 */
export default async function globalSetup() {
  const admin = new Client({ connectionString: devDatabaseUrl() });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      'Could not connect to PostgreSQL. Start it with `docker compose up -d` ' +
        `and try again. (${(error as Error).message})`,
    );
  }
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  await admin.end();

  const db = new Client({ connectionString: testDatabaseUrl() });
  await db.connect();
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migration of migrations) {
    await db.query(
      readFileSync(join(MIGRATIONS_DIR, migration, 'migration.sql'), 'utf8'),
    );
  }
  await db.end();
}
