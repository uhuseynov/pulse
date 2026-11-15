/** Event names shared with the web client. */
export const ServerEvent = {
  MessageCreated: 'message:created',
  MessageUpdated: 'message:updated',
  MessageDeleted: 'message:deleted',
  ChannelCreated: 'channel:created',
  ChannelDeleted: 'channel:deleted',
  MemberJoined: 'member:joined',
  MemberUpdated: 'member:updated',
  MemberLeft: 'member:left',
  ServerDeleted: 'server:deleted',
  /** Sent only to a user who was removed from a server. */
  ServerKicked: 'server:kicked',
  /** Sent to a user whose friends or friend requests changed. */
  FriendsChanged: 'friends:changed',
  Presence: 'presence:changed',
  Typing: 'typing',
  VoiceParticipants: 'voice:participants',
} as const;

export const ClientEvent = {
  Typing: 'typing',
  /** Tells the server whether this tab is idle. */
  Activity: 'presence:activity',
  VoiceJoin: 'voice:join',
  VoiceLeave: 'voice:leave',
} as const;

export const SERVER_ROOM_PREFIX = 'server:';
export const serverRoom = (serverId: string) =>
  `${SERVER_ROOM_PREFIX}${serverId}`;
export const userRoom = (userId: string) => `user:${userId}`;
/** Joined by the friends of a user, to hear about their presence. */
export const presenceRoom = (userId: string) => `presence:${userId}`;
