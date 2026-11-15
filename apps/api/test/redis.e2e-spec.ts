import { Redis } from 'ioredis';
import type { Socket } from 'socket.io-client';
import {
  as,
  befriend,
  connectSocket,
  createTestApp,
  createUser,
  expectNoEvent,
  nextEvent,
  settle,
  TestApp,
  TestUser,
} from './helpers';
import { testRedisUrl } from './test-env';

/**
 * Two API instances share one database and one Redis, the way they would
 * behind a load balancer. Every test has its users on different instances.
 */
describe('Two API instances sharing Redis (e2e)', () => {
  let first: TestApp;
  let second: TestApp;
  let owner: TestUser;
  let member: TestUser;
  let serverId: string;
  let channelId: string;
  const sockets: Socket[] = [];

  const connect = async (app: TestApp, user: TestUser) => {
    const socket = await connectSocket(app, user.token);
    sockets.push(socket);
    return socket;
  };

  beforeAll(async () => {
    const probe = new Redis(testRedisUrl(), {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    probe.on('error', () => undefined);
    try {
      await probe.connect();
    } catch {
      throw new Error(
        'Could not connect to Redis. Start it with `docker compose up -d` ' +
          'and try again.',
      );
    } finally {
      probe.disconnect();
    }

    first = await createTestApp({ redis: true });
    second = await createTestApp({ redis: true });
    [owner, member] = await Promise.all([
      createUser(first, 'rd_owner'),
      createUser(first, 'rd_member'),
    ]);
    const server = await as(first, owner)
      .post('/servers')
      .send({ name: 'Scaled out' })
      .expect(201);
    serverId = server.body.id;
    channelId = server.body.channels[0].id;
    await as(second, member)
      .post('/servers/join')
      .send({ inviteCode: server.body.inviteCode })
      .expect(200);
  });

  afterEach(async () => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
    await settle();
  });

  afterAll(async () => {
    await first?.close();
    await second?.close();
  });

  it('delivers a message sent through one instance to a client on the other', async () => {
    const memberSocket = await connect(second, member);
    await settle();

    const received = nextEvent(memberSocket, 'message:created');
    const sent = await as(first, owner)
      .post(`/channels/${channelId}/messages`)
      .send({ content: 'across instances' })
      .expect(201);
    await expect(received).resolves.toMatchObject({
      serverId,
      message: { id: sent.body.id },
    });
  });

  it('shares presence between instances', async () => {
    const ownerSocket = await connect(first, owner);
    await settle();

    const online = nextEvent(ownerSocket, 'presence:changed');
    const memberSocket = await connect(second, member);
    await expect(online).resolves.toEqual({
      userId: member.id,
      status: 'online',
    });

    // Asked through the instance the member is NOT connected to.
    const view = async () =>
      (
        await as(first, owner).get(`/servers/${serverId}`).expect(200)
      ).body.members.find((m: any) => m.user.id === member.id).status;
    await expect(view()).resolves.toBe('online');

    const idle = nextEvent(ownerSocket, 'presence:changed');
    memberSocket.emit('presence:activity', { idle: true });
    await expect(idle).resolves.toEqual({ userId: member.id, status: 'idle' });
    await expect(view()).resolves.toBe('idle');

    const offline = nextEvent(ownerSocket, 'presence:changed');
    memberSocket.disconnect();
    await expect(offline).resolves.toEqual({
      userId: member.id,
      status: 'offline',
    });
    await expect(view()).resolves.toBe('offline');
  });

  it('counts tabs on different instances as one user', async () => {
    const ownerSocket = await connect(first, owner);
    const tabOne = await connect(first, member);
    await settle();

    // A second tab on the other instance is not news.
    const nothing = expectNoEvent(ownerSocket, 'presence:changed');
    const tabTwo = await connect(second, member);
    await expect(nothing).resolves.toBe(true);

    // Closing one of the two is not news either.
    const still = expectNoEvent(ownerSocket, 'presence:changed');
    tabOne.disconnect();
    await expect(still).resolves.toBe(true);

    const offline = nextEvent(ownerSocket, 'presence:changed');
    tabTwo.disconnect();
    await expect(offline).resolves.toEqual({
      userId: member.id,
      status: 'offline',
    });
  });

  it('shares voice occupancy and removes a kicked member from it', async () => {
    const voice = await as(first, owner)
      .post(`/servers/${serverId}/channels`)
      .send({ name: 'lounge', type: 'VOICE' })
      .expect(201);
    const guest = await createUser(first, 'rd_guest');
    const joined = await as(first, guest)
      .post('/servers/join')
      .send({
        inviteCode: (await as(first, owner).get(`/servers/${serverId}`)).body
          .inviteCode,
      })
      .expect(200);
    const guestMemberId = joined.body.members.find(
      (m: any) => m.user.id === guest.id,
    ).id;

    const ownerSocket = await connect(first, owner);
    const guestSocket = await connect(second, guest);
    await settle();

    const entered = nextEvent(ownerSocket, 'voice:participants');
    guestSocket.emit('voice:join', { channelId: voice.body.id });
    await expect(entered).resolves.toMatchObject({ userIds: [guest.id] });

    const details = await as(first, owner)
      .get(`/servers/${serverId}`)
      .expect(200);
    expect(details.body.voiceParticipants).toEqual({
      [voice.body.id]: [guest.id],
    });

    // Kicked through the instance their socket is NOT connected to.
    const emptied = nextEvent(ownerSocket, 'voice:participants');
    const kicked = nextEvent(guestSocket, 'server:kicked');
    await as(first, owner)
      .delete(`/servers/${serverId}/members/${guestMemberId}`)
      .expect(204);
    await expect(kicked).resolves.toEqual({ serverId });
    await expect(emptied).resolves.toMatchObject({ userIds: [] });
  });

  it('delivers direct messages and friend updates across instances', async () => {
    const ownerSocket = await connect(first, owner);
    const memberSocket = await connect(second, member);
    await settle();

    const changed = nextEvent(memberSocket, 'friends:changed');
    await befriend(first, owner, member);
    await changed;

    const conversation = await as(first, owner)
      .post('/conversations')
      .send({ userId: member.id })
      .expect(200);
    const received = nextEvent(memberSocket, 'message:created');
    const echoed = nextEvent(ownerSocket, 'message:created');
    await as(second, member)
      .post(`/conversations/${conversation.body.id}/messages`)
      .send({ content: 'psst' })
      .expect(201);
    await expect(received).resolves.toMatchObject({ serverId: null });
    await expect(echoed).resolves.toMatchObject({
      message: { content: 'psst' },
    });
  });
});
