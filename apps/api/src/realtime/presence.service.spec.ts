import type { RedisService } from '../redis/redis.service';
import { PresenceService } from './presence.service';

describe('PresenceService (in memory)', () => {
  let presence: PresenceService;

  beforeEach(() => {
    presence = new PresenceService({ client: null } as RedisService);
  });

  it('reports the change when the first socket connects', async () => {
    await expect(presence.set('u1', 's1', 'active')).resolves.toEqual({
      previous: 'offline',
      current: 'online',
    });
    await expect(presence.set('u1', 's2', 'active')).resolves.toEqual({
      previous: 'online',
      current: 'online',
    });
    await expect(presence.status('u1')).resolves.toBe('online');
  });

  it('keeps a user online until their last socket closes', async () => {
    await presence.set('u1', 's1', 'active');
    await presence.set('u1', 's2', 'active');
    await expect(presence.remove('u1', 's1')).resolves.toEqual({
      previous: 'online',
      current: 'online',
    });
    await expect(presence.remove('u1', 's2')).resolves.toEqual({
      previous: 'online',
      current: 'offline',
    });
    await expect(presence.status('u1')).resolves.toBe('offline');
  });

  it('is idle only while every socket is idle', async () => {
    await presence.set('u1', 's1', 'active');
    await presence.set('u1', 's2', 'active');
    await expect(presence.set('u1', 's1', 'idle')).resolves.toEqual({
      previous: 'online',
      current: 'online',
    });
    await expect(presence.set('u1', 's2', 'idle')).resolves.toEqual({
      previous: 'online',
      current: 'idle',
    });
    await expect(presence.set('u1', 's1', 'active')).resolves.toEqual({
      previous: 'idle',
      current: 'online',
    });
  });

  it('goes back to idle when the only active socket closes', async () => {
    await presence.set('u1', 's1', 'idle');
    await presence.set('u1', 's2', 'active');
    await expect(presence.remove('u1', 's2')).resolves.toEqual({
      previous: 'online',
      current: 'idle',
    });
  });

  it('ignores a socket that was never recorded', async () => {
    await expect(presence.remove('ghost', 's1')).resolves.toEqual({
      previous: 'offline',
      current: 'offline',
    });
  });

  it('looks up many users at once', async () => {
    await presence.set('u1', 's1', 'active');
    await presence.set('u2', 's2', 'idle');
    const statuses = await presence.statuses(['u1', 'u2', 'u3']);
    expect(Object.fromEntries(statuses)).toEqual({
      u1: 'online',
      u2: 'idle',
      u3: 'offline',
    });
  });
});
