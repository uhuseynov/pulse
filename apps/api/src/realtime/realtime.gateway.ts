import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AccessService } from '../access/access.service';
import { AuthService } from '../auth/auth.service';
import { uuidSchema } from '../common/schemas';
import { FriendshipStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VoicePresenceService } from '../voice/voice-presence.service';
import { PresenceChange, PresenceService } from './presence.service';
import {
  ClientEvent,
  presenceRoom,
  SERVER_ROOM_PREFIX,
  ServerEvent,
  serverRoom,
  userRoom,
} from './realtime.events';

interface SocketData {
  userId?: string;
  /** Captured while disconnecting, when the rooms are still known. */
  serverRooms?: string[];
  voiceChannelId?: string;
  voiceServerId?: string;
}

type AuthedSocket = Socket & { data: SocketData };

@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly io: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  /**
   * Resolves once a socket has been authenticated and put in its rooms.
   * Clients may send events the moment they connect (after a reconnect, for
   * example), before that has finished; handlers wait for it.
   */
  private readonly ready = new WeakMap<Socket, Promise<void>>();

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly voicePresence: VoicePresenceService,
    private readonly access: AccessService,
  ) {}

  handleConnection(socket: AuthedSocket) {
    const ready = this.setUp(socket);
    this.ready.set(socket, ready);
    return ready;
  }

  /** The signed-in user behind a socket, once its setup has finished. */
  private async userOf(socket: AuthedSocket): Promise<string | undefined> {
    await this.ready.get(socket);
    return socket.disconnected ? undefined : socket.data.userId;
  }

  private async setUp(socket: AuthedSocket) {
    try {
      const token: unknown = socket.handshake.auth?.token;
      const userId =
        typeof token === 'string' ? await this.auth.verifyToken(token) : null;
      if (!userId) {
        socket.disconnect(true);
        return;
      }

      const [memberships, friendships] = await Promise.all([
        this.prisma.member.findMany({
          where: { userId },
          select: { serverId: true },
        }),
        this.prisma.friendship.findMany({
          where: {
            status: FriendshipStatus.ACCEPTED,
            OR: [{ requesterId: userId }, { addresseeId: userId }],
          },
          select: { requesterId: true, addresseeId: true },
        }),
      ]);
      // The socket may have closed while we were waiting on the database.
      if (socket.disconnected) {
        return;
      }

      socket.data.userId = userId;
      // Rooms are gone by the time handleDisconnect runs, so remember them.
      socket.once('disconnecting', () => {
        socket.data.serverRooms = [...socket.rooms].filter((room) =>
          room.startsWith(SERVER_ROOM_PREFIX),
        );
      });
      const serverRooms = memberships.map((m) => serverRoom(m.serverId));
      const friendRooms = friendships.map((f) =>
        presenceRoom(f.requesterId === userId ? f.addresseeId : f.requesterId),
      );
      await socket.join([userRoom(userId), ...serverRooms, ...friendRooms]);

      const change = await this.presence.set(userId, socket.id, 'active');
      if (socket.disconnected) {
        // Closed while being recorded: handleDisconnect has already run.
        await this.presence.remove(userId, socket.id);
        return;
      }
      this.announcePresence(userId, change, serverRooms);
    } catch (error) {
      this.logger.error('Socket connection failed', error);
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: AuthedSocket) {
    const {
      userId,
      serverRooms = [],
      voiceChannelId,
      voiceServerId,
    } = socket.data;
    try {
      if (voiceChannelId) {
        await this.voicePresence.leave(voiceChannelId, socket.id);
        await this.broadcastVoice(voiceChannelId, voiceServerId);
      }
      if (userId) {
        const change = await this.presence.remove(userId, socket.id);
        this.announcePresence(userId, change, serverRooms);
      }
    } catch (error) {
      // Happens when the whole application is shutting down.
      this.logger.debug(`Disconnect cleanup failed: ${String(error)}`);
    }
  }

  @SubscribeMessage(ClientEvent.Activity)
  async handleActivity(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { idle?: unknown },
  ) {
    const userId = await this.userOf(socket);
    if (!userId || typeof body?.idle !== 'boolean') {
      return;
    }
    const change = await this.presence.set(
      userId,
      socket.id,
      body.idle ? 'idle' : 'active',
    );
    if (socket.disconnected) {
      await this.presence.remove(userId, socket.id);
      return;
    }
    this.announcePresence(
      userId,
      change,
      [...socket.rooms].filter((room) => room.startsWith(SERVER_ROOM_PREFIX)),
    );
  }

  @SubscribeMessage(ClientEvent.Typing)
  async handleTyping(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { channelId?: unknown; conversationId?: unknown },
  ) {
    const userId = await this.userOf(socket);
    if (!userId) {
      return;
    }
    const conversationId = uuidSchema.safeParse(body?.conversationId);
    if (conversationId.success) {
      const conversation = await this.access
        .requireConversation(userId, conversationId.data)
        .catch(() => null);
      if (conversation) {
        this.io
          .to(userRoom(conversation.otherUserId))
          .emit(ServerEvent.Typing, {
            conversationId: conversation.id,
            userId,
          });
      }
      return;
    }

    const channelId = uuidSchema.safeParse(body?.channelId);
    if (!channelId.success) {
      return;
    }
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId.data },
      select: { id: true, serverId: true },
    });
    // Room membership proves the user belongs to the channel's server.
    if (!channel || !socket.rooms.has(serverRoom(channel.serverId))) {
      return;
    }
    socket
      .to(serverRoom(channel.serverId))
      .emit(ServerEvent.Typing, { channelId: channel.id, userId });
  }

  @SubscribeMessage(ClientEvent.VoiceJoin)
  async handleVoiceJoin(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { channelId?: unknown },
  ) {
    const userId = await this.userOf(socket);
    const channelId = uuidSchema.safeParse(body?.channelId);
    if (!userId || !channelId.success) {
      return;
    }
    // Throws for a channel the user cannot reach, or a text channel.
    const channel = await this.access
      .requireVoiceChannel(userId, channelId.data)
      .catch(() => null);
    if (!channel || socket.disconnected) {
      return;
    }

    const previous = socket.data.voiceChannelId;
    const previousServerId = socket.data.voiceServerId;
    socket.data.voiceChannelId = channel.id;
    socket.data.voiceServerId = channel.serverId;
    if (previous && previous !== channel.id) {
      await this.voicePresence.leave(previous, socket.id);
      await this.broadcastVoice(previous, previousServerId);
    }
    await this.voicePresence.join(channel.id, socket.id, userId);
    if (socket.disconnected) {
      await this.voicePresence.leave(channel.id, socket.id);
    }
    await this.broadcastVoice(channel.id, channel.serverId);
  }

  @SubscribeMessage(ClientEvent.VoiceLeave)
  async handleVoiceLeave(@ConnectedSocket() socket: AuthedSocket) {
    const { voiceChannelId, voiceServerId } = socket.data;
    if (!voiceChannelId) {
      return;
    }
    socket.data.voiceChannelId = undefined;
    socket.data.voiceServerId = undefined;
    await this.voicePresence.leave(voiceChannelId, socket.id);
    await this.broadcastVoice(voiceChannelId, voiceServerId);
  }

  /** Tells a user's servers and friends when their status has changed. */
  private announcePresence(
    userId: string,
    change: PresenceChange,
    serverRooms: string[],
  ) {
    if (change.previous === change.current) {
      return;
    }
    this.io
      .to([...serverRooms, presenceRoom(userId)])
      .emit(ServerEvent.Presence, { userId, status: change.current });
  }

  private async broadcastVoice(
    channelId: string,
    serverId: string | undefined,
  ) {
    if (!serverId) {
      return;
    }
    this.io.to(serverRoom(serverId)).emit(ServerEvent.VoiceParticipants, {
      serverId,
      channelId,
      userIds: await this.voicePresence.participants(channelId),
    });
  }

  /** Sends an event to everyone currently connected to a server. */
  emitToServer(serverId: string, event: string, payload: unknown) {
    this.io.to(serverRoom(serverId)).emit(event, payload);
  }

  /** Sends an event to every open socket of the given users. */
  emitToUsers(userIds: string[], event: string, payload: unknown) {
    this.io.to(userIds.map(userRoom)).emit(event, payload);
  }

  /** Subscribes all of a user's open sockets to a server's events. */
  joinServer(userId: string, serverId: string) {
    this.io.in(userRoom(userId)).socketsJoin(serverRoom(serverId));
  }

  leaveServer(userId: string, serverId: string) {
    this.io.in(userRoom(userId)).socketsLeave(serverRoom(serverId));
  }

  /** Unsubscribes every socket from a server that no longer exists. */
  closeServer(serverId: string) {
    this.io.in(serverRoom(serverId)).socketsLeave(serverRoom(serverId));
  }

  /** Starts sending two new friends each other's presence. */
  linkFriends(a: string, b: string) {
    this.io.in(userRoom(a)).socketsJoin(presenceRoom(b));
    this.io.in(userRoom(b)).socketsJoin(presenceRoom(a));
  }

  unlinkFriends(a: string, b: string) {
    this.io.in(userRoom(a)).socketsLeave(presenceRoom(b));
    this.io.in(userRoom(b)).socketsLeave(presenceRoom(a));
  }

  /**
   * Takes a user out of the voice channels of a server they no longer belong
   * to, whichever API instance their sockets are connected to.
   */
  async dropVoice(userId: string, serverId: string) {
    const sockets = await this.io.in(userRoom(userId)).fetchSockets();
    const channelIds = new Set<string>();
    for (const socket of sockets) {
      const data = socket.data as SocketData;
      if (data.voiceServerId === serverId && data.voiceChannelId) {
        await this.voicePresence.leave(data.voiceChannelId, socket.id);
        channelIds.add(data.voiceChannelId);
      }
    }
    for (const channelId of channelIds) {
      await this.broadcastVoice(channelId, serverId);
    }
  }
}
