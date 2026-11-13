import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeJwt } from 'jose';
import type { Env } from '../config/env';
import { VoiceService } from './voice.service';

const CONFIGURED = {
  LIVEKIT_URL: 'wss://example.livekit.cloud',
  LIVEKIT_API_KEY: 'APIKey',
  LIVEKIT_API_SECRET: 'secret-that-is-at-least-32-characters',
};

function serviceWith(values: Record<string, string | undefined>) {
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService<Env, true>;
  return new VoiceService(config);
}

describe('VoiceService', () => {
  it('is turned off when LiveKit is not configured', async () => {
    const voice = serviceWith({});
    expect(voice.enabled).toBe(false);
    await expect(
      voice.createToken({
        channelId: 'c1',
        userId: 'u1',
        displayName: 'Ada',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('mints a token that only grants access to the one room', async () => {
    const voice = serviceWith(CONFIGURED);
    expect(voice.enabled).toBe(true);

    const { token, url } = await voice.createToken({
      channelId: 'channel-1',
      userId: 'user-1',
      displayName: 'Ada Lovelace',
    });
    expect(url).toBe(CONFIGURED.LIVEKIT_URL);

    const claims = decodeJwt(token) as {
      sub: string;
      name: string;
      exp: number;
      video: Record<string, unknown>;
    };
    expect(claims.sub).toBe('user-1');
    expect(claims.name).toBe('Ada Lovelace');
    expect(claims.video).toMatchObject({
      room: 'channel-1',
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
    expect(claims.video.roomCreate).toBeFalsy();
  });

  it('issues short-lived tokens', async () => {
    const { token } = await serviceWith(CONFIGURED).createToken({
      channelId: 'channel-1',
      userId: 'user-1',
      displayName: 'Ada',
    });
    const { exp } = decodeJwt(token) as { exp: number };
    const minutesValid = (exp - Date.now() / 1000) / 60;
    expect(minutesValid).toBeGreaterThan(0);
    expect(minutesValid).toBeLessThanOrEqual(15);
  });
});
