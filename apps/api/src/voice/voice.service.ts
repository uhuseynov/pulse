import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import type { Env } from '../config/env';

/** How long a freshly minted room token stays valid. */
const TOKEN_TTL = '15m';

interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Mints the short-lived tokens the browser needs to join a LiveKit room.
 * One room per voice channel, named after the channel's id.
 */
@Injectable()
export class VoiceService {
  private readonly config: LiveKitConfig | null;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get('LIVEKIT_URL', { infer: true });
    const apiKey = config.get('LIVEKIT_API_KEY', { infer: true });
    const apiSecret = config.get('LIVEKIT_API_SECRET', { infer: true });
    this.config =
      url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
  }

  get enabled(): boolean {
    return this.config !== null;
  }

  async createToken(params: {
    channelId: string;
    userId: string;
    displayName: string;
  }): Promise<{ token: string; url: string }> {
    if (!this.config) {
      throw new ServiceUnavailableException('Voice rooms are not configured');
    }
    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity: params.userId,
      name: params.displayName,
      ttl: TOKEN_TTL,
    });
    token.addGrant({
      room: params.channelId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      // Pulse carries its own messages over Socket.IO.
      canPublishData: false,
    });
    return { token: await token.toJwt(), url: this.config.url };
  }
}
