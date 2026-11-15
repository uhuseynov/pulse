import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChannelType,
  FriendshipStatus,
  MemberRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Membership and permission checks shared by every feature module. */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the caller's membership. Non-members get 404 so that the
   * existence of a server is not revealed to people outside it.
   */
  async requireMember(userId: string, serverId: string) {
    const member = await this.prisma.member.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });
    if (!member) {
      throw new NotFoundException('Server not found');
    }
    return member;
  }

  async requireRole(userId: string, serverId: string, roles: MemberRole[]) {
    const member = await this.requireMember(userId, serverId);
    if (!roles.includes(member.role)) {
      throw new ForbiddenException('You do not have permission to do this');
    }
    return member;
  }

  /** Returns the channel if the caller belongs to its server. */
  async requireChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, server: { members: { some: { userId } } } },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }

  /** Same as requireChannel, but rejects text channels. */
  async requireVoiceChannel(userId: string, channelId: string) {
    const channel = await this.requireChannel(userId, channelId);
    if (channel.type !== ChannelType.VOICE) {
      throw new BadRequestException('This channel is not a voice channel');
    }
    return channel;
  }

  /**
   * Returns the conversation if the caller is one of its two participants,
   * together with the id of the other one.
   */
  async requireConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ userAId: userId }, { userBId: userId }],
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return {
      ...conversation,
      otherUserId:
        conversation.userAId === userId
          ? conversation.userBId
          : conversation.userAId,
    };
  }

  async areFriends(a: string, b: string): Promise<boolean> {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
      select: { id: true },
    });
    return friendship !== null;
  }

  async getDisplayName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true },
    });
    return user.displayName;
  }
}
