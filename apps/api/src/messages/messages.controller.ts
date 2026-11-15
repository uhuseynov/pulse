import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
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
  updateMessageSchema,
  type CreateMessageInput,
  type ListMessagesQuery,
  type UpdateMessageInput,
} from './messages.schemas';
import { MessagesService } from './messages.service';

@Controller('channels/:channelId/messages')
@UseGuards(JwtAuthGuard)
export class ChannelMessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('channelId', { schema: uuidSchema }) channelId: string,
    @Query({ schema: listMessagesSchema }) query: ListMessagesQuery,
  ) {
    return this.messages.listInChannel(user.id, channelId, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('channelId', { schema: uuidSchema }) channelId: string,
    @Body({ schema: createMessageSchema }) body: CreateMessageInput,
  ) {
    return this.messages.createInChannel(user.id, channelId, body);
  }
}

@Controller('conversations/:conversationId/messages')
@UseGuards(JwtAuthGuard)
export class ConversationMessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('conversationId', { schema: uuidSchema }) conversationId: string,
    @Query({ schema: listMessagesSchema }) query: ListMessagesQuery,
  ) {
    return this.messages.listInConversation(user.id, conversationId, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('conversationId', { schema: uuidSchema }) conversationId: string,
    @Body({ schema: createMessageSchema }) body: CreateMessageInput,
  ) {
    return this.messages.createInConversation(user.id, conversationId, body);
  }
}

/** Editing and deleting work the same in channels and in conversations. */
@Controller('messages/:messageId')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Param('messageId', { schema: uuidSchema }) messageId: string,
    @Body({ schema: updateMessageSchema }) body: UpdateMessageInput,
  ) {
    return this.messages.update(user.id, messageId, body);
  }

  @Delete()
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('messageId', { schema: uuidSchema }) messageId: string,
  ) {
    return this.messages.remove(user.id, messageId);
  }
}
