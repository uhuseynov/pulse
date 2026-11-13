import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AccessService } from '../access/access.service';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { uuidSchema } from '../common/schemas';
import { VoiceService } from './voice.service';

@Controller()
export class VoiceController {
  constructor(
    private readonly voice: VoiceService,
    private readonly access: AccessService,
  ) {}

  /** Lets the web app hide voice features when the server has no LiveKit keys. */
  @Get('voice/config')
  getConfig() {
    return { enabled: this.voice.enabled };
  }

  @Post('channels/:channelId/voice-token')
  @UseGuards(JwtAuthGuard)
  async createToken(
    @CurrentUser() user: AuthUser,
    @Param('channelId', { schema: uuidSchema }) channelId: string,
  ) {
    const channel = await this.access.requireVoiceChannel(user.id, channelId);
    const profile = await this.access.getDisplayName(user.id);
    return this.voice.createToken({
      channelId: channel.id,
      userId: user.id,
      displayName: profile,
    });
  }
}
