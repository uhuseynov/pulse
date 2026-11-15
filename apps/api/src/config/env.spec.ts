import { validateEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults and coerces the port', () => {
    expect(validateEnv({ ...valid, PORT: '5000' })).toMatchObject({
      PORT: 5000,
      JWT_EXPIRES_IN: '7d',
      WEB_ORIGIN: ['http://localhost:3000'],
    });
  });

  it('accepts several web origins and trims trailing slashes', () => {
    const env = validateEnv({
      ...valid,
      WEB_ORIGIN: 'https://pulse.example.com/, http://localhost:3000',
    });
    expect(env.WEB_ORIGIN).toEqual([
      'https://pulse.example.com',
      'http://localhost:3000',
    ]);
  });

  it('rejects a web origin that is not a URL', () => {
    expect(() => validateEnv({ ...valid, WEB_ORIGIN: 'pulse' })).toThrow(
      /WEB_ORIGIN/,
    );
  });

  it('names every missing or weak variable', () => {
    expect(() => validateEnv({ JWT_SECRET: 'too-short' })).toThrow(
      /DATABASE_URL[\s\S]*JWT_SECRET/,
    );
  });

  it('treats an empty REDIS_URL as not set', () => {
    expect(validateEnv({ ...valid }).REDIS_URL).toBeUndefined();
    expect(
      validateEnv({ ...valid, REDIS_URL: '  ' }).REDIS_URL,
    ).toBeUndefined();
    expect(
      validateEnv({ ...valid, REDIS_URL: 'rediss://default:pw@host:6379' })
        .REDIS_URL,
    ).toBe('rediss://default:pw@host:6379');
  });

  it('rejects a REDIS_URL that is not a Redis address', () => {
    expect(() =>
      validateEnv({ ...valid, REDIS_URL: 'http://localhost:6379' }),
    ).toThrow(/REDIS_URL/);
  });
});
