const DEFAULT_URL =
  'postgresql://pulse:pulse_dev_password@localhost:5432/pulse?schema=public';

export const TEST_DATABASE = 'pulse_test';

/** Connection string of the development database from .env (or the default). */
export function devDatabaseUrl(): string {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: fall back to the docker-compose defaults.
  }
  return process.env.DATABASE_URL ?? DEFAULT_URL;
}

/** Same server and credentials, but pointing at the throwaway test database. */
export function testDatabaseUrl(): string {
  const url = new URL(devDatabaseUrl());
  url.pathname = `/${TEST_DATABASE}`;
  return url.toString();
}

/** Point the app at the test database. Call before the AppModule is created. */
export function useTestEnvironment() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.WEB_ORIGIN = 'http://localhost:3000';
  // The suites register many users from one address.
  process.env.AUTH_RATE_LIMIT = '10000';
  // Tokens are signed locally, so the tests never reach LiveKit itself.
  process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'APITestKey';
  process.env.LIVEKIT_API_SECRET = 'test-secret-at-least-32-characters-long';
}
