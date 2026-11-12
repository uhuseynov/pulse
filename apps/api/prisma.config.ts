import { defineConfig } from 'prisma/config';

// The Prisma CLI does not read .env on its own.
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on variables already set in the environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
