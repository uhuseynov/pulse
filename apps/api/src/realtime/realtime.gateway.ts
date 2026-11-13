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
import { AuthService } from '../auth/auth.service';
import { uuidSchema } from '../common/schemas';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { VoicePresenceService } from '../voice/voice-presence.service';
import { PresenceService } from './presence.service';
import {
  ClientEvent,
  SERVER_ROOM_PREFIX,
  ServerEvent,
  serverRoom,
  userRoom,
} from './realtime.events';

type AuthedSocket = Socket & {
  data: { userId?: string; serverRooms?: string[]; voiceServerId?: string };
};

@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly io: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly voicePresence: VoicePresenceService,
    private readonly access: AccessService,
  ) {}

  async handleConnection(socket: AuthedSocket) {
    try {
      const token: unknown = socket.handshake.auth?.token;
      const userId =
        typeof token === 'string' ? await this.auth.verifyToken(token) : null;
      if (!userId) {
        socket.disconnect(true);
        return;
      }

      const memberships = await this.prisma.member.findMany({
        where: { userId },
        select: { serverId: true },
      });
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
      const rooms = memberships.map((member) => serverRoom(member.serverId));
      await socket.join([userRoom(userId), ...rooms]);

      if (this.presence.connect(userId) && rooms.length > 0) {
        this.io.to(rooms).emit(ServerEvent.Presence, { userId, online: true });
      }
    } catch (error) {
      this.logger.error('Socket connection failed', error);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: AuthedSocket) {
    const voiceChannelId = this.voicePresence.leave(socket.id);
    if (voiceChannelId) {
      this.broadcastVoice(voiceChannelId, socket.data.voiceServerId);
    }

    const { userId, serverRooms = [] } = socket.data;
    if (!userId || !this.presence.disconnect(userId)) {
      return;
    }
    if (serverRooms.length > 0) {
      this.io
        .to(serverRooms)
        .emit(ServerEvent.Presence, { userId, online: false });
    }
  }

  @SubscribeMessage(ClientEvent.Typing)
  async handleTyping(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { channelId?: unknown },
  ) {
    const userId = socket.data.userId;
    const channelId = uuidSchema.safeParse(body?.channelId);
    if (!userId || !channelId.success) {
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
    const userId = socket.data.userId;
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

    const previous = this.voicePresence.join(channel.id, socket.id, userId);
    socket.data.voiceServerId = channel.serverId;
    if (previous) {
      this.broadcastVoice(previous, channel.serverId);
    }
    this.broadcastVoice(channel.id, channel.serverId);
  }

  @SubscribeMessage(ClientEvent.VoiceLeave)
  handleVoiceLeave(@ConnectedSocket() socket: AuthedSocket) {
    const channelId = this.voicePresence.leave(socket.id);
    if (channelId) {
      this.broadcastVoice(channelId, socket.data.voiceServerId);
    }
  }

  private broadcastVoice(channelId: string, serverId: string | undefined) {
    if (!serverId) {
      return;
    }
    this.io.to(serverRoom(serverId)).emit(ServerEvent.VoiceParticipants, {
      serverId,
      channelId,
      userIds: this.voicePresence.participants(channelId),
    });
  }

  /** Sends an event to everyone currently connected to a server. */
  emitToServer(serverId: string, event: string, payload: unknown) {
    this.io.to(serverRoom(serverId)).emit(event, payload);
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
}
