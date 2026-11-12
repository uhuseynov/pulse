import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types';
import { useTestEnvironment } from './test-env';

export type TestApp = INestApplication<App>;

export async function createTestApp(): Promise<TestApp> {
  useTestEnvironment();
  // Imported lazily so the environment is set before any module reads it.
  const { AppModule } = await import('../src/app.module.js');
  const { configureApp } = await import('../src/app.setup.js');

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app: TestApp = moduleRef.createNestApplication();
  configureApp(app);
  // Listen on a random free port so Socket.IO clients can connect.
  await app.listen(0);
  return app;
}

let userCounter = 0;

export interface TestUser {
  id: string;
  username: string;
  email: string;
  token: string;
}

/** Registers a new user with a unique email and username. */
export async function createUser(
  app: TestApp,
  prefix = 'user',
): Promise<TestUser> {
  userCounter += 1;
  const username = `${prefix}_${Date.now().toString(36)}_${userCounter}`;
  const email = `${username}@example.com`;
  const response = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, username, password: 'correct-horse-battery' })
    .expect(201);
  return {
    id: response.body.user.id,
    username,
    email,
    token: response.body.accessToken,
  };
}

/** A supertest agent that sends the user's bearer token. */
export function as(app: TestApp, user: TestUser) {
  const server = app.getHttpServer();
  const auth = { Authorization: `Bearer ${user.token}` };
  return {
    get: (url: string) => request(server).get(url).set(auth),
    post: (url: string) => request(server).post(url).set(auth),
    delete: (url: string) => request(server).delete(url).set(auth),
  };
}

export async function connectSocket(
  app: TestApp,
  token?: string,
): Promise<Socket> {
  const url = await app.getUrl();
  const socket = io(url.replace('[::1]', 'localhost'), {
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

/** Resolves with the payload of the next `event`, or rejects on timeout. */
export function nextEvent<T = any>(
  socket: Socket,
  event: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Resolves true if `event` does NOT arrive within the window. */
export function expectNoEvent(
  socket: Socket,
  event: string,
  windowMs = 400,
): Promise<boolean> {
  return new Promise((resolve) => {
    const listener = () => resolve(false);
    socket.once(event, listener);
    setTimeout(() => {
      socket.off(event, listener);
      resolve(true);
    }, windowMs);
  });
}
