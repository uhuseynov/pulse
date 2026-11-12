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
});
