import type { Socket } from 'socket.io-client';
import {
  as,
  connectSocket,
  createTestApp,
  createUser,
  expectNoEvent,
  nextEvent,
  TestApp,
  TestUser,
} from './helpers';

describe('Realtime (e2e)', () => {
  let app: TestApp;
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let serverId: string;
  let inviteCode: string;
  let channelId: string;
  const sockets: Socket[] = [];

  const connect = async (user: TestUser) => {
    const socket = await connectSocket(app, user.token);
    sockets.push(socket);
    return socket;
  };

  beforeAll(async () => {
    app = await createTestApp();
    [owner, member, outsider] = await Promise.all([
      createUser(app, 'rt_owner'),
      createUser(app, 'rt_member'),
      createUser(app, 'rt_outsider'),
    ]);
    const server = await as(app, owner)
      .post('/servers')
      .send({ name: 'Realtime' })
      .expect(201);
    serverId = server.body.id;
    inviteCode = server.body.inviteCode;
    channelId = server.body.channels[0].id;
    await as(app, member)
      .post('/servers/join')
      .send({ inviteCode })
      .expect(200);
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

  afterAll(async () => {
    await app.close();
  });

  it('disconnects sockets without a valid token', async () => {
    const socket = await connectSocket(app, 'not-a-token');
    sockets.push(socket);
    // The server may already have dropped it by the time we get here.
    if (socket.connected) {
      await nextEvent(socket, 'disconnect');
    }
    expect(socket.connected).toBe(false);
  });

  it('delivers a new message to members but not to outsiders', async () => {
    const [memberSocket, outsiderSocket] = await Promise.all([
      connect(member),
      connect(outsider),
    ]);
    // Give the gateway a moment to put the sockets in their rooms.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const received = nextEvent(memberSocket, 'message:created');
    const leaked = expectNoEvent(outsiderSocket, 'message:created');

    const posted = await as(app, owner)
      .post(`/channels/${channelId}/messages`)
      .send({ content: 'live!' })
      .expect(201);

    await expect(received).resolves.toMatchObject({
      serverId,
      message: {
        id: posted.body.id,
        content: 'live!',
        channelId,
        author: { id: owner.id },
      },
    });
    await expect(leaked).resolves.toBe(true);
  });

  it('subscribes an already-connected user when they join a server', async () => {
    const newcomer = await createUser(app, 'rt_newcomer');
    const [newcomerSocket, ownerSocket] = await Promise.all([
      connect(newcomer),
      connect(owner),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const joined = nextEvent(ownerSocket, 'member:joined');
    await as(app, newcomer)
      .post('/servers/join')
      .send({ inviteCode })
      .expect(200);
    await expect(joined).resolves.toMatchObject({
      serverId,
      member: { user: { id: newcomer.id }, online: true },
    });

    const received = nextEvent(newcomerSocket, 'message:created');
    await as(app, owner)
      .post(`/channels/${channelId}/messages`)
      .send({ content: 'welcome' })
      .expect(201);
    await expect(received).resolves.toMatchObject({
      message: { content: 'welcome' },
    });

    // ...and stops receiving events after leaving.
    await as(app, newcomer).post(`/servers/${serverId}/leave`).expect(204);
    const silent = expectNoEvent(newcomerSocket, 'message:created');
    await as(app, owner)
      .post(`/channels/${channelId}/messages`)
      .send({ content: 'after leave' })
      .expect(201);
    await expect(silent).resolves.toBe(true);
  });

  it('broadcasts channel changes', async () => {
    const memberSocket = await connect(member);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const created = nextEvent(memberSocket, 'channel:created');
    const channel = await as(app, owner)
      .post(`/servers/${serverId}/channels`)
      .send({ name: 'announcements' })
      .expect(201);
    await expect(created).resolves.toMatchObject({
      id: channel.body.id,
      name: 'announcements',
    });

    const deleted = nextEvent(memberSocket, 'channel:deleted');
    await as(app, owner).delete(`/channels/${channel.body.id}`).expect(204);
    await expect(deleted).resolves.toEqual({
      serverId,
      channelId: channel.body.id,
    });
  });

  it('relays typing to other members only', async () => {
    const [ownerSocket, memberSocket, outsiderSocket] = await Promise.all([
      connect(owner),
      connect(member),
      connect(outsider),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const typing = nextEvent(ownerSocket, 'typing');
    const echoed = expectNoEvent(memberSocket, 'typing');
    memberSocket.emit('typing', { channelId });
    await expect(typing).resolves.toEqual({ channelId, userId: member.id });
    await expect(echoed).resolves.toBe(true);

    // An outsider cannot inject typing events into the server.
    const injected = expectNoEvent(ownerSocket, 'typing');
    outsiderSocket.emit('typing', { channelId });
    outsiderSocket.emit('typing', { channelId: 'garbage' });
    await expect(injected).resolves.toBe(true);
  });

  it('reports presence when a member connects and disconnects', async () => {
    const ownerSocket = await connect(owner);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const online = nextEvent(ownerSocket, 'presence:changed');
    const memberSocket = await connect(member);
    await expect(online).resolves.toEqual({ userId: member.id, online: true });

    const details = await as(app, owner)
      .get(`/servers/${serverId}`)
      .expect(200);
    const view = details.body.members.find((m: any) => m.user.id === member.id);
    expect(view.online).toBe(true);

    const offline = nextEvent(ownerSocket, 'presence:changed');
    memberSocket.disconnect();
    await expect(offline).resolves.toEqual({
      userId: member.id,
      online: false,
    });
  });
});
