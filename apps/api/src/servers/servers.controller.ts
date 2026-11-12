import {
  Body,
  Controller,
  Delete,
  Get,
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
  createServerSchema,
  joinServerSchema,
  type CreateServerInput,
  type JoinServerInput,
} from './servers.schemas';
import { ServersService } from './servers.service';

@Controller('servers')
@UseGuards(JwtAuthGuard)
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.servers.listForUser(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createServerSchema }) body: CreateServerInput,
  ) {
    return this.servers.create(user.id, body);
  }

  @Post('join')
  @HttpCode(200)
  join(
    @CurrentUser() user: AuthUser,
    @Body({ schema: joinServerSchema }) body: JoinServerInput,
  ) {
    return this.servers.join(user.id, body.inviteCode);
  }

  @Get(':serverId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('serverId', { schema: uuidSchema }) serverId: string,
  ) {
    return this.servers.getDetails(user.id, serverId);
  }

  @Post(':serverId/leave')
  @HttpCode(204)
  leave(
    @CurrentUser() user: AuthUser,
    @Param('serverId', { schema: uuidSchema }) serverId: string,
  ) {
    return this.servers.leave(user.id, serverId);
  }

  @Delete(':serverId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('serverId', { schema: uuidSchema }) serverId: string,
  ) {
    return this.servers.remove(user.id, serverId);
  }
}
