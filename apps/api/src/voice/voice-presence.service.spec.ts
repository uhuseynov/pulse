import type { RedisService } from '../redis/redis.service';
import { VoicePresenceService } from './voice-presence.service';

describe('VoicePresenceService (in memory)', () => {
  let voice: VoicePresenceService;

  beforeEach(() => {
    voice = new VoicePresenceService({ client: null } as RedisService);
  });

  it('lists who is in a channel', async () => {
    await voice.join('channel-a', 'socket-1', 'user-1');
    await voice.join('channel-a', 'socket-2', 'user-2');
    expect((await voice.participants('channel-a')).sort()).toEqual([
      'user-1',
      'user-2',
    ]);
    await expect(voice.participants('channel-b')).resolves.toEqual([]);
  });

  it('counts a user with two tabs once', async () => {
    await voice.join('channel-a', 'socket-1', 'user-1');
    await voice.join('channel-a', 'socket-2', 'user-1');
    await expect(voice.participants('channel-a')).resolves.toEqual(['user-1']);

    await voice.leave('channel-a', 'socket-1');
    await expect(voice.participants('channel-a')).resolves.toEqual(['user-1']);
    await voice.leave('channel-a', 'socket-2');
    await expect(voice.participants('channel-a')).resolves.toEqual([]);
  });

  it('ignores a socket leaving a channel it is not in', async () => {
    await voice.join('channel-a', 'socket-1', 'user-1');
    await voice.leave('channel-b', 'socket-1');
    await voice.leave('channel-a', 'socket-9');
    await expect(voice.participants('channel-a')).resolves.toEqual(['user-1']);
  });

  it('takes a snapshot of several channels, skipping empty ones', async () => {
    await voice.join('channel-a', 'socket-1', 'user-1');
    await voice.join('channel-b', 'socket-2', 'user-2');
    await expect(
      voice.snapshot(['channel-a', 'channel-b', 'channel-c']),
    ).resolves.toEqual({
      'channel-a': ['user-1'],
      'channel-b': ['user-2'],
    });
  });
});
