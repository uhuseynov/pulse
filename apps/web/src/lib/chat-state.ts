import type {
  Channel,
  Conversation,
  FriendsOverview,
  Member,
  Message,
  MessagePage,
  PresenceStatus,
  ServerDetails,
  ServerSummary,
} from "./types";

export interface ChannelMessages {
  status: "loading" | "ready" | "error";
  items: Message[];
  nextCursor: string | null;
  loadingOlder: boolean;
}

export interface ChatState {
  servers: ServerSummary[] | null;
  activeServerId: string | null;
  /** Details of the active server, null while they are loading. */
  server: ServerDetails | null;
  activeChannelId: string | null;
  /** True while the friends and direct-messages view is open. */
  home: boolean;
  friends: FriendsOverview | null;
  conversations: Conversation[] | null;
  /** The open conversation; null shows the friends list. */
  activeConversationId: string | null;
  /** Keyed by channel id or conversation id. */
  messages: Record<string, ChannelMessages>;
  unreadChannels: Record<string, true>;
  unreadServers: Record<string, true>;
  unreadConversations: Record<string, true>;
  /** channel or conversation id -> userId -> time (ms) the indicator expires. */
  typing: Record<string, Record<string, number>>;
  /** channelId -> ids of the users sitting in that voice channel. */
  voiceParticipants: Record<string, string[]>;
  /** True when the API has LiveKit configured. */
  voiceEnabled: boolean;
  connected: boolean;
  error: string | null;
}

export const initialChatState: ChatState = {
  servers: null,
  activeServerId: null,
  server: null,
  activeChannelId: null,
  home: false,
  friends: null,
  conversations: null,
  activeConversationId: null,
  messages: {},
  unreadChannels: {},
  unreadServers: {},
  unreadConversations: {},
  typing: {},
  voiceParticipants: {},
  voiceEnabled: false,
  connected: false,
  error: null,
};

export type ChatAction =
  | { type: "serversLoaded"; servers: ServerSummary[] }
  | { type: "serverSelected"; serverId: string | null }
  | { type: "serverLoaded"; details: ServerDetails; channelId: string | null }
  | { type: "serverRemoved"; serverId: string }
  | { type: "channelSelected"; channelId: string }
  | { type: "messagesLoading"; channelId: string }
  | { type: "messagesLoaded"; channelId: string; page: MessagePage }
  | { type: "messagesFailed"; channelId: string }
  | { type: "olderLoading"; channelId: string }
  | { type: "olderLoaded"; channelId: string; page: MessagePage | null }
  | {
      type: "messageReceived";
      /** Null for a direct message. */
      serverId: string | null;
      message: Message;
      currentUserId: string;
    }
  | { type: "messageUpdated"; message: Message }
  | { type: "messageDeleted"; placeId: string; messageId: string }
  | { type: "homeOpened" }
  | { type: "friendsLoaded"; friends: FriendsOverview }
  | { type: "conversationsLoaded"; conversations: Conversation[] }
  | { type: "conversationOpened"; conversation: Conversation }
  | { type: "conversationSelected"; conversationId: string | null }
  | { type: "channelCreated"; channel: Channel }
  | { type: "channelDeleted"; serverId: string; channelId: string }
  | { type: "memberJoined"; serverId: string; member: Member }
  | { type: "memberUpdated"; serverId: string; member: Member }
  | { type: "memberLeft"; serverId: string; userId: string }
  | { type: "presenceChanged"; userId: string; status: PresenceStatus }
  | { type: "typingStarted"; channelId: string; userId: string; until: number }
  | { type: "typingExpired"; now: number }
  | { type: "voiceEnabled" }
  | { type: "voiceParticipants"; channelId: string; userIds: string[] }
  | { type: "connectionChanged"; connected: boolean }
  | { type: "resynced" }
  | { type: "errorShown"; message: string }
  | { type: "errorDismissed" };

/**
 * Message ids are UUIDv7, so sorting them as strings sorts by creation time.
 */
