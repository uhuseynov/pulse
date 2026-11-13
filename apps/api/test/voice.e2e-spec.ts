import { decodeJwt } from 'jose';
import request from 'supertest';
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

describe('Voice rooms (e2e)', () => {
  let app: TestApp;
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let serverId: string;
  let textChannelId: string;
  let voiceChannelId: string;
  const sockets: Socket[] = [];

  const connect = async (user: TestUser) => {
    const socket = await connectSocket(app, user.token);
    sockets.push(socket);
    return socket;
  };

  /** Lets the gateway finish putting a socket in its rooms. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

  beforeAll(async () => {
    app = await createTestApp();
    [owner, member, outsider] = await Promise.all([
      createUser(app, 'voice_owner'),
      createUser(app, 'voice_member'),
      createUser(app, 'voice_outsider'),
    ]);

    const server = await as(app, owner)
      .post('/servers')
      .send({ name: 'Voice Server' })
      .expect(201);
    serverId = server.body.id;
    textChannelId = server.body.channels[0].id;
    await as(app, member)
      .post('/servers/join')
      .send({ inviteCode: server.body.inviteCode })
      .expect(200);

    const voice = await as(app, owner)
      .post(`/servers/${serverId}/channels`)
      .send({ name: 'Lounge', type: 'VOICE' })
      .expect(201);
    voiceChannelId = voice.body.id;
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('voice channels', () => {
    it('creates a voice channel alongside text ones', async () => {
      const details = await as(app, member)
        .get(`/servers/${serverId}`)
        .expect(200);
      expect(details.body.channels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'general', type: 'TEXT' }),
          expect.objectContaining({
            id: voiceChannelId,
            name: 'lounge',
            type: 'VOICE',
          }),
        ]),
      );
    });

    it('defaults to a text channel and rejects an unknown type', async () => {
      const created = await as(app, owner)
        .post(`/servers/${serverId}/channels`)
        .send({ name: 'defaults' })
        .expect(201);
      expect(created.body.type).toBe('TEXT');

      await as(app, owner)
        .post(`/servers/${serverId}/channels`)
        .send({ name: 'bogus', type: 'SMOKE_SIGNAL' })
        .expect(400);
    });

    it('keeps the last text channel but lets voice channels go', async () => {
      const solo = await as(app, owner)
        .post('/servers')
        .send({ name: 'Solo Voice' })
        .expect(201);
      const onlyText = solo.body.channels[0].id;
      const voice = await as(app, owner)
        .post(`/servers/${solo.body.id}/channels`)
        .send({ name: 'talk', type: 'VOICE' })
        .expect(201);

      // The voice channel is not a substitute for the last text channel.
      await as(app, owner).delete(`/channels/${onlyText}`).expect(400);
      await as(app, owner).delete(`/channels/${voice.body.id}`).expect(204);
    });
  });

  describe('GET /voice/config', () => {
    it('reports that voice is available', async () => {
      const response = await request(app.getHttpServer())
        .get('/voice/config')
        .expect(200);
      expect(response.body).toEqual({ enabled: true });
    });
  });

  describe('POST /channels/:channelId/voice-token', () => {
    it('gives a member a token scoped to that channel', async () => {
      const response = await as(app, member)
        .post(`/channels/${voiceChannelId}/voice-token`)
        .expect(201);
      expect(response.body.url).toBe(process.env.LIVEKIT_URL);

      const claims = decodeJwt(response.body.token) as {
        sub: string;
        name: string;
        video: { room: string; canPublish: boolean };
      };
      expect(claims.sub).toBe(member.id);
      expect(claims.name).toBe(member.username);
      expect(claims.video.room).toBe(voiceChannelId);
      expect(claims.video.canPublish).toBe(true);
    });

    it('refuses a text channel', async () => {
      await as(app, member)
        .post(`/channels/${textChannelId}/voice-token`)
        .expect(400);
    });

    it('refuses outsiders and anonymous callers', async () => {
      await as(app, outsider)
        .post(`/channels/${voiceChannelId}/voice-token`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/channels/${voiceChannelId}/voice-token`)
        .expect(401);
    });
  });

  describe('who is in the room', () => {
    it('announces joins and leaves to the server', async () => {
      const [ownerSocket, memberSocket] = await Promise.all([
        connect(owner),
        connect(member),
      ]);
      await settle();

      const joined = nextEvent(ownerSocket, 'voice:participants');
      memberSocket.emit('voice:join', { channelId: voiceChannelId });
      await expect(joined).resolves.toEqual({
        serverId,
        channelId: voiceChannelId,
        userIds: [member.id],
      });

      // A fresh page load sees the same thing.
      const details = await as(app, owner)
        .get(`/servers/${serverId}`)
        .expect(200);
      expect(details.body.voiceParticipants).toEqual({
        [voiceChannelId]: [member.id],
      });

      const left = nextEvent(ownerSocket, 'voice:participants');
      memberSocket.emit('voice:leave', {});
      await expect(left).resolves.toEqual({
        serverId,
        channelId: voiceChannelId,
        userIds: [],
      });
    });

    it('empties the room when a socket drops', async () => {
      const [ownerSocket, memberSocket] = await Promise.all([
        connect(owner),
        connect(member),
      ]);
      await settle();

      const joined = nextEvent(ownerSocket, 'voice:participants');
      memberSocket.emit('voice:join', { channelId: voiceChannelId });
      await joined;

      const left = nextEvent(ownerSocket, 'voice:participants');
      memberSocket.disconnect();
      await expect(left).resolves.toMatchObject({
        channelId: voiceChannelId,
        userIds: [],
      });
    });

    it('ignores joins from outsiders and for text channels', async () => {
      const [ownerSocket, outsiderSocket] = await Promise.all([
        connect(owner),
        connect(outsider),
      ]);
      await settle();

      const quiet = expectNoEvent(ownerSocket, 'voice:participants', 800);
      outsiderSocket.emit('voice:join', { channelId: voiceChannelId });
      ownerSocket.emit('voice:join', { channelId: textChannelId });
      ownerSocket.emit('voice:join', { channelId: 'not-a-uuid' });
      await expect(quiet).resolves.toBe(true);

      const details = await as(app, owner)
        .get(`/servers/${serverId}`)
        .expect(200);
      expect(details.body.voiceParticipants).toEqual({});
    });
  });
});
