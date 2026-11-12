/** Event names shared with the web client. */
export const ServerEvent = {
  MessageCreated: 'message:created',
  ChannelCreated: 'channel:created',
  ChannelDeleted: 'channel:deleted',
  MemberJoined: 'member:joined',
  MemberLeft: 'member:left',
  ServerDeleted: 'server:deleted',
  Presence: 'presence:changed',
  Typing: 'typing',
} as const;

export const ClientEvent = {
  Typing: 'typing',
} as const;

export const SERVER_ROOM_PREFIX = 'server:';
export const serverRoom = (serverId: string) =>
  `${SERVER_ROOM_PREFIX}${serverId}`;
export const userRoom = (userId: string) => `user:${userId}`;
