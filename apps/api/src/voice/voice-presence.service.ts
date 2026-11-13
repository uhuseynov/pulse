import { Injectable } from '@nestjs/common';

/**
 * Tracks who is sitting in each voice channel, keyed by socket so that a user
 * with two tabs open is counted once and leaves only when the last one goes.
 * In memory, so it is correct while the API runs as a single instance.
 */
@Injectable()
export class VoicePresenceService {
  /** channelId -> socketId -> userId */
  private readonly channels = new Map<string, Map<string, string>>();
  /** socketId -> channelId, so a disconnect can be cleaned up. */
  private readonly sockets = new Map<string, string>();

  /** Returns the channel the socket left, if it was in another one. */
  join(channelId: string, socketId: string, userId: string): string | null {
    const previous = this.leave(socketId);
    const occupants = this.channels.get(channelId) ?? new Map<string, string>();
    occupants.set(socketId, userId);
    this.channels.set(channelId, occupants);
    this.sockets.set(socketId, channelId);
    return previous;
  }

  /** Returns the channel the socket was in, or null. */
  leave(socketId: string): string | null {
    const channelId = this.sockets.get(socketId);
    if (!channelId) {
      return null;
    }
    this.sockets.delete(socketId);
    const occupants = this.channels.get(channelId);
    occupants?.delete(socketId);
    if (occupants?.size === 0) {
      this.channels.delete(channelId);
    }
    return channelId;
  }

  /** Distinct user ids currently in a channel. */
  participants(channelId: string): string[] {
    return [...new Set(this.channels.get(channelId)?.values() ?? [])];
  }

  /** Participants of every given channel, as channelId -> user ids. */
  snapshot(channelIds: string[]): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const channelId of channelIds) {
      const participants = this.participants(channelId);
      if (participants.length > 0) {
        result[channelId] = participants;
      }
    }
    return result;
  }
}
