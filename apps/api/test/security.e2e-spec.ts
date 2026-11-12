import request from 'supertest';
import { createTestApp, TestApp } from './helpers';

describe('Security (e2e)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
    // Read on every request, so it can be lowered for this suite only.
    process.env.AUTH_RATE_LIMIT = '3';
  });

  afterAll(async () => {
    process.env.AUTH_RATE_LIMIT = '10000';
    await app.close();
  });

  it('rate limits repeated sign-in attempts', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'guess-guess' });

    for (let i = 0; i < 3; i += 1) {
      await attempt().expect(401);
    }
    await attempt().expect(429);
  });

  it('does not rate limit the health check', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer()).get('/health').expect(200);
    }
  });

  it('sends security headers and hides the framework', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('only allows the configured web origin', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );

    const other = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example.com');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
