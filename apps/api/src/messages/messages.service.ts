import { Injectable } from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServerEvent } from '../realtime/realtime.events';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { CreateMessageInput, ListMessagesQuery } from './messages.schemas';

const messageSelect = {
  id: true,
  content: true,
  channelId: true,
  createdAt: true,
  editedAt: true,
  author: { select: { id: true, username: true, displayName: true } },
} satisfies Prisma.MessageSelect;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Returns one page of messages, oldest first. Ids are UUIDv7, so ordering
   * by id is ordering by creation time and the id doubles as the cursor.
   */
  async list(userId: string, channelId: string, query: ListMessagesQuery) {
    await this.access.requireChannel(userId, channelId);
    const rows = await this.prisma.message.findMany({
      where: {
        channelId,
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

  async create(userId: string, channelId: string, input: CreateMessageInput) {
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
}
