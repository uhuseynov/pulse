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

export interface Member {
  id: string;
  role: MemberRole;
  joinedAt: string;
  user: UserSummary;
  online: boolean;
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

export interface Message {
  id: string;
  content: string;
  channelId: string;
  createdAt: string;
  editedAt: string | null;
  author: UserSummary;
}

export interface MessagePage {
  items: Message[];
  nextCursor: string | null;
}

export interface VoiceCredentials {
  token: string;
  url: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}
