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
  friendRequestSchema,
  type FriendRequestInput,
} from './friends.schemas';
import { FriendsService } from './friends.service';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.friends.list(user.id);
  }

  @Post('requests')
  request(
    @CurrentUser() user: AuthUser,
    @Body({ schema: friendRequestSchema }) body: FriendRequestInput,
  ) {
    return this.friends.request(user.id, body.username);
  }

  @Post('requests/:friendshipId/accept')
  @HttpCode(204)
  accept(
    @CurrentUser() user: AuthUser,
    @Param('friendshipId', { schema: uuidSchema }) friendshipId: string,
  ) {
    return this.friends.accept(user.id, friendshipId);
  }

  @Delete(':friendshipId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('friendshipId', { schema: uuidSchema }) friendshipId: string,
  ) {
    return this.friends.remove(user.id, friendshipId);
  }
}
