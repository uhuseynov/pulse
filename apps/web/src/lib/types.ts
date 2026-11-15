export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
}

export interface ServerSummary {
  id: string;
  name: string;
  ownerId: string;
}

export type MemberRole = "OWNER" | "ADMIN" | "MEMBER";

export type ChannelType = "TEXT" | "VOICE";

/** Idle means every open tab of the user has been inactive for a while. */
export type PresenceStatus = "online" | "idle" | "offline";

export interface Member {
  id: string;
  role: MemberRole;
  joinedAt: string;
  user: UserSummary;
  status: PresenceStatus;
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  serverId: string;
  createdAt: string;
}

export interface ServerDetails extends ServerSummary {
  inviteCode: string;
  channels: Channel[];
  members: Member[];
  /** channelId -> ids of the users currently in that voice channel. */
  voiceParticipants: Record<string, string[]>;
}

/** A message lives in a channel or in a conversation, never both. */
export interface Message {
  id: string;
  content: string;
  channelId: string | null;
  conversationId: string | null;
  createdAt: string;
  editedAt: string | null;
  author: UserSummary;
}

export interface MessagePage {
  items: Message[];
  nextCursor: string | null;
}

/** Where a list of messages lives. */
export interface Place {
  kind: "channel" | "conversation";
  id: string;
}

export interface FriendRequest {
  /** Id of the friendship, used to accept, decline or remove it. */
  id: string;
  createdAt: string;
  user: UserSummary;
}

export interface Friend extends FriendRequest {
  status: PresenceStatus;
}

export interface FriendsOverview {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export interface Conversation {
  id: string;
  createdAt: string;
  lastMessageAt: string;
  /** The other person. */
  user: UserSummary;
}

export interface VoiceCredentials {
  token: string;
  url: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}
