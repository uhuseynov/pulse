import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { MemberRole, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServerEvent } from '../realtime/realtime.events';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type {
  CreateMessageInput,
  ListMessagesQuery,
  UpdateMessageInput,
} from './messages.schemas';

const messageSelect = {
  id: true,
  content: true,
  channelId: true,
  conversationId: true,
  createdAt: true,
  editedAt: true,
  author: { select: { id: true, username: true, displayName: true } },
} satisfies Prisma.MessageSelect;

/** Where a message lives, and who should hear about changes to it. */
type Place =
  | { kind: 'channel'; serverId: string; role: MemberRole }
  | { kind: 'conversation'; userIds: [string, string] };

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async listInChannel(
    userId: string,
    channelId: string,
    query: ListMessagesQuery,
  ) {
    await this.access.requireChannel(userId, channelId);
    return this.page({ channelId }, query);
  }

  async createInChannel(
    userId: string,
    channelId: string,
    input: CreateMessageInput,
  ) {
    const channel = await this.access.requireChannel(userId, channelId);
    const message = await this.prisma.message.create({
      data: { channelId, authorId: userId, content: input.content },
      select: messageSelect,
    });
    this.realtime.emitToServer(channel.serverId, ServerEvent.MessageCreated, {
      serverId: channel.serverId,
      message,
    });
    return message;
  }

  async listInConversation(
    userId: string,
    conversationId: string,
    query: ListMessagesQuery,
  ) {
    await this.access.requireConversation(userId, conversationId);
    return this.page({ conversationId }, query);
  }

  async createInConversation(
    userId: string,
    conversationId: string,
    input: CreateMessageInput,
  ) {
    const conversation = await this.access.requireConversation(
      userId,
      conversationId,
    );
    if (!(await this.access.areFriends(userId, conversation.otherUserId))) {
      throw new ForbiddenException('You can only message your friends');
    }
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId, authorId: userId, content: input.content },
        select: messageSelect,
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    this.realtime.emitToUsers(
      [userId, conversation.otherUserId],
      ServerEvent.MessageCreated,
      { serverId: null, message },
    );
    return message;
  }

  /** Only the author can edit a message. */
  async update(userId: string, messageId: string, input: UpdateMessageInput) {
    const { message, place } = await this.find(userId, messageId);
    if (message.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: input.content, editedAt: new Date() },
      select: messageSelect,
    });
    this.emit(place, ServerEvent.MessageUpdated, {
      serverId: place.kind === 'channel' ? place.serverId : null,
      message: updated,
    });
    return updated;
  }

  /**
   * The author can delete a message; in a server so can its owner and admins.
   */
  async remove(userId: string, messageId: string) {
    const { message, place } = await this.find(userId, messageId);
    const moderator =
      place.kind === 'channel' && place.role !== MemberRole.MEMBER;
    if (message.authorId !== userId && !moderator) {
      throw new ForbiddenException('You cannot delete this message');
    }
    await this.prisma.message.delete({ where: { id: messageId } });
    this.emit(place, ServerEvent.MessageDeleted, {
      serverId: place.kind === 'channel' ? place.serverId : null,
      channelId: message.channelId,
      conversationId: message.conversationId,
      messageId,
    });
  }

  /**
   * Returns one page of messages, oldest first. Ids are UUIDv7, so ordering
   * by id is ordering by creation time and the id doubles as the cursor.
   */
  private async page(
    where: { channelId: string } | { conversationId: string },
    query: ListMessagesQuery,
  ) {
    const rows = await this.prisma.message.findMany({
      where: {
        ...where,
        ...(query.before ? { id: { lt: query.before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: messageSelect,
    });

    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit).reverse();
    return {
      items,
      nextCursor: hasMore ? items[0].id : null,
    };
  }

  /** Loads a message the caller is allowed to see, or throws 404. */
  private async find(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        channel: { select: { serverId: true } },
        conversation: { select: { userAId: true, userBId: true } },
      },
    });
    if (message?.channel) {
      const { serverId } = message.channel;
      const member = await this.prisma.member.findUnique({
        where: { userId_serverId: { userId, serverId } },
      });
      if (member) {
        const place: Place = { kind: 'channel', serverId, role: member.role };
        return { message, place };
      }
    } else if (message?.conversation) {
      const { userAId, userBId } = message.conversation;
      if (userId === userAId || userId === userBId) {
        const place: Place = {
          kind: 'conversation',
          userIds: [userAId, userBId],
        };
        return { message, place };
      }
    }
    throw new NotFoundException('Message not found');
  }

  private emit(place: Place, event: string, payload: unknown) {
    if (place.kind === 'channel') {
      this.realtime.emitToServer(place.serverId, event, payload);
    } else {
      this.realtime.emitToUsers(place.userIds, event, payload);
    }
  }
}
