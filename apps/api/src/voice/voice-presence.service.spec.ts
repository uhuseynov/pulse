import { VoicePresenceService } from './voice-presence.service';

describe('VoicePresenceService', () => {
  let voice: VoicePresenceService;

  beforeEach(() => {
    voice = new VoicePresenceService();
  });

  it('lists who is in a channel', () => {
    voice.join('channel-a', 'socket-1', 'user-1');
    voice.join('channel-a', 'socket-2', 'user-2');
    expect(voice.participants('channel-a').sort()).toEqual([
      'user-1',
      'user-2',
    ]);
    expect(voice.participants('channel-b')).toEqual([]);
  });

  it('counts a user with two tabs once', () => {
    voice.join('channel-a', 'socket-1', 'user-1');
    voice.join('channel-a', 'socket-2', 'user-1');
    expect(voice.participants('channel-a')).toEqual(['user-1']);

    voice.leave('socket-1');
    expect(voice.participants('channel-a')).toEqual(['user-1']);
    voice.leave('socket-2');
    expect(voice.participants('channel-a')).toEqual([]);
  });

  it('moves a socket out of its previous channel on join', () => {
    voice.join('channel-a', 'socket-1', 'user-1');
    expect(voice.join('channel-b', 'socket-1', 'user-1')).toBe('channel-a');
    expect(voice.participants('channel-a')).toEqual([]);
    expect(voice.participants('channel-b')).toEqual(['user-1']);
  });

  it('reports the channel a leaving socket was in, once', () => {
    voice.join('channel-a', 'socket-1', 'user-1');
    expect(voice.leave('socket-1')).toBe('channel-a');
    expect(voice.leave('socket-1')).toBeNull();
    expect(voice.leave('never-joined')).toBeNull();
  });

  it('summarises only the channels that have someone in them', () => {
    voice.join('channel-a', 'socket-1', 'user-1');
    expect(voice.snapshot(['channel-a', 'channel-b'])).toEqual({
      'channel-a': ['user-1'],
    });
  });
});
