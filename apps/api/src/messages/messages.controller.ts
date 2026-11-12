import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { uuidSchema } from '../common/schemas';
import {
  createMessageSchema,
  listMessagesSchema,
  type CreateMessageInput,
  type ListMessagesQuery,
} from './messages.schemas';
import { MessagesService } from './messages.service';

@Controller('channels/:channelId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('channelId', { schema: uuidSchema }) channelId: string,
    @Query({ schema: listMessagesSchema }) query: ListMessagesQuery,
  ) {
    return this.messages.list(user.id, channelId, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('channelId', { schema: uuidSchema }) channelId: string,
    @Body({ schema: createMessageSchema }) body: CreateMessageInput,
  ) {
    return this.messages.create(user.id, channelId, body);
  }
}
