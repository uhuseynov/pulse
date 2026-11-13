import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { ChannelType, MemberRole, Prisma } from '../generated/prisma/client';
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
        data: { serverId, name: input.name, type: input.type },
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

    // A server must keep somewhere to talk, so the last text channel stays.
    if (channel.type === ChannelType.TEXT) {
      const remaining = await this.prisma.channel.count({
        where: { serverId: channel.serverId, type: ChannelType.TEXT },
      });
      if (remaining <= 1) {
        throw new BadRequestException(
          'A server must keep at least one text channel',
        );
      }
    }

    await this.prisma.channel.delete({ where: { id: channel.id } });
    this.realtime.emitToServer(channel.serverId, ServerEvent.ChannelDeleted, {
      serverId: channel.serverId,
      channelId: channel.id,
    });
  }
}