function mergeMessages(...lists: Message[][]): Message[] {
  const byId = new Map<string, Message>();
  for (const list of lists) {
    for (const message of list) byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** The channel or conversation a message belongs to. */
export function placeIdOf(message: Message): string {
  return message.channelId ?? message.conversationId ?? "";
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const rest = { ...record };
  delete rest[key];
  return rest;
}

/** The channel to show when a server opens. */
export function pickChannel(
  details: ServerDetails,
  preferredId: string | null,
): string | null {
  const preferred = details.channels.find((c) => c.id === preferredId);
  const firstText = details.channels.find((c) => c.type === "TEXT");
  return (preferred ?? firstText ?? details.channels[0])?.id ?? null;
}

function removeServer(state: ChatState, serverId: string): ChatState {
  const isActive = state.activeServerId === serverId;
  return {
    ...state,
    servers: state.servers?.filter((s) => s.id !== serverId) ?? null,
    unreadServers: omit(state.unreadServers, serverId),
    ...(isActive
      ? { activeServerId: null, server: null, activeChannelId: null }
      : {}),
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "serversLoaded":
      return { ...state, servers: action.servers };

    case "serverSelected":
      return {
        ...state,
        home: false,
        activeServerId: action.serverId,
        server: null,
        activeChannelId: null,
      };

    case "homeOpened":
      return {
        ...state,
        home: true,
        activeServerId: null,
        server: null,
        activeChannelId: null,
        unreadConversations: state.activeConversationId
          ? omit(state.unreadConversations, state.activeConversationId)
          : state.unreadConversations,
      };

    case "friendsLoaded":
      return { ...state, friends: action.friends };

    case "conversationsLoaded": {
      const stillThere = action.conversations.some(
        (c) => c.id === state.activeConversationId,
      );
      return {
        ...state,
        conversations: action.conversations,
        activeConversationId: stillThere ? state.activeConversationId : null,
      };
    }

    case "conversationOpened": {
      const { conversation } = action;
      const known = state.conversations?.some((c) => c.id === conversation.id);
      return {
        ...state,
        conversations: known
          ? state.conversations
          : [conversation, ...(state.conversations ?? [])],
        activeConversationId: conversation.id,
        unreadConversations: omit(state.unreadConversations, conversation.id),
      };
    }

    case "conversationSelected":
      return {
        ...state,
        activeConversationId: action.conversationId,
        unreadConversations: action.conversationId
          ? omit(state.unreadConversations, action.conversationId)
          : state.unreadConversations,
      };

    case "serverLoaded": {
      const { details } = action;
      const known = state.servers?.some((s) => s.id === details.id);
      const summary = {
        id: details.id,
        name: details.name,
        ownerId: details.ownerId,
      };
      const servers = known
        ? state.servers
        : [...(state.servers ?? []), summary];
      // A slow response for a server the user has already navigated away from.
      if (state.activeServerId !== details.id) {
        return { ...state, servers };
      }
      return {
        ...state,
        servers,
        server: details,
        voiceParticipants: {
          ...state.voiceParticipants,
          ...details.voiceParticipants,
        },
        activeChannelId: action.channelId,
        unreadServers: omit(state.unreadServers, details.id),
        unreadChannels: action.channelId
          ? omit(state.unreadChannels, action.channelId)
          : state.unreadChannels,
      };
    }

    case "serverRemoved":
      return removeServer(state, action.serverId);

    case "channelSelected":
      return {
        ...state,
        activeChannelId: action.channelId,
        unreadChannels: omit(state.unreadChannels, action.channelId),
      };

    case "messagesLoading":
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.channelId]: {
            status: "loading",
            items: [],
            nextCursor: null,
            loadingOlder: false,
          },
        },
      };

    case "messagesLoaded": {
      // Keep anything that arrived over the socket while the page loaded.
      const live = state.messages[action.channelId]?.items ?? [];
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.channelId]: {
            status: "ready",
            items: mergeMessages(action.page.items, live),
            nextCursor: action.page.nextCursor,
            loadingOlder: false,
          },
        },
      };
    }

    case "messagesFailed":
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.channelId]: {
            status: "error",
            items: [],
            nextCursor: null,
            loadingOlder: false,
          },
        },
      };

    case "olderLoading": {
      const entry = state.messages[action.channelId];
      if (!entry) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.channelId]: { ...entry, loadingOlder: true },
        },
      };
    }

    case "olderLoaded": {
      const entry = state.messages[action.channelId];
      if (!entry) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.channelId]: action.page
            ? {
                ...entry,
                items: mergeMessages(action.page.items, entry.items),
                nextCursor: action.page.nextCursor,
                loadingOlder: false,
              }
            : { ...entry, loadingOlder: false },
        },
      };
    }

    case "messageReceived": {
      const { message, serverId, currentUserId } = action;
      const placeId = placeIdOf(message);
      const entry = state.messages[placeId];
      const messages =
        entry && entry.status !== "error"
          ? {
              ...state.messages,
              [placeId]: {
                ...entry,
                items: mergeMessages(entry.items, [message]),
              },
            }
          : state.messages;

      const fromSomeoneElse = message.author.id !== currentUserId;
      const placeTyping = state.typing[placeId];
      const next: ChatState = {
        ...state,
        messages,
        // The author has obviously stopped typing.
        typing: placeTyping
          ? { ...state.typing, [placeId]: omit(placeTyping, message.author.id) }
          : state.typing,
      };

      if (message.conversationId) {
        const onScreen =
          state.home && state.activeConversationId === message.conversationId;
        const moved = state.conversations?.find(
          (c) => c.id === message.conversationId,
        );
        return {
          ...next,
          // The conversation with the newest message goes first.
          conversations:
            moved && state.conversations
              ? [
                  { ...moved, lastMessageAt: message.createdAt },
                  ...state.conversations.filter((c) => c.id !== moved.id),
                ]
              : state.conversations,
          unreadConversations:
            fromSomeoneElse && !onScreen
              ? { ...state.unreadConversations, [message.conversationId]: true }
              : state.unreadConversations,
        };
      }

      return {
        ...next,
        unreadChannels:
          fromSomeoneElse && placeId !== state.activeChannelId
            ? { ...state.unreadChannels, [placeId]: true }
            : state.unreadChannels,
        unreadServers:
          fromSomeoneElse && serverId && serverId !== state.activeServerId
            ? { ...state.unreadServers, [serverId]: true }
            : state.unreadServers,
      };
    }

    case "messageUpdated": {
      const placeId = placeIdOf(action.message);
      const entry = state.messages[placeId];
      if (!entry?.items.some((m) => m.id === action.message.id)) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          [placeId]: {
            ...entry,
            items: entry.items.map((m) =>
              m.id === action.message.id ? action.message : m,
            ),
          },
        },
      };
    }

    case "messageDeleted": {
      const entry = state.messages[action.placeId];
      if (!entry?.items.some((m) => m.id === action.messageId)) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.placeId]: {
            ...entry,
            items: entry.items.filter((m) => m.id !== action.messageId),
          },
        },
      };
    }

    case "channelCreated": {
      const { channel } = action;
      if (
        state.server?.id !== channel.serverId ||
        state.server.channels.some((c) => c.id === channel.id)
      ) {
        return state;
      }
      return {
        ...state,
        server: {
          ...state.server,
          channels: [...state.server.channels, channel],
        },
      };
    }

    case "channelDeleted": {
      const next: ChatState = {
        ...state,
        messages: omit(state.messages, action.channelId),
        unreadChannels: omit(state.unreadChannels, action.channelId),
        voiceParticipants: omit(state.voiceParticipants, action.channelId),
      };
      if (state.server?.id !== action.serverId) return next;
      const channels = state.server.channels.filter(
        (c) => c.id !== action.channelId,
      );
      return {
        ...next,
        server: { ...state.server, channels },
        activeChannelId:
          state.activeChannelId === action.channelId
            ? (channels[0]?.id ?? null)
            : state.activeChannelId,
      };
    }

    case "memberJoined": {
      if (
        state.server?.id !== action.serverId ||
        state.server.members.some((m) => m.id === action.member.id)
      ) {
        return state;
      }
      return {
        ...state,
        server: {
          ...state.server,
          members: [...state.server.members, action.member],
        },
      };
    }

    case "memberUpdated": {
      if (state.server?.id !== action.serverId) return state;
      return {
        ...state,
        server: {
          ...state.server,
          members: state.server.members.map((m) =>
            m.id === action.member.id ? action.member : m,
          ),
        },
      };
    }

    case "memberLeft": {
      if (state.server?.id !== action.serverId) return state;
      return {
        ...state,
        server: {
          ...state.server,
          members: state.server.members.filter(
            (m) => m.user.id !== action.userId,
          ),
        },
      };
    }

    case "presenceChanged": {
      const { userId, status } = action;
      const inServer = state.server?.members.some((m) => m.user.id === userId);
      const isFriend = state.friends?.friends.some((f) => f.user.id === userId);
      if (!inServer && !isFriend) return state;
      return {
        ...state,
        server:
          inServer && state.server
            ? {
                ...state.server,
                members: state.server.members.map((m) =>
                  m.user.id === userId ? { ...m, status } : m,
                ),
              }
            : state.server,
        friends:
          isFriend && state.friends
            ? {
                ...state.friends,
                friends: state.friends.friends.map((f) =>
                  f.user.id === userId ? { ...f, status } : f,
                ),
              }
            : state.friends,
      };
    }

    case "typingStarted":
      return {
        ...state,
        typing: {
          ...state.typing,
          [action.channelId]: {
            ...state.typing[action.channelId],
            [action.userId]: action.until,
          },
        },
      };

    case "typingExpired": {
      const typing: ChatState["typing"] = {};
      for (const [channelId, users] of Object.entries(state.typing)) {
        const active = Object.fromEntries(
          Object.entries(users).filter(([, until]) => until > action.now),
        );
        if (Object.keys(active).length > 0) typing[channelId] = active;
      }
      return { ...state, typing };
    }

    case "voiceEnabled":
      return { ...state, voiceEnabled: true };

    case "voiceParticipants": {
      if (action.userIds.length === 0) {
        return {
          ...state,
          voiceParticipants: omit(state.voiceParticipants, action.channelId),
        };
      }
      return {
        ...state,
        voiceParticipants: {
          ...state.voiceParticipants,
          [action.channelId]: action.userIds,
        },
      };
    }

    case "connectionChanged":
      return { ...state, connected: action.connected };

    case "resynced":
      // Anything cached may be stale after a dropped connection.
      return { ...state, messages: {}, typing: {}, voiceParticipants: {} };

    case "errorShown":
      return { ...state, error: action.message };

    case "errorDismissed":
      return { ...state, error: null };
  }
}
