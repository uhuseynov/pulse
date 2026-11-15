import request from 'supertest';
import { RESET_TOKEN_TTL_MINUTES } from '../src/auth/auth.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
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

  describe('email', () => {
    const outbox = () => app.get(MailService).outbox;
    const mailTo = (email: string) =>
      outbox().filter((mail) => mail.to === email);
    /** The reset token inside the newest email sent to an address. */
    const tokenFor = (email: string) => {
      const mail = mailTo(email).at(-1);
      const token = mail?.text.match(/reset-password\?token=([\w-]+)/)?.[1];
      if (!token) throw new Error(`No reset email was sent to ${email}`);
      return token;
    };
    const forgot = (email: string) =>
      http().post('/auth/forgot-password').send({ email });
    const reset = (token: string, password = 'a-brand-new-password') =>
      http().post('/auth/reset-password').send({ token, password });
    const login = (email: string, password: string) =>
      http().post('/auth/login').send({ email, password });

    it('welcomes a new user', async () => {
      const user = await createUser(app, 'mail_new');
      const [welcome] = mailTo(user.email);
      expect(welcome.subject).toBe('Welcome to Pulse');
      expect(welcome.text).toContain(user.username);
      expect(welcome.text).toContain('http://localhost:3000/app');
    });

    it('answers the same for known and unknown addresses', async () => {
      const user = await createUser(app, 'mail_known');
      const before = outbox().length;
      await forgot('nobody-at-all@example.com').expect(204);
      expect(outbox()).toHaveLength(before);

      const known = await forgot(user.email.toUpperCase()).expect(204);
      expect(known.body).toEqual({});
      expect(mailTo(user.email).at(-1)?.subject).toBe(
        'Reset your Pulse password',
      );
    });

    it('sets a new password with the emailed link, once', async () => {
      const user = await createUser(app, 'mail_reset');
      await forgot(user.email).expect(204);
      const token = tokenFor(user.email);

      await reset(token).expect(204);
      await login(user.email, 'correct-horse-battery').expect(401);
      await login(user.email, 'a-brand-new-password').expect(200);

      // The link is spent.
      const again = await reset(token, 'yet-another-password').expect(400);
      expect(again.body.message).toMatch(/invalid or has expired/);
      await login(user.email, 'yet-another-password').expect(401);
    });

    it('never stores the token itself', async () => {
      const user = await createUser(app, 'mail_hash');
      await forgot(user.email).expect(204);
      const token = tokenFor(user.email);
      const rows = await app
        .get(PrismaService)
        .passwordResetToken.findMany({ where: { userId: user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).not.toBe(token);
      expect(JSON.stringify(rows)).not.toContain(token);
    });

    it('signs out sessions that were open before the reset', async () => {
      const user = await createUser(app, 'mail_sessions');
      const me = (token: string) =>
        http().get('/auth/me').set('Authorization', `Bearer ${token}`);
      await me(user.token).expect(200);

      // Token times are whole seconds; make sure the reset is in a later one.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await forgot(user.email).expect(204);
      await reset(tokenFor(user.email)).expect(204);
      await me(user.token).expect(401);

      const fresh = await login(user.email, 'a-brand-new-password').expect(200);
      await me(fresh.body.accessToken).expect(200);
    });

    it('keeps only the newest link working', async () => {
      const user = await createUser(app, 'mail_twice');
      await forgot(user.email).expect(204);
      const first = tokenFor(user.email);
      await forgot(user.email).expect(204);
      const second = tokenFor(user.email);
      expect(second).not.toBe(first);

      await reset(first).expect(400);
      await reset(second).expect(204);
    });

    it('rejects an expired link', async () => {
      const user = await createUser(app, 'mail_expired');
      await forgot(user.email).expect(204);
      const prisma = app.get(PrismaService);
      const [row] = await prisma.passwordResetToken.findMany({
        where: { userId: user.id },
      });
      const lifetime = row.expiresAt.getTime() - row.createdAt.getTime();
      expect(Math.round(lifetime / 60_000)).toBe(RESET_TOKEN_TTL_MINUTES);

      await prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await reset(tokenFor(user.email)).expect(400);
      await login(user.email, 'correct-horse-battery').expect(200);
    });

    it('validates the request', async () => {
      const user = await createUser(app, 'mail_invalid');
      await forgot('not-an-email').expect(400);
      await forgot(user.email).expect(204);
      await reset(tokenFor(user.email), 'short').expect(400);
      await reset('x'.repeat(43)).expect(400);
      await http().post('/auth/reset-password').send({}).expect(400);
    });
  });
});
