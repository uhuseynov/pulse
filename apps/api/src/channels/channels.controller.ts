import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { uuidSchema } from '../common/schemas';
import {
  createChannelSchema,
  type CreateChannelInput,
} from './channels.schemas';
import { ChannelsService } from './channels.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post('servers/:serverId/channels')
  create(
    @CurrentUser() user: AuthUser,
    @Param('serverId', { schema: uuidSchema }) serverId: string,
    @Body({ schema: createChannelSchema }) body: CreateChannelInput,
  ) {
    return this.channels.create(user.id, serverId, body);
  }

  @Delete('channels/:channelId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('channelId', { schema: uuidSchema }) channelId: string,
  ) {
    return this.channels.remove(user.id, channelId);
  }
}
