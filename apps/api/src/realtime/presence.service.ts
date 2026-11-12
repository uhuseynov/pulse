import { Injectable } from '@nestjs/common';

/**
 * Tracks which users have at least one open socket. In-memory, so it is
 * only correct while the API runs as a single instance.
 */
@Injectable()
export class PresenceService {
  private readonly connections = new Map<string, number>();

  /** Returns true when this is the user's first open connection. */
  connect(userId: string): boolean {
    const count = (this.connections.get(userId) ?? 0) + 1;
    this.connections.set(userId, count);
    return count === 1;
  }

  /** Returns true when the user's last connection just closed. */
  disconnect(userId: string): boolean {
    const count = (this.connections.get(userId) ?? 0) - 1;
    if (count > 0) {
      this.connections.set(userId, count);
      return false;
    }
    this.connections.delete(userId);
    return true;
  }

  isOnline(userId: string): boolean {
    return this.connections.has(userId);
  }
}
