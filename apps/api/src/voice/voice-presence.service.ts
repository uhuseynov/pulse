import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const VOICE_TTL_MS = 60_000;
const HEARTBEAT_MS = 20_000;

const voiceKey = (channelId: string) => `pulse:voice:${channelId}`;

/** Re-stamps an occupant, but only if nobody removed them in the meantime. */
const REFRESH_SCRIPT = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then
  redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
end
return 1
`;

/**
 * Tracks who is sitting in each voice channel, keyed by socket so that a user
 * with two tabs open is counted once and leaves only when the last one goes.
 * State lives in Redis when it is configured, otherwise in memory. Callers
 * remember which channel a socket is in (on the socket itself).
 */
@Injectable()
export class VoicePresenceService implements OnModuleInit, OnModuleDestroy {
  /** channelId -> socketId -> userId (in-memory mode). */
  private readonly channels = new Map<string, Map<string, string>>();
  /** Sockets connected to this instance (Redis mode), for the heartbeat. */
  private readonly local = new Map<
    string,
    { channelId: string; userId: string }
  >();
  private heartbeat?: ReturnType<typeof setInterval>;

  constructor(private readonly redis: RedisService) {}

  onModuleInit() {
    if (this.redis.client) {
      this.heartbeat = setInterval(() => void this.refresh(), HEARTBEAT_MS);
      this.heartbeat.unref();
    }
  }

  onModuleDestroy() {
    clearInterval(this.heartbeat);
  }

  async join(channelId: string, socketId: string, userId: string) {
    const client = this.redis.client;
    if (client) {
      this.local.set(socketId, { channelId, userId });
      await client
        .multi()
        .hset(voiceKey(channelId), socketId, `${userId}:${Date.now()}`)
        .pexpire(voiceKey(channelId), VOICE_TTL_MS)
        .exec();
      return;
    }
    const occupants = this.channels.get(channelId) ?? new Map<string, string>();
    occupants.set(socketId, userId);
    this.channels.set(channelId, occupants);
  }

  async leave(channelId: string, socketId: string) {
    const client = this.redis.client;
    if (client) {
      if (this.local.get(socketId)?.channelId === channelId) {
        this.local.delete(socketId);
      }
      await client.hdel(voiceKey(channelId), socketId);
      return;
    }
    const occupants = this.channels.get(channelId);
    occupants?.delete(socketId);
    if (occupants?.size === 0) {
      this.channels.delete(channelId);
    }
  }

  /** Distinct user ids currently in a channel. */
  async participants(channelId: string): Promise<string[]> {
    return (await this.snapshot([channelId]))[channelId] ?? [];
  }

  /** Participants of every given channel, as channelId -> user ids. */
  async snapshot(channelIds: string[]): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = {};
    const client = this.redis.client;
    if (!client) {
      for (const channelId of channelIds) {
        const users = [...new Set(this.channels.get(channelId)?.values())];
        if (users.length > 0) {
          result[channelId] = users;
        }
      }
      return result;
    }
    if (channelIds.length === 0) {
      return result;
    }

    const pipeline = client.pipeline();
    for (const channelId of channelIds) {
      pipeline.hvals(voiceKey(channelId));
    }
    const replies = (await pipeline.exec()) ?? [];
    const now = Date.now();
    channelIds.forEach((channelId, index) => {
      const values = (replies[index]?.[1] as string[] | null) ?? [];
      const users = new Set<string>();
      for (const value of values) {
        const [userId, seen] = value.split(':');
        if (now - Number(seen) <= VOICE_TTL_MS) {
          users.add(userId);
        }
      }
      if (users.size > 0) {
        result[channelId] = [...users];
      }
    });
    return result;
  }

  private async refresh() {
    const client = this.redis.client;
    if (!client || this.local.size === 0) {
      return;
    }
    const now = Date.now();
    const pipeline = client.pipeline();
    for (const [socketId, { channelId, userId }] of this.local) {
      pipeline.eval(
        REFRESH_SCRIPT,
        1,
        voiceKey(channelId),
        socketId,
        `${userId}:${now}`,
        VOICE_TTL_MS,
      );
    }
    await pipeline.exec().catch(() => undefined);
  }
}
