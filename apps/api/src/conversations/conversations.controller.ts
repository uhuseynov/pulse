import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  openConversationSchema,
  type OpenConversationInput,
} from './conversations.schemas';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.conversations.list(user.id);
  }

  @Post()
  @HttpCode(200)
  open(
    @CurrentUser() user: AuthUser,
    @Body({ schema: openConversationSchema }) body: OpenConversationInput,
  ) {
    return this.conversations.open(user.id, body.userId);
  }
}
