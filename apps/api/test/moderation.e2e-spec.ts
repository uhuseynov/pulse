import type { Socket } from 'socket.io-client';
import {
  as,
  connectSocket,
  createTestApp,
  createUser,
  expectNoEvent,
  nextEvent,
  settle,
  TestApp,
  TestUser,
} from './helpers';

describe('Message editing and member management (e2e)', () => {
  let app: TestApp;
  let owner: TestUser;
  let admin: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let serverId: string;
  let channelId: string;
  let inviteCode: string;
  const memberIds: Record<string, string> = {};
  const sockets: Socket[] = [];

  const connect = async (user: TestUser) => {
    const socket = await connectSocket(app, user.token);
    sockets.push(socket);
    return socket;
  };

  const send = async (user: TestUser, content: string) => {
    const response = await as(app, user)
      .post(`/channels/${channelId}/messages`)
      .send({ content })
      .expect(201);
    return response.body.id as string;
  };

  const join = async (user: TestUser) => {
    const response = await as(app, user)
      .post('/servers/join')
      .send({ inviteCode })
      .expect(200);
    for (const m of response.body.members) memberIds[m.user.id] = m.id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    [owner, admin, member, outsider] = await Promise.all([
      createUser(app, 'mod_owner'),
      createUser(app, 'mod_admin'),
      createUser(app, 'mod_member'),
      createUser(app, 'mod_outsider'),
    ]);
    const server = await as(app, owner)
      .post('/servers')
      .send({ name: 'Moderation' })
      .expect(201);
    serverId = server.body.id;
    channelId = server.body.channels[0].id;
    inviteCode = server.body.inviteCode;
    await join(admin);
    await join(member);
    await as(app, owner)
      .patch(`/servers/${serverId}/members/${memberIds[admin.id]}`)
      .send({ role: 'ADMIN' })
      .expect(200);
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('editing a message', () => {
    it('lets the author edit, and tells the server', async () => {
      const id = await send(member, 'frist');
      const ownerSocket = await connect(owner);
      await settle();

      const updated = nextEvent(ownerSocket, 'message:updated');
      const response = await as(app, member)
        .patch(`/messages/${id}`)
        .send({ content: '  first  ' })
        .expect(200);
      expect(response.body).toMatchObject({ id, content: 'first', channelId });
      expect(response.body.editedAt).not.toBeNull();
      await expect(updated).resolves.toMatchObject({
        serverId,
        message: { id, content: 'first' },
      });

      const page = await as(app, owner)
        .get(`/channels/${channelId}/messages`)
        .expect(200);
      expect(page.body.items.at(-1)).toMatchObject({ id, content: 'first' });
    });

    it('refuses everyone but the author, even the owner', async () => {
      const id = await send(member, 'mine');
      await as(app, owner)
        .patch(`/messages/${id}`)
        .send({ content: 'hijacked' })
        .expect(403);
      await as(app, outsider)
        .patch(`/messages/${id}`)
        .send({ content: 'hijacked' })
        .expect(404);
    });

    it('validates the new content', async () => {
      const id = await send(member, 'valid');
      await as(app, member)
        .patch(`/messages/${id}`)
        .send({ content: '   ' })
        .expect(400);
      await as(app, member)
        .patch('/messages/not-a-uuid')
        .send({ content: 'x' })
        .expect(400);
    });
  });

  describe('deleting a message', () => {
    it('lets the author delete, and tells the server', async () => {
      const id = await send(member, 'oops');
      const ownerSocket = await connect(owner);
      await settle();

      const deleted = nextEvent(ownerSocket, 'message:deleted');
      await as(app, member).delete(`/messages/${id}`).expect(204);
      await expect(deleted).resolves.toEqual({
        serverId,
        channelId,
        conversationId: null,
        messageId: id,
      });
      await as(app, member).delete(`/messages/${id}`).expect(404);
    });

    it('lets admins and the owner delete, but not other members', async () => {
      const first = await send(owner, 'from the owner');
      const second = await send(member, 'from a member');
      const third = await send(member, 'another');

      await as(app, member).delete(`/messages/${first}`).expect(403);
      await as(app, outsider).delete(`/messages/${first}`).expect(404);
      await as(app, admin).delete(`/messages/${second}`).expect(204);
      await as(app, owner).delete(`/messages/${third}`).expect(204);
    });
  });

  describe('roles', () => {
    it('lets only the owner change roles', async () => {
      const path = `/servers/${serverId}/members/${memberIds[member.id]}`;
      await as(app, admin).patch(path).send({ role: 'ADMIN' }).expect(403);
      await as(app, member).patch(path).send({ role: 'ADMIN' }).expect(403);
      await as(app, outsider).patch(path).send({ role: 'ADMIN' }).expect(404);

      const memberSocket = await connect(member);
      await settle();
      const updated = nextEvent(memberSocket, 'member:updated');
      const response = await as(app, owner)
        .patch(path)
        .send({ role: 'ADMIN' })
        .expect(200);
      expect(response.body).toMatchObject({
        id: memberIds[member.id],
        role: 'ADMIN',
        status: 'online',
      });
      await expect(updated).resolves.toMatchObject({
        serverId,
        member: { user: { id: member.id }, role: 'ADMIN' },
      });

      await as(app, owner).patch(path).send({ role: 'MEMBER' }).expect(200);
    });

    it('never changes the owner, or hands ownership over', async () => {
      const ownerPath = `/servers/${serverId}/members/${memberIds[owner.id]}`;
      await as(app, owner)
        .patch(ownerPath)
        .send({ role: 'MEMBER' })
        .expect(400);
      await as(app, owner)
        .patch(`/servers/${serverId}/members/${memberIds[member.id]}`)
        .send({ role: 'OWNER' })
        .expect(400);
    });

    it('does not reach members of another server', async () => {
      const other = await as(app, outsider)
        .post('/servers')
        .send({ name: 'Elsewhere' })
        .expect(201);
      await as(app, outsider)
        .patch(`/servers/${other.body.id}/members/${memberIds[member.id]}`)
        .send({ role: 'ADMIN' })
        .expect(404);
    });
  });

  describe('removing a member', () => {
    it('follows the hierarchy', async () => {
      const path = (user: TestUser) =>
        `/servers/${serverId}/members/${memberIds[user.id]}`;
      await as(app, member).delete(path(admin)).expect(403);
      await as(app, admin).delete(path(owner)).expect(403);
      await as(app, admin).delete(path(admin)).expect(400);
      await as(app, owner).delete(path(owner)).expect(400);
      await as(app, outsider).delete(path(member)).expect(404);

      const second = await createUser(app, 'mod_admin2');
      await join(second);
      await as(app, owner)
        .patch(path(second))
        .send({ role: 'ADMIN' })
        .expect(200);
      await as(app, admin).delete(path(second)).expect(403);
      await as(app, owner).delete(path(second)).expect(204);
    });

    it('cuts the removed member off', async () => {
      const victim = await createUser(app, 'mod_victim');
      await join(victim);
      const [ownerSocket, victimSocket] = await Promise.all([
        connect(owner),
        connect(victim),
      ]);
      await settle();

      const left = nextEvent(ownerSocket, 'member:left');
      const kicked = nextEvent(victimSocket, 'server:kicked');
      await as(app, admin)
        .delete(`/servers/${serverId}/members/${memberIds[victim.id]}`)
        .expect(204);
      await expect(left).resolves.toEqual({ serverId, userId: victim.id });
      await expect(kicked).resolves.toEqual({ serverId });

      await as(app, victim).get(`/servers/${serverId}`).expect(404);
      await as(app, victim)
        .post(`/channels/${channelId}/messages`)
        .send({ content: 'still here?' })
        .expect(404);

      // Their sockets no longer hear the server.
      await settle();
      const silence = expectNoEvent(victimSocket, 'message:created');
      await send(owner, 'after the kick');
      await expect(silence).resolves.toBe(true);
    });

    it('takes the removed member out of voice', async () => {
      const victim = await createUser(app, 'mod_voice');
      await join(victim);
      const voice = await as(app, owner)
        .post(`/servers/${serverId}/channels`)
        .send({ name: 'lounge', type: 'VOICE' })
        .expect(201);
      const [ownerSocket, victimSocket] = await Promise.all([
        connect(owner),
        connect(victim),
      ]);
      await settle();

      const joined = nextEvent(ownerSocket, 'voice:participants');
      victimSocket.emit('voice:join', { channelId: voice.body.id });
      await expect(joined).resolves.toMatchObject({ userIds: [victim.id] });

      const emptied = nextEvent(ownerSocket, 'voice:participants');
      await as(app, owner)
        .delete(`/servers/${serverId}/members/${memberIds[victim.id]}`)
        .expect(204);
      await expect(emptied).resolves.toEqual({
        serverId,
        channelId: voice.body.id,
        userIds: [],
      });
    });
  });
});
