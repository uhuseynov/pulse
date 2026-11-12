import request from 'supertest';
import { createTestApp, createUser, TestApp } from './helpers';

describe('Auth (e2e)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('POST /auth/register', () => {
    it('creates a user and returns a token, never the password hash', async () => {
      const response = await http()
        .post('/auth/register')
        .send({
          email: 'New.Person@Example.com',
          username: 'New_Person',
          displayName: 'New Person',
          password: 'correct-horse-battery',
        })
        .expect(201);

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.user).toMatchObject({
        email: 'new.person@example.com',
        username: 'new_person',
        displayName: 'New Person',
      });
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('rejects invalid input with 400', async () => {
      const response = await http()
        .post('/auth/register')
        .send({ email: 'not-an-email', username: 'a b', password: 'short' })
        .expect(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('email')]),
      );
    });

    it('rejects a duplicate email or username with 409', async () => {
      const user = await createUser(app);
      await http()
        .post('/auth/register')
        .send({
          email: user.email.toUpperCase(),
          username: 'someone_else',
          password: 'correct-horse-battery',
        })
        .expect(409);
      await http()
        .post('/auth/register')
        .send({
          email: 'another@example.com',
          username: user.username,
          password: 'correct-horse-battery',
        })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('returns a token for the right password', async () => {
      const user = await createUser(app);
      const response = await http()
        .post('/auth/login')
        .send({ email: user.email, password: 'correct-horse-battery' })
        .expect(200);
      expect(response.body.user.id).toBe(user.id);
      expect(response.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects a wrong password and an unknown email the same way', async () => {
      const user = await createUser(app);
      const wrongPassword = await http()
        .post('/auth/login')
        .send({ email: user.email, password: 'wrong-password' })
        .expect(401);
      const unknownEmail = await http()
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password' })
        .expect(401);
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current user', async () => {
      const user = await createUser(app);
      const response = await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);
      expect(response.body).toMatchObject({
        id: user.id,
        username: user.username,
      });
    });

    it('rejects a missing or forged token', async () => {
      await http().get('/auth/me').expect(401);
      await http()
        .get('/auth/me')
        .set('Authorization', 'Bearer not.a.token')
        .expect(401);
    });
  });
});
