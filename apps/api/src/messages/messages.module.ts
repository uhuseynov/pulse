import { Module } from '@nestjs/common';
import {
  ChannelMessagesController,
  ConversationMessagesController,
  MessagesController,
} from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  controllers: [
    ChannelMessagesController,
    ConversationMessagesController,
    MessagesController,
  ],
  providers: [MessagesService],
})
export class MessagesModule {}
