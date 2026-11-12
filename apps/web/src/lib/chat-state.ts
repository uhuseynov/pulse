import type {
  Channel,
  Member,
  Message,
  MessagePage,
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
  messages: Record<string, ChannelMessages>;
  unreadChannels: Record<string, true>;
  unreadServers: Record<string, true>;
  /** channelId -> userId -> time (ms) at which the indicator expires. */
  typing: Record<string, Record<string, number>>;
  connected: boolean;
  error: string | null;
}

export const initialChatState: ChatState = {
  servers: null,
  activeServerId: null,
  server: null,
  activeChannelId: null,
  messages: {},
  unreadChannels: {},
  unreadServers: {},
  typing: {},
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
      serverId: string;
      message: Message;
      currentUserId: string;
    }
  | { type: "channelCreated"; channel: Channel }
  | { type: "channelDeleted"; serverId: string; channelId: string }
  | { type: "memberJoined"; serverId: string; member: Member }
  | { type: "memberLeft"; serverId: string; userId: string }
  | { type: "presenceChanged"; userId: string; online: boolean }
  | { type: "typingStarted"; channelId: string; userId: string; until: number }
  | { type: "typingExpired"; now: number }
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
  return (preferred ?? details.channels[0])?.id ?? null;
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
        activeServerId: action.serverId,
        server: null,
        activeChannelId: null,
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
      const entry = state.messages[message.channelId];
      const messages =
        entry && entry.status !== "error"
          ? {
              ...state.messages,
              [message.channelId]: {
                ...entry,
                items: mergeMessages(entry.items, [message]),
              },
            }
          : state.messages;

      const fromSomeoneElse = message.author.id !== currentUserId;
      const channelTyping = state.typing[message.channelId];
      return {
        ...state,
        messages,
        // The author has obviously stopped typing.
        typing: channelTyping
          ? {
              ...state.typing,
              [message.channelId]: omit(channelTyping, message.author.id),
            }
          : state.typing,
        unreadChannels:
          fromSomeoneElse && message.channelId !== state.activeChannelId
            ? { ...state.unreadChannels, [message.channelId]: true }
            : state.unreadChannels,
        unreadServers:
          fromSomeoneElse && serverId !== state.activeServerId
            ? { ...state.unreadServers, [serverId]: true }
            : state.unreadServers,
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
      if (!state.server?.members.some((m) => m.user.id === action.userId)) {
        return state;
      }
      return {
        ...state,
        server: {
          ...state.server,
          members: state.server.members.map((m) =>
            m.user.id === action.userId ? { ...m, online: action.online } : m,
          ),
        },
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

    case "connectionChanged":
      return { ...state, connected: action.connected };

    case "resynced":
      // Anything cached may be stale after a dropped connection.
      return { ...state, messages: {}, typing: {} };

    case "errorShown":
      return { ...state, error: action.message };

    case "errorDismissed":
      return { ...state, error: null };
  }
}
