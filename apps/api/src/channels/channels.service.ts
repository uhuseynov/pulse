import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { MemberRole, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServerEvent } from '../realtime/realtime.events';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { CreateChannelInput } from './channels.schemas';

const MANAGER_ROLES = [MemberRole.OWNER, MemberRole.ADMIN];

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(userId: string, serverId: string, input: CreateChannelInput) {
    await this.access.requireRole(userId, serverId, MANAGER_ROLES);
    try {
      const channel = await this.prisma.channel.create({
        data: { serverId, name: input.name },
      });
      this.realtime.emitToServer(serverId, ServerEvent.ChannelCreated, channel);
      return channel;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A channel with this name already exists');
      }
      throw error;
    }
  }

  async remove(userId: string, channelId: string) {
    const channel = await this.access.requireChannel(userId, channelId);
    await this.access.requireRole(userId, channel.serverId, MANAGER_ROLES);

    const remaining = await this.prisma.channel.count({
      where: { serverId: channel.serverId },
    });
    if (remaining <= 1) {
      throw new BadRequestException('A server must keep at least one channel');
    }

    await this.prisma.channel.delete({ where: { id: channel.id } });
    this.realtime.emitToServer(channel.serverId, ServerEvent.ChannelDeleted, {
      serverId: channel.serverId,
      channelId: channel.id,
    });
  }
}
