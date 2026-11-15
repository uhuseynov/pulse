import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendshipStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';
import { ServerEvent } from '../realtime/realtime.events';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const userSelect = {
  id: true,
  username: true,
  displayName: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly presence: PresenceService,
  ) {}

  /** The caller's friends, and the requests waiting in either direction. */
  async list(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      orderBy: { createdAt: 'asc' },
      include: {
        requester: { select: userSelect },
        addressee: { select: userSelect },
      },
    });
    const views = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      accepted: row.status === FriendshipStatus.ACCEPTED,
      sentByMe: row.requesterId === userId,
      user: row.requesterId === userId ? row.addressee : row.requester,
    }));
    const friends = views.filter((view) => view.accepted);
    const statuses = await this.presence.statuses(
      friends.map((friend) => friend.user.id),
    );
    const request = ({ id, createdAt, user }: (typeof views)[number]) => ({
      id,
      createdAt,
      user,
    });

    return {
      friends: friends.map((friend) => ({
        ...request(friend),
        status: statuses.get(friend.user.id) ?? 'offline',
      })),
      incoming: views.filter((v) => !v.accepted && !v.sentByMe).map(request),
      outgoing: views.filter((v) => !v.accepted && v.sentByMe).map(request),
    };
  }

  /**
   * Sends a friend request by username. If that person has already sent one
   * to the caller, the two become friends straight away.
   */
  async request(userId: string, username: string) {
    const target = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('There is no user with that username');
    }
    if (target.id === userId) {
      throw new BadRequestException('You cannot add yourself as a friend');
    }

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: userId },
        ],
      },
    });
    if (existing?.status === FriendshipStatus.ACCEPTED) {
      throw new ConflictException('You are already friends');
    }
    if (existing?.requesterId === userId) {
      throw new ConflictException('You have already sent a request');
    }
    if (existing) {
      await this.accept(userId, existing.id);
      return { accepted: true };
    }

    try {
      await this.prisma.friendship.create({
        data: { requesterId: userId, addresseeId: target.id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('You have already sent a request');
      }
      throw error;
    }
    this.notify(userId, target.id);
    return { accepted: false };
  }

  /** Only the person who received a request can accept it. */
  async accept(userId: string, friendshipId: string) {
    const { count } = await this.prisma.friendship.updateMany({
      where: {
        id: friendshipId,
        addresseeId: userId,
        status: FriendshipStatus.PENDING,
      },
      data: { status: FriendshipStatus.ACCEPTED },
    });
    if (count === 0) {
      throw new NotFoundException('Friend request not found');
    }
    const { requesterId } = await this.prisma.friendship.findUniqueOrThrow({
      where: { id: friendshipId },
    });
    this.realtime.linkFriends(userId, requesterId);
    this.notify(userId, requesterId);
  }

  /** Removes a friend, declines a request, or cancels one the caller sent. */
  async remove(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        id: friendshipId,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
    });
    if (!friendship) {
      throw new NotFoundException('Friend not found');
    }
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    this.realtime.unlinkFriends(friendship.requesterId, friendship.addresseeId);
    this.notify(friendship.requesterId, friendship.addresseeId);
  }

  /** Both sides reload their lists; the event itself carries no data. */
  private notify(a: string, b: string) {
    this.realtime.emitToUsers([a, b], ServerEvent.FriendsChanged, {});
  }
}
