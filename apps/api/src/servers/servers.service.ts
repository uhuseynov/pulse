import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { MemberRole, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PresenceService,
  type PresenceStatus,
} from '../realtime/presence.service';
import { VoicePresenceService } from '../voice/voice-presence.service';
import { ServerEvent } from '../realtime/realtime.events';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { CreateServerInput, UpdateMemberInput } from './servers.schemas';

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
    const [statuses, voiceParticipants] = await Promise.all([
      this.presence.statuses(server.members.map((member) => member.userId)),
      // Who is sitting in each voice channel right now.
      this.voicePresence.snapshot(server.channels.map((channel) => channel.id)),
    ]);
    return {
      ...server,
      members: server.members.map((member) =>
        toMemberView(member, statuses.get(member.userId)),
      ),
      voiceParticipants,
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
        member: toMemberView(member, await this.presence.status(userId)),
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

  /** Only the owner can promote a member to admin, or demote one. */
  async updateMember(
    userId: string,
    serverId: string,
    memberId: string,
    input: UpdateMemberInput,
  ) {
    await this.access.requireRole(userId, serverId, [MemberRole.OWNER]);
    const target = await this.requireTarget(serverId, memberId);
    if (target.role === MemberRole.OWNER) {
      throw new BadRequestException("The owner's role cannot be changed");
    }
    const member = await this.prisma.member.update({
      where: { id: memberId },
      data: { role: input.role },
      include: memberInclude,
    });
    const view = toMemberView(
      member,
      await this.presence.status(member.userId),
    );
    this.realtime.emitToServer(serverId, ServerEvent.MemberUpdated, {
      serverId,
      member: view,
    });
    return view;
  }

  /**
   * Removes someone from the server. The owner can remove anyone; admins can
   * remove ordinary members only.
   */
  async kick(userId: string, serverId: string, memberId: string) {
    const actor = await this.access.requireRole(userId, serverId, [
      MemberRole.OWNER,
      MemberRole.ADMIN,
    ]);
    const target = await this.requireTarget(serverId, memberId);
    if (target.userId === userId) {
      throw new BadRequestException('You cannot remove yourself');
    }
    if (
      target.role === MemberRole.OWNER ||
      (target.role === MemberRole.ADMIN && actor.role !== MemberRole.OWNER)
    ) {
      throw new ForbiddenException('You do not have permission to do this');
    }

    await this.prisma.member.delete({ where: { id: memberId } });
    this.realtime.leaveServer(target.userId, serverId);
    this.realtime.emitToUsers([target.userId], ServerEvent.ServerKicked, {
      serverId,
    });
    this.realtime.emitToServer(serverId, ServerEvent.MemberLeft, {
      serverId,
      userId: target.userId,
    });
    await this.realtime.dropVoice(target.userId, serverId);
  }

  private async requireTarget(serverId: string, memberId: string) {
    const target = await this.prisma.member.findFirst({
      where: { id: memberId, serverId },
    });
    if (!target) {
      throw new NotFoundException('Member not found');
    }
    return target;
  }
}

function toMemberView(member: MemberWithUser, status?: PresenceStatus) {
  return {
    id: member.id,
    role: member.role,
    joinedAt: member.joinedAt,
    user: member.user,
    status: status ?? 'offline',
  };
}
