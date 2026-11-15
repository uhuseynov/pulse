import { ForbiddenException, Injectable } from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const userSelect = {
  id: true,
  username: true,
  displayName: true,
} satisfies Prisma.UserSelect;

const conversationInclude = {
  userA: { select: userSelect },
  userB: { select: userSelect },
} satisfies Prisma.ConversationInclude;

type ConversationWithUsers = Prisma.ConversationGetPayload<{
  include: typeof conversationInclude;
}>;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** The caller's direct-message threads, most recently active first. */
  async list(userId: string) {
    const rows = await this.prisma.conversation.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { lastMessageAt: 'desc' },
      include: conversationInclude,
    });
    return rows.map((row) => this.toView(userId, row));
  }

  /** Returns the thread with a friend, creating it on first use. */
  async open(userId: string, otherUserId: string) {
    if (!(await this.access.areFriends(userId, otherUserId))) {
      throw new ForbiddenException('You can only message your friends');
    }
    // Storing the smaller id first gives each pair exactly one row.
    const [userAId, userBId] = [userId, otherUserId].sort();
    const conversation = await this.prisma.conversation.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      create: { userAId, userBId },
      update: {},
      include: conversationInclude,
    });
    return this.toView(userId, conversation);
  }

  private toView(userId: string, row: ConversationWithUsers) {
    return {
      id: row.id,
      createdAt: row.createdAt,
      lastMessageAt: row.lastMessageAt,
      user: row.userAId === userId ? row.userB : row.userA,
    };
  }
}
