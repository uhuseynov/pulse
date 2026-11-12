import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { as, createTestApp, createUser, TestApp, TestUser } from './helpers';

describe('Servers, channels and messages (e2e)', () => {
  let app: TestApp;
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let server: { id: string; inviteCode: string; channels: { id: string }[] };
  let generalId: string;

  beforeAll(async () => {
    app = await createTestApp();
    [owner, member, outsider] = await Promise.all([
      createUser(app, 'owner'),
      createUser(app, 'member'),
      createUser(app, 'outsider'),
    ]);

    const created = await as(app, owner)
      .post('/servers')
      .send({ name: 'Test Server' })
      .expect(201);
    server = created.body;
    generalId = server.channels[0].id;

    await as(app, member)
      .post('/servers/join')
      .send({ inviteCode: server.inviteCode })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('servers', () => {
    it('creates a server with an owner membership and a general channel', async () => {
      const response = await as(app, owner)
        .get(`/servers/${server.id}`)
        .expect(200);
      expect(response.body.name).toBe('Test Server');
      expect(response.body.channels.map((c: any) => c.name)).toEqual([
        'general',
      ]);
      expect(response.body.members).toEqual([
        expect.objectContaining({
          role: 'OWNER',
          user: expect.objectContaining({ id: owner.id }),
        }),
        expect.objectContaining({
          role: 'MEMBER',
          user: expect.objectContaining({ id: member.id }),
        }),
      ]);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/servers').expect(401);
    });

    it('lists only the servers the user belongs to', async () => {
      const mine = await as(app, member).get('/servers').expect(200);
      expect(mine.body.map((s: any) => s.id)).toContain(server.id);

      const theirs = await as(app, outsider).get('/servers').expect(200);
      expect(theirs.body.map((s: any) => s.id)).not.toContain(server.id);
    });

    it('hides a server from non-members', async () => {
      await as(app, outsider).get(`/servers/${server.id}`).expect(404);
    });

    it('rejects a malformed id with 400 and an unknown invite with 404', async () => {
      await as(app, owner).get('/servers/not-a-uuid').expect(400);
      await as(app, outsider)
        .post('/servers/join')
        .send({ inviteCode: 'nope' })
        .expect(404);
    });

    it('joining twice does not create a second membership', async () => {
      const response = await as(app, member)
        .post('/servers/join')
        .send({ inviteCode: server.inviteCode })
        .expect(200);
      expect(response.body.members).toHaveLength(2);
    });
  });

  describe('channels', () => {
    it('lets the owner create a channel and normalises its name', async () => {
      const response = await as(app, owner)
        .post(`/servers/${server.id}/channels`)
        .send({ name: 'Off Topic' })
        .expect(201);
      expect(response.body.name).toBe('off-topic');
    });

    it('rejects a duplicate channel name with 409', async () => {
      await as(app, owner)
        .post(`/servers/${server.id}/channels`)
        .send({ name: 'general' })
        .expect(409);
    });

    it('does not let a regular member create or delete channels', async () => {
      await as(app, member)
        .post(`/servers/${server.id}/channels`)
        .send({ name: 'secret' })
        .expect(403);
      await as(app, member).delete(`/channels/${generalId}`).expect(403);
    });

    it('does not let an outsider create channels', async () => {
      await as(app, outsider)
        .post(`/servers/${server.id}/channels`)
        .send({ name: 'spam' })
        .expect(404);
    });

    it('deletes a channel but never the last one', async () => {
      const solo = await as(app, owner)
        .post('/servers')
        .send({ name: 'Solo' })
        .expect(201);
      const onlyChannel = solo.body.channels[0].id;
      await as(app, owner).delete(`/channels/${onlyChannel}`).expect(400);

      const extra = await as(app, owner)
        .post(`/servers/${solo.body.id}/channels`)
        .send({ name: 'extra' })
        .expect(201);
      await as(app, owner).delete(`/channels/${extra.body.id}`).expect(204);
    });
  });

  describe('messages', () => {
    it('lets members post and read messages', async () => {
      const posted = await as(app, member)
        .post(`/channels/${generalId}/messages`)
        .send({ content: '  hello there  ' })
        .expect(201);
      expect(posted.body).toMatchObject({
        content: 'hello there',
        channelId: generalId,
        author: { id: member.id, username: member.username },
      });

      const list = await as(app, owner)
        .get(`/channels/${generalId}/messages`)
        .expect(200);
      expect(list.body.items.map((m: any) => m.id)).toContain(posted.body.id);
    });

    it('rejects empty and oversized messages', async () => {
      await as(app, member)
        .post(`/channels/${generalId}/messages`)
        .send({ content: '   ' })
        .expect(400);
      await as(app, member)
        .post(`/channels/${generalId}/messages`)
        .send({ content: 'x'.repeat(4001) })
        .expect(400);
    });

    it('does not let outsiders read or post', async () => {
      await as(app, outsider)
        .get(`/channels/${generalId}/messages`)
        .expect(404);
      await as(app, outsider)
        .post(`/channels/${generalId}/messages`)
        .send({ content: 'let me in' })
        .expect(404);
      await as(app, owner)
        .get(`/channels/${randomUUID()}/messages`)
        .expect(404);
    });

    it('pages through history oldest-first with a cursor', async () => {
      const channel = await as(app, owner)
        .post(`/servers/${server.id}/channels`)
        .send({ name: 'paging' })
        .expect(201);
      const url = `/channels/${channel.body.id}/messages`;
      for (let i = 1; i <= 5; i += 1) {
        await as(app, owner)
          .post(url)
          .send({ content: `m${i}` })
          .expect(201);
      }

      const newest = await as(app, owner).get(`${url}?limit=2`).expect(200);
      expect(newest.body.items.map((m: any) => m.content)).toEqual([
        'm4',
        'm5',
      ]);
      expect(newest.body.nextCursor).toBe(newest.body.items[0].id);

      const middle = await as(app, owner)
        .get(`${url}?limit=2&before=${newest.body.nextCursor}`)
        .expect(200);
      expect(middle.body.items.map((m: any) => m.content)).toEqual([
        'm2',
        'm3',
      ]);

      const oldest = await as(app, owner)
        .get(`${url}?limit=2&before=${middle.body.nextCursor}`)
        .expect(200);
      expect(oldest.body.items.map((m: any) => m.content)).toEqual(['m1']);
      expect(oldest.body.nextCursor).toBeNull();

      await as(app, owner).get(`${url}?limit=1000`).expect(400);
    });
  });

  describe('leaving and deleting', () => {
    it('lets a member leave, after which the server is hidden from them', async () => {
      const guest = await createUser(app, 'guest');
      await as(app, guest)
        .post('/servers/join')
        .send({ inviteCode: server.inviteCode })
        .expect(200);
      await as(app, guest).post(`/servers/${server.id}/leave`).expect(204);
      await as(app, guest).get(`/servers/${server.id}`).expect(404);
    });

    it('does not let the owner leave or a member delete the server', async () => {
      await as(app, owner).post(`/servers/${server.id}/leave`).expect(400);
      await as(app, member).delete(`/servers/${server.id}`).expect(403);
    });

    it('lets the owner delete the server along with its data', async () => {
      const doomed = await as(app, owner)
        .post('/servers')
        .send({ name: 'Doomed' })
        .expect(201);
      const channelId = doomed.body.channels[0].id;
      await as(app, owner)
        .post(`/channels/${channelId}/messages`)
        .send({ content: 'bye' })
        .expect(201);

      await as(app, owner).delete(`/servers/${doomed.body.id}`).expect(204);
      await as(app, owner).get(`/servers/${doomed.body.id}`).expect(404);
      await as(app, owner).get(`/channels/${channelId}/messages`).expect(404);
    });
  });
});
