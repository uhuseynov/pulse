import request from 'supertest';
import { createTestApp, TestApp } from './helpers';

describe('Health (e2e)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health reports that the API is up', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({
      status: 'ok',
      service: 'pulse-api',
      message: 'Pulse backend is running!',
    });
  });
});
