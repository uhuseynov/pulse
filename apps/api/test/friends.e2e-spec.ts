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

describe('Friends and direct messages (e2e)', () => {
  let app: TestApp;
  const sockets: Socket[] = [];

  const connect = async (user: TestUser) => {
    const socket = await connectSocket(app, user.token);
    sockets.push(socket);
    return socket;
  };

  const friendsOf = async (user: TestUser) =>
    (await as(app, user).get('/friends').expect(200)).body;

  const openConversation = async (user: TestUser, other: TestUser) =>
    (
      await as(app, user)
        .post('/conversations')
        .send({ userId: other.id })
        .expect(200)
    ).body.id as string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('friend requests', () => {
    it('sends, lists and accepts a request', async () => {
      const [ann, bob] = await Promise.all([
        createUser(app, 'fr_ann'),
        createUser(app, 'fr_bob'),
      ]);
      const bobSocket = await connect(bob);
      await settle();

      const notified = nextEvent(bobSocket, 'friends:changed');
      const sent = await as(app, ann)
        .post('/friends/requests')
        .send({ username: `@${bob.username.toUpperCase()}` })
        .expect(201);
      expect(sent.body).toEqual({ accepted: false });
      await notified;

      const annView = await friendsOf(ann);
      expect(annView.friends).toEqual([]);
      expect(annView.outgoing).toHaveLength(1);
      expect(annView.outgoing[0].user.id).toBe(bob.id);

      const bobView = await friendsOf(bob);
      expect(bobView.incoming).toHaveLength(1);
      expect(bobView.incoming[0].user).toEqual({
        id: ann.id,
        username: ann.username,
        displayName: ann.username,
      });

      const requestId = bobView.incoming[0].id;
      // The sender cannot accept their own request.
      await as(app, ann)
        .post(`/friends/requests/${requestId}/accept`)
        .expect(404);
      await as(app, bob)
        .post(`/friends/requests/${requestId}/accept`)
        .expect(204);
      await as(app, bob)
        .post(`/friends/requests/${requestId}/accept`)
        .expect(404);

      const after = await friendsOf(ann);
      expect(after.outgoing).toEqual([]);
      expect(after.friends).toHaveLength(1);
      expect(after.friends[0]).toMatchObject({
        id: requestId,
        user: { id: bob.id },
        status: 'online',
      });
    });

    it('makes two people friends when both ask', async () => {
      const [ann, bob] = await Promise.all([
        createUser(app, 'fr_ann'),
        createUser(app, 'fr_bob'),
      ]);
      await as(app, ann)
        .post('/friends/requests')
        .send({ username: bob.username })
        .expect(201);
      const second = await as(app, bob)
        .post('/friends/requests')
        .send({ username: ann.username })
        .expect(201);
      expect(second.body).toEqual({ accepted: true });
      expect((await friendsOf(bob)).friends).toHaveLength(1);
    });

    it('rejects requests that make no sense', async () => {
      const [ann, bob] = await Promise.all([
        createUser(app, 'fr_ann'),
        createUser(app, 'fr_bob'),
      ]);
      await as(app, ann)
        .post('/friends/requests')
        .send({ username: 'nobody_by_this_name' })
        .expect(404);
      await as(app, ann)
        .post('/friends/requests')
        .send({ username: ann.username })
        .expect(400);
      await as(app, ann).post('/friends/requests').send({}).expect(400);

      await as(app, ann)
        .post('/friends/requests')
        .send({ username: bob.username })
        .expect(201);
      await as(app, ann)
        .post('/friends/requests')
        .send({ username: bob.username })
        .expect(409);
      // Bob asking back accepts it; after that there is nothing left to ask.
      await as(app, bob)
        .post('/friends/requests')
        .send({ username: ann.username })
        .expect(201);
      await as(app, bob)
        .post('/friends/requests')
        .send({ username: ann.username })
        .expect(409);
    });

    it('declines, cancels and unfriends', async () => {
      const [ann, bob, eve] = await Promise.all([
        createUser(app, 'fr_ann'),
        createUser(app, 'fr_bob'),
        createUser(app, 'fr_eve'),
      ]);
      await as(app, ann)
        .post('/friends/requests')
        .send({ username: bob.username })
        .expect(201);
      const requestId = (await friendsOf(bob)).incoming[0].id;

      // A stranger cannot touch it.
      await as(app, eve).delete(`/friends/${requestId}`).expect(404);
      await as(app, bob).delete(`/friends/${requestId}`).expect(204);
      expect((await friendsOf(ann)).outgoing).toEqual([]);

      await befriend(app, ann, bob);
      const friendshipId = (await friendsOf(ann)).friends[0].id;
      await as(app, ann).delete(`/friends/${friendshipId}`).expect(204);
      expect((await friendsOf(bob)).friends).toEqual([]);
    });

    it('requires a signed-in user', async () => {
      await as(app, { token: 'nope' } as TestUser)
        .get('/friends')
        .expect(401);
    });
  });

  describe('presence between friends', () => {
    it('reaches friends who share no server, and stops on unfriend', async () => {
      const [ann, bob] = await Promise.all([
        createUser(app, 'pr_ann'),
        createUser(app, 'pr_bob'),
      ]);
      const annSocket = await connect(ann);
      await settle();

      // Not friends yet: nothing to hear.
      const nothing = expectNoEvent(annSocket, 'presence:changed');
      const early = await connect(bob);
      await expect(nothing).resolves.toBe(true);
      early.disconnect();
      await settle();

      await befriend(app, ann, bob);
      await settle();
      const online = nextEvent(annSocket, 'presence:changed');
      const bobSocket = await connect(bob);
      await expect(online).resolves.toEqual({
        userId: bob.id,
        status: 'online',
      });

      const friendshipId = (await friendsOf(ann)).friends[0].id;
      await as(app, ann).delete(`/friends/${friendshipId}`).expect(204);
      await settle();
      const silence = expectNoEvent(annSocket, 'presence:changed');
      bobSocket.disconnect();
      await expect(silence).resolves.toBe(true);
    });
  });

  describe('direct messages', () => {
    let ann: TestUser;
    let bob: TestUser;
    let eve: TestUser;
    let conversationId: string;

    beforeAll(async () => {
      [ann, bob, eve] = await Promise.all([
        createUser(app, 'dm_ann'),
        createUser(app, 'dm_bob'),
        createUser(app, 'dm_eve'),
      ]);
      await befriend(app, ann, bob);
      conversationId = await openConversation(ann, bob);
    });

    it('opens one conversation per pair of friends', async () => {
      await expect(openConversation(bob, ann)).resolves.toBe(conversationId);
      await expect(openConversation(ann, bob)).resolves.toBe(conversationId);

      const list = await as(app, bob).get('/conversations').expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({
        id: conversationId,
        user: { id: ann.id },
      });
    });

    it('only opens conversations between friends', async () => {
      await as(app, ann)
        .post('/conversations')
        .send({ userId: eve.id })
        .expect(403);
      await as(app, ann)
        .post('/conversations')
        .send({ userId: ann.id })
        .expect(403);
      await as(app, ann)
        .post('/conversations')
        .send({ userId: 'not-a-uuid' })
        .expect(400);
    });

    it('delivers messages to both people and nobody else', async () => {
      const [annSocket, bobSocket, eveSocket] = await Promise.all([
        connect(ann),
        connect(bob),
        connect(eve),
      ]);
      await settle();

      const toBob = nextEvent(bobSocket, 'message:created');
      const toAnn = nextEvent(annSocket, 'message:created');
      const toEve = expectNoEvent(eveSocket, 'message:created');
      const sent = await as(app, ann)
        .post(`/conversations/${conversationId}/messages`)
        .send({ content: 'hello bob' })
        .expect(201);
      expect(sent.body).toMatchObject({
        content: 'hello bob',
        channelId: null,
        conversationId,
        author: { id: ann.id },
      });
      const expected = { serverId: null, message: { id: sent.body.id } };
      await expect(toBob).resolves.toMatchObject(expected);
      await expect(toAnn).resolves.toMatchObject(expected);
      await expect(toEve).resolves.toBe(true);

      const page = await as(app, bob)
        .get(`/conversations/${conversationId}/messages`)
        .expect(200);
      expect(page.body.items.map((m: any) => m.content)).toEqual(['hello bob']);
      expect(page.body.nextCursor).toBeNull();
    });

    it('hides the conversation from everyone else', async () => {
      await as(app, eve)
        .get(`/conversations/${conversationId}/messages`)
        .expect(404);
      await as(app, eve)
        .post(`/conversations/${conversationId}/messages`)
        .send({ content: 'let me in' })
        .expect(404);
      expect(
        (await as(app, eve).get('/conversations').expect(200)).body,
      ).toEqual([]);
    });

    it('edits and deletes direct messages', async () => {
      const sent = await as(app, ann)
        .post(`/conversations/${conversationId}/messages`)
        .send({ content: 'tpyo' })
        .expect(201);
      const bobSocket = await connect(bob);
      await settle();

      const updated = nextEvent(bobSocket, 'message:updated');
      await as(app, bob)
        .patch(`/messages/${sent.body.id}`)
        .send({ content: 'not mine' })
        .expect(403);
      await as(app, eve)
        .patch(`/messages/${sent.body.id}`)
        .send({ content: 'not mine' })
        .expect(404);
      await as(app, ann)
        .patch(`/messages/${sent.body.id}`)
        .send({ content: 'typo' })
        .expect(200);
      await expect(updated).resolves.toMatchObject({
        serverId: null,
        message: { id: sent.body.id, content: 'typo', conversationId },
      });

      // Nobody moderates a private conversation.
      await as(app, bob).delete(`/messages/${sent.body.id}`).expect(403);
      const deleted = nextEvent(bobSocket, 'message:deleted');
      await as(app, ann).delete(`/messages/${sent.body.id}`).expect(204);
      await expect(deleted).resolves.toEqual({
        serverId: null,
        channelId: null,
        conversationId,
        messageId: sent.body.id,
      });
    });

    it('relays typing to the other person only', async () => {
      const [annSocket, bobSocket, eveSocket] = await Promise.all([
        connect(ann),
        connect(bob),
        connect(eve),
      ]);
      await settle();

      const typing = nextEvent(bobSocket, 'typing');
      const echo = expectNoEvent(annSocket, 'typing');
      annSocket.emit('typing', { conversationId });
      await expect(typing).resolves.toEqual({ conversationId, userId: ann.id });
      await expect(echo).resolves.toBe(true);

      const injected = expectNoEvent(bobSocket, 'typing');
      eveSocket.emit('typing', { conversationId });
      await expect(injected).resolves.toBe(true);
    });

    it('moves the latest conversation to the top', async () => {
      const cat = await createUser(app, 'dm_cat');
      await befriend(app, ann, cat);
      const second = await openConversation(ann, cat);
      await as(app, ann)
        .post(`/conversations/${second}/messages`)
        .send({ content: 'hi cat' })
        .expect(201);
      const order = async () =>
        (await as(app, ann).get('/conversations').expect(200)).body.map(
          (c: any) => c.id,
        );
      await expect(order()).resolves.toEqual([second, conversationId]);

      await as(app, bob)
        .post(`/conversations/${conversationId}/messages`)
        .send({ content: 'me again' })
        .expect(201);
      await expect(order()).resolves.toEqual([conversationId, second]);
    });

    it('stops accepting messages after an unfriend, but keeps history', async () => {
      const friendshipId = (await friendsOf(ann)).friends.find(
        (f: any) => f.user.id === bob.id,
      ).id;
      await as(app, bob).delete(`/friends/${friendshipId}`).expect(204);

      await as(app, ann)
        .post(`/conversations/${conversationId}/messages`)
        .send({ content: 'still there?' })
        .expect(403);
      const page = await as(app, ann)
        .get(`/conversations/${conversationId}/messages`)
        .expect(200);
      expect(page.body.items.length).toBeGreaterThan(0);
    });
  });
});
