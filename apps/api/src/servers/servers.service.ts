import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { MemberRole, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';
import { VoicePresenceService } from '../voice/voice-presence.service';
import { ServerEvent } from '../realtime/realtime.events';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { CreateServerInput } from './servers.schemas';

const memberInclude = {
  user: { select: { id: true, username: true, displayName: true } },
} satisfies Prisma.MemberInclude;

type MemberWithUser = Prisma.MemberGetPayload<{
  include: typeof memberInclude;
}>;

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
    private readonly presence: PresenceService,
    private readonly voicePresence: VoicePresenceService,
  ) {}

  listForUser(userId: string) {
    return this.prisma.server.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, ownerId: true },
    });
  }

  async create(userId: string, input: CreateServerInput) {
    const server = await this.prisma.server.create({
      data: {
        name: input.name,
        inviteCode: randomBytes(6).toString('base64url'),
        ownerId: userId,
        members: { create: { userId, role: MemberRole.OWNER } },
        channels: { create: { name: 'general' } },
      },
    });
    this.realtime.joinServer(userId, server.id);
    return this.getDetails(userId, server.id);
  }

  async getDetails(userId: string, serverId: string) {
    await this.access.requireMember(userId, serverId);
    const server = await this.prisma.server.findUniqueOrThrow({
      where: { id: serverId },
      include: {
        channels: { orderBy: { createdAt: 'asc' } },
        members: { orderBy: { joinedAt: 'asc' }, include: memberInclude },
      },
    });
    return {
      ...server,
      members: server.members.map((member) => this.toMemberView(member)),
      // Who is sitting in each voice channel right now.
      voiceParticipants: this.voicePresence.snapshot(
        server.channels.map((channel) => channel.id),
      ),
    };
  }

  async join(userId: string, inviteCode: string) {
    const server = await this.prisma.server.findUnique({
      where: { inviteCode },
      select: { id: true },
    });
    if (!server) {
      throw new NotFoundException('Invite code is not valid');
    }

    const existing = await this.prisma.member.findUnique({
      where: { userId_serverId: { userId, serverId: server.id } },
    });
    if (!existing) {
      const member = await this.prisma.member.create({
        data: { userId, serverId: server.id },
        include: memberInclude,
      });
      this.realtime.emitToServer(server.id, ServerEvent.MemberJoined, {
        serverId: server.id,
        member: this.toMemberView(member),
      });
      this.realtime.joinServer(userId, server.id);
    }
    return this.getDetails(userId, server.id);
  }

  async leave(userId: string, serverId: string) {
    const member = await this.access.requireMember(userId, serverId);
    if (member.role === MemberRole.OWNER) {
      throw new BadRequestException(
        'The owner cannot leave the server. Delete it instead.',
      );
    }
    await this.prisma.member.delete({ where: { id: member.id } });
    this.realtime.leaveServer(userId, serverId);
    this.realtime.emitToServer(serverId, ServerEvent.MemberLeft, {
      serverId,
      userId,
    });
  }

  async remove(userId: string, serverId: string) {
    await this.access.requireRole(userId, serverId, [MemberRole.OWNER]);
    await this.prisma.server.delete({ where: { id: serverId } });
    this.realtime.emitToServer(serverId, ServerEvent.ServerDeleted, {
      serverId,
    });
    this.realtime.closeServer(serverId);
  }

  private toMemberView(member: MemberWithUser) {
    return {
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt,
      user: member.user,
      online: this.presence.isOnline(member.userId),
    };
  }
}
