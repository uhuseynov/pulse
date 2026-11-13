import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelType, MemberRole } from '../generated/prisma/client';
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

  async getDisplayName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true },
    });
    return user.displayName;
  }
}
