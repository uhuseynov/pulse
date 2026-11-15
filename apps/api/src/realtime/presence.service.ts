import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export type PresenceStatus = 'online' | 'idle' | 'offline';

/** What one browser tab reports about itself. */
export type SocketState = 'active' | 'idle';

export interface PresenceChange {
  previous: PresenceStatus;
  current: PresenceStatus;
}

/** A socket that stops refreshing its entry is forgotten after this long. */
export const PRESENCE_TTL_MS = 60_000;
const HEARTBEAT_MS = 20_000;

const presenceKey = (userId: string) => `pulse:presence:${userId}`;

/**
 * Applies one change to a user's hash of sockets and returns the status
 * before and after it, atomically, so that two API instances can never both
 * announce (or both miss) the same transition.
 *
 * KEYS[1] the user's hash: socketId -> "<state>:<timestamp>"
 * ARGV    now, ttl, socketId, new state ("" removes the socket)
 */
const TRANSITION_SCRIPT = `
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local function status()
  local entries = redis.call('HGETALL', KEYS[1])
  local result = 'offline'
  for i = 1, #entries, 2 do
    local state, seen = string.match(entries[i + 1], '^(%a+):(%d+)$')
    if not seen or now - tonumber(seen) > ttl then
      redis.call('HDEL', KEYS[1], entries[i])
    elseif state == 'active' then
      result = 'online'
    elseif result == 'offline' then
      result = 'idle'
    end
  end
  return result
end
local previous = status()
if ARGV[4] == '' then
  redis.call('HDEL', KEYS[1], ARGV[3])
else
  redis.call('HSET', KEYS[1], ARGV[3], ARGV[4] .. ':' .. ARGV[1])
  redis.call('PEXPIRE', KEYS[1], ttl)
end
return { previous, status() }
`;

function combine(states: Iterable<SocketState>): PresenceStatus {
  let result: PresenceStatus = 'offline';
  for (const state of states) {
    if (state === 'active') return 'online';
    result = 'idle';
  }
  return result;
}

/**
 * Tracks every open socket of every user. A user is online while at least
 * one of their tabs is active, idle while all of them are idle, and offline
 * with none. State lives in Redis when it is configured, so any number of
 * API instances agree on it; otherwise in memory.
 */
@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  /** userId -> socketId -> state (in-memory mode). */
  private readonly users = new Map<string, Map<string, SocketState>>();
  /** Sockets connected to this instance (Redis mode), for the heartbeat. */
  private readonly local = new Map<
    string,
    { userId: string; state: SocketState }
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

  /** Records a socket, or a change of its state. */
  async set(
    userId: string,
    socketId: string,
    state: SocketState,
  ): Promise<PresenceChange> {
    if (this.redis.client) {
      this.local.set(socketId, { userId, state });
      return this.transition(userId, socketId, state);
    }
    const sockets = this.users.get(userId) ?? new Map<string, SocketState>();
    const previous = combine(sockets.values());
    sockets.set(socketId, state);
    this.users.set(userId, sockets);
    return { previous, current: combine(sockets.values()) };
  }

  /** Forgets a socket that has closed. */
  async remove(userId: string, socketId: string): Promise<PresenceChange> {
    if (this.redis.client) {
      this.local.delete(socketId);
      return this.transition(userId, socketId, '');
    }
    const sockets = this.users.get(userId);
    const previous = combine(sockets?.values() ?? []);
    sockets?.delete(socketId);
    if (sockets?.size === 0) {
      this.users.delete(userId);
    }
    return { previous, current: combine(sockets?.values() ?? []) };
  }

  /** The current status of each given user, as userId -> status. */
  async statuses(userIds: string[]): Promise<Map<string, PresenceStatus>> {
    const result = new Map<string, PresenceStatus>();
    const client = this.redis.client;
    if (!client) {
      for (const userId of userIds) {
        result.set(userId, combine(this.users.get(userId)?.values() ?? []));
      }
      return result;
    }
    if (userIds.length === 0) {
      return result;
    }

    const pipeline = client.pipeline();
    for (const userId of userIds) {
      pipeline.hvals(presenceKey(userId));
    }
    const replies = (await pipeline.exec()) ?? [];
    const now = Date.now();
    userIds.forEach((userId, index) => {
      const values = (replies[index]?.[1] as string[] | null) ?? [];
      const fresh: SocketState[] = [];
      for (const value of values) {
        const [state, seen] = value.split(':');
        if (now - Number(seen) <= PRESENCE_TTL_MS) {
          fresh.push(state === 'active' ? 'active' : 'idle');
        }
      }
      result.set(userId, combine(fresh));
    });
    return result;
  }

  async status(userId: string): Promise<PresenceStatus> {
    return (await this.statuses([userId])).get(userId) ?? 'offline';
  }

  private async transition(
    userId: string,
    socketId: string,
    state: SocketState | '',
  ): Promise<PresenceChange> {
    const [previous, current] = (await this.redis.client!.eval(
      TRANSITION_SCRIPT,
      1,
      presenceKey(userId),
      Date.now(),
      PRESENCE_TTL_MS,
      socketId,
      state,
    )) as [PresenceStatus, PresenceStatus];
    return { previous, current };
  }

  /**
   * Re-stamps this instance's sockets. If an instance dies without cleaning
   * up, its entries stop being refreshed and expire on their own.
   */
  private async refresh() {
    const client = this.redis.client;
    if (!client || this.local.size === 0) {
      return;
    }
    const now = Date.now();
    const pipeline = client.pipeline();
    for (const [socketId, { userId, state }] of this.local) {
      pipeline.hset(presenceKey(userId), socketId, `${state}:${now}`);
      pipeline.pexpire(presenceKey(userId), PRESENCE_TTL_MS);
    }
    await pipeline.exec().catch(() => undefined);
  }
}
