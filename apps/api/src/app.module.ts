import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './access/access.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { HttpThrottlerGuard } from './common/http-throttler.guard';
import { ChannelsModule } from './channels/channels.module';
import { ConversationsModule } from './conversations/conversations.module';
import { validateEnv } from './config/env';
import { FriendsModule } from './friends/friends.module';
import { MailModule } from './mail/mail.module';
import { MessagesModule } from './messages/messages.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { ServersModule } from './servers/servers.module';
import { VoiceModule } from './voice/voice.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // A generous limit for the whole API; auth routes set a stricter one.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    RedisModule,
    MailModule,
    AuthModule,
    AccessModule,
    RealtimeModule,
    ServersModule,
    ChannelsModule,
    MessagesModule,
    FriendsModule,
    ConversationsModule,
    VoiceModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: HttpThrottlerGuard }],
})
export class AppModule {}
