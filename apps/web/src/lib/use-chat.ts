"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { api, API_URL, ApiError } from "./api";
import {
  chatReducer,
  initialChatState,
  pickChannel,
  type ChatState,
} from "./chat-state";
import type {
  Channel,
  ChannelType,
  Member,
  Message,
  Place,
  PresenceStatus,
} from "./types";

const TYPING_VISIBLE_MS = 3500;
const TYPING_SEND_INTERVAL_MS = 2000;
/** Without any input for this long, the tab reports itself as idle. */
const IDLE_AFTER_MS = 5 * 60 * 1000;
const LAST_SERVER_KEY = "pulse.lastServer";
/** Stored in place of a server id when the friends view was open. */
const HOME = "home";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "wheel",
  "focus",
  "visibilitychange",
] as const;

function describe(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Something went wrong. Please try again.";
}

function remember(serverId: string | null) {
  try {
    if (serverId) window.localStorage.setItem(LAST_SERVER_KEY, serverId);
    else window.localStorage.removeItem(LAST_SERVER_KEY);
  } catch {
    // Not being able to remember the last server is harmless.
  }
}

function recall(): string | null {
  try {
    return window.localStorage.getItem(LAST_SERVER_KEY);
  } catch {
    return null;
  }
}

/**
 * All chat state and actions for the signed-in user: the server list, the
 * open server and channel, message history, and live updates over Socket.IO.
 */
export function useChat(token: string, currentUserId: string) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  // Async callbacks need the latest state without being recreated for it.
  const stateRef = useRef<ChatState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const socketRef = useRef<Socket | null>(null);
  const lastTypingSentRef = useRef({ placeId: "", at: 0 });

  const showError = useCallback((error: unknown) => {
    dispatch({ type: "errorShown", message: describe(error) });
  }, []);

  const idleRef = useRef(false);

  // The reducer keys message lists by "channelId" for channels and
  // conversations alike: both are ids of the place the messages live in.
  const loadMessages = useCallback(
    async (place: Place, force = false) => {
      const channelId = place.id;
      if (!force && stateRef.current.messages[channelId]) return;
      dispatch({ type: "messagesLoading", channelId });
      try {
        const page = await api.listMessages(token, place);
        dispatch({ type: "messagesLoaded", channelId, page });
      } catch {
        dispatch({ type: "messagesFailed", channelId });
      }
    },
    [token],
  );

  const loadFriends = useCallback(async () => {
    try {
      const friends = await api.listFriends(token);
      dispatch({ type: "friendsLoaded", friends });
    } catch {
      // The list simply stays as it was; the next event reloads it.
    }
  }, [token]);

  const loadConversations = useCallback(async () => {
    try {
      const conversations = await api.listConversations(token);
      dispatch({ type: "conversationsLoaded", conversations });
    } catch {
      // Same as above.
    }
  }, [token]);

  const openHome = useCallback(
    (options: { force?: boolean } = {}) => {
      dispatch({ type: "homeOpened" });
      remember(HOME);
      const { activeConversationId } = stateRef.current;
      if (activeConversationId) {
        void loadMessages(
          { kind: "conversation", id: activeConversationId },
          options.force,
        );
      }
    },
    [loadMessages],
  );

  const openServer = useCallback(
    async (serverId: string, options: { force?: boolean } = {}) => {
      const previousChannelId =
        stateRef.current.activeServerId === serverId
          ? stateRef.current.activeChannelId
          : null;
      if (stateRef.current.activeServerId !== serverId) {
        dispatch({ type: "serverSelected", serverId });
      }
      remember(serverId);
      try {
        const details = await api.getServer(token, serverId);
        const channelId = pickChannel(details, previousChannelId);
        dispatch({ type: "serverLoaded", details, channelId });
        const opened = details.channels.find((c) => c.id === channelId);
        if (channelId && opened?.type !== "VOICE") {
          await loadMessages({ kind: "channel", id: channelId }, options.force);
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          // We were removed, or the server was deleted, while away.
          dispatch({ type: "serverRemoved", serverId });
          remember(null);
        } else {
          showError(error);
        }
      }
    },
    [token, loadMessages, showError],
  );

  // First load: fetch the server list and reopen the last server.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        void api.voiceConfig().then(
          (config) => {
            if (!cancelled && config.enabled)
              dispatch({ type: "voiceEnabled" });
          },
          () => undefined,
        );
        void loadFriends();
        void loadConversations();
        const servers = await api.listServers(token);
        if (cancelled) return;
        dispatch({ type: "serversLoaded", servers });
        const last = recall();
        const first = servers.find((s) => s.id === last) ?? servers[0];
        if (last === HOME) openHome();
        else if (first) await openServer(first.id);
      } catch (error) {
        if (!cancelled) showError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, openServer, openHome, loadFriends, loadConversations, showError]);

  // Live updates.
  useEffect(() => {
    const socket = io(API_URL, {
      auth: { token },
      transports: ["websocket"],
    });
    socketRef.current = socket;
    let hasConnectedBefore = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    socket.on("connect", () => {
      dispatch({ type: "connectionChanged", connected: true });
      if (hasConnectedBefore) {
        // Events were missed while offline: reload what is on screen.
        dispatch({ type: "resynced" });
        const { activeServerId, home } = stateRef.current;
        if (activeServerId) void openServer(activeServerId, { force: true });
        else if (home) openHome({ force: true });
        void loadFriends();
        void loadConversations();
        void api.listServers(token).then(
          (servers) => dispatch({ type: "serversLoaded", servers }),
          () => undefined,
        );
      }
      hasConnectedBefore = true;
      // A new connection starts out active on the server.
      if (idleRef.current) socket.emit("presence:activity", { idle: true });
    });
    socket.on("disconnect", () => {
      dispatch({ type: "connectionChanged", connected: false });
    });

    socket.on(
      "message:created",
      (event: { serverId: string | null; message: Message }) => {
        const { conversationId } = event.message;
        const known = stateRef.current.conversations?.some(
          (c) => c.id === conversationId,
        );
        dispatch({ type: "messageReceived", ...event, currentUserId });
        // The first message of a conversation this client has not seen yet.
        if (conversationId && !known) void loadConversations();
      },
    );
    socket.on("message:updated", (event: { message: Message }) => {
      dispatch({ type: "messageUpdated", message: event.message });
    });
    socket.on(
      "message:deleted",
      (event: {
        channelId: string | null;
        conversationId: string | null;
        messageId: string;
      }) => {
        dispatch({
          type: "messageDeleted",
          placeId: event.channelId ?? event.conversationId ?? "",
          messageId: event.messageId,
        });
      },
    );
    socket.on("channel:created", (channel: Channel) => {
      dispatch({ type: "channelCreated", channel });
    });
    socket.on(
      "channel:deleted",
      (event: { serverId: string; channelId: string }) => {
        const wasActive = stateRef.current.activeChannelId === event.channelId;
        const fallback = stateRef.current.server?.channels.find(
          (c) => c.id !== event.channelId,
        );
        dispatch({ type: "channelDeleted", ...event });
        if (wasActive && fallback?.type === "TEXT") {
          void loadMessages({ kind: "channel", id: fallback.id });
        }
      },
    );
    socket.on(
      "member:joined",
      (event: { serverId: string; member: Member }) => {
        dispatch({ type: "memberJoined", ...event });
      },
    );
    socket.on("member:left", (event: { serverId: string; userId: string }) => {
      dispatch({ type: "memberLeft", ...event });
    });
    socket.on(
      "member:updated",
      (event: { serverId: string; member: Member }) => {
        dispatch({ type: "memberUpdated", ...event });
      },
    );
    socket.on("server:deleted", (event: { serverId: string }) => {
      dispatch({ type: "serverRemoved", serverId: event.serverId });
    });
    socket.on("server:kicked", (event: { serverId: string }) => {
      const name = stateRef.current.servers?.find(
        (s) => s.id === event.serverId,
      )?.name;
      dispatch({ type: "serverRemoved", serverId: event.serverId });
      dispatch({
        type: "errorShown",
        message: `You were removed from ${name ?? "a server"}.`,
      });
    });
    socket.on("friends:changed", () => {
      void loadFriends();
    });
    socket.on(
      "presence:changed",
      (event: { userId: string; status: PresenceStatus }) => {
        dispatch({ type: "presenceChanged", ...event });
      },
    );
    socket.on(
      "voice:participants",
      (event: { channelId: string; userIds: string[] }) => {
        dispatch({ type: "voiceParticipants", ...event });
      },
    );
    socket.on(
      "typing",
      (event: {
        channelId?: string;
        conversationId?: string;
        userId: string;
      }) => {
        const placeId = event.channelId ?? event.conversationId;
        if (!placeId) return;
        dispatch({
          type: "typingStarted",
          channelId: placeId,
          userId: event.userId,
          until: Date.now() + TYPING_VISIBLE_MS,
        });
        const timer = setTimeout(() => {
          timers.delete(timer);
          dispatch({ type: "typingExpired", now: Date.now() });
        }, TYPING_VISIBLE_MS + 50);
        timers.add(timer);
      },
    );

    return () => {
      timers.forEach(clearTimeout);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    token,
    currentUserId,
    openServer,
    openHome,
    loadMessages,
    loadFriends,
    loadConversations,
  ]);

  // Idle status: report when this tab has seen no input for a while, and
  // again as soon as the user comes back.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let lastArmed = 0;

    const report = (idle: boolean) => {
      if (idleRef.current === idle) return;
      idleRef.current = idle;
      socketRef.current?.emit("presence:activity", { idle });
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => report(true), IDLE_AFTER_MS);
    };
    const onActivity = () => {
      // A hidden tab is not being used, whatever events it receives.
      if (document.visibilityState === "hidden") return;
      report(false);
      // mousemove fires constantly; restarting the timer once a second is enough.
      const now = Date.now();
      if (now - lastArmed > 1000) {
        lastArmed = now;
        arm();
      }
    };

    arm();
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, onActivity, { passive: true });
    }
    return () => {
      clearTimeout(timer);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, onActivity);
      }
    };
  }, []);

  const actions = useMemo(
    () => ({
      selectServer: (serverId: string) => {
        if (stateRef.current.activeServerId !== serverId) {
          void openServer(serverId);
        }
      },

      selectChannel: (channelId: string) => {
        dispatch({ type: "channelSelected", channelId });
        const channel = stateRef.current.server?.channels.find(
          (c) => c.id === channelId,
        );
        if (channel?.type !== "VOICE") {
          void loadMessages({ kind: "channel", id: channelId });
        }
      },

      retryMessages: (place: Place) => {
        void loadMessages(place, true);
      },

      /** Opens the friends and direct-messages view. */
      openHome: () => {
        if (!stateRef.current.home) openHome();
      },

      /** Opens a conversation, or the friends list when given null. */
      selectConversation: (conversationId: string | null) => {
        dispatch({ type: "conversationSelected", conversationId });
        if (conversationId) {
          void loadMessages({ kind: "conversation", id: conversationId });
        }
      },

      /** Opens the conversation with a friend, creating it on first use. */
      startConversation: async (userId: string) => {
        try {
          const conversation = await api.openConversation(token, userId);
          if (!stateRef.current.home) openHome();
          dispatch({ type: "conversationOpened", conversation });
          void loadMessages({ kind: "conversation", id: conversation.id });
        } catch (error) {
          showError(error);
        }
      },

      /** Resolves with the error to show, or whether it was accepted at once. */
      sendFriendRequest: async (
        username: string,
      ): Promise<{ error: string } | { accepted: boolean }> => {
        try {
          const result = await api.sendFriendRequest(token, username);
          void loadFriends();
          return result;
        } catch (error) {
          return { error: describe(error) };
        }
      },

      acceptFriendRequest: async (friendshipId: string) => {
        try {
          await api.acceptFriendRequest(token, friendshipId);
        } catch (error) {
          showError(error);
        }
        void loadFriends();
      },

      /** Also declines an incoming request and cancels an outgoing one. */
      removeFriend: async (friendshipId: string) => {
        try {
          await api.removeFriend(token, friendshipId);
        } catch (error) {
          showError(error);
        }
        void loadFriends();
      },

      setMemberRole: async (
        serverId: string,
        memberId: string,
        role: "ADMIN" | "MEMBER",
      ) => {
        try {
          const member = await api.setMemberRole(
            token,
            serverId,
            memberId,
            role,
          );
          dispatch({ type: "memberUpdated", serverId, member });
        } catch (error) {
          showError(error);
        }
      },

      kickMember: async (serverId: string, memberId: string) => {
        try {
          await api.kickMember(token, serverId, memberId);
          // The "member:left" event updates the list for everyone.
        } catch (error) {
          showError(error);
        }
      },

      /** Returns an error message, or null on success. */
      createServer: async (name: string): Promise<string | null> => {
        try {
          const details = await api.createServer(token, name);
          dispatch({ type: "serverSelected", serverId: details.id });
          remember(details.id);
          const channelId = pickChannel(details, null);
          dispatch({ type: "serverLoaded", details, channelId });
          if (channelId) void loadMessages({ kind: "channel", id: channelId });
          return null;
        } catch (error) {
          return describe(error);
        }
      },

      joinServer: async (inviteCode: string): Promise<string | null> => {
        try {
          const details = await api.joinServer(token, inviteCode);
          dispatch({ type: "serverSelected", serverId: details.id });
          remember(details.id);
          const channelId = pickChannel(details, null);
          dispatch({ type: "serverLoaded", details, channelId });
          if (channelId) void loadMessages({ kind: "channel", id: channelId });
          return null;
        } catch (error) {
          return describe(error);
        }
      },

      leaveServer: async (serverId: string) => {
        try {
          await api.leaveServer(token, serverId);
          dispatch({ type: "serverRemoved", serverId });
          remember(null);
        } catch (error) {
          showError(error);
        }
      },

      deleteServer: async (serverId: string) => {
        try {
          await api.deleteServer(token, serverId);
          dispatch({ type: "serverRemoved", serverId });
          remember(null);
        } catch (error) {
          showError(error);
        }
      },

      createChannel: async (
        serverId: string,
        name: string,
        type: ChannelType,
      ): Promise<string | null> => {
        try {
          const channel = await api.createChannel(token, serverId, name, type);
          dispatch({ type: "channelCreated", channel });
          dispatch({ type: "channelSelected", channelId: channel.id });
          if (channel.type === "TEXT") {
            void loadMessages({ kind: "channel", id: channel.id });
          }
          return null;
        } catch (error) {
          return describe(error);
        }
      },

      deleteChannel: async (channelId: string) => {
        try {
          await api.deleteChannel(token, channelId);
          // The "channel:deleted" event updates the list for everyone.
        } catch (error) {
          showError(error);
        }
      },

      /** Returns true when the message was sent. */
      sendMessage: async (place: Place, content: string): Promise<boolean> => {
        try {
          const message = await api.sendMessage(token, place, content);
          dispatch({
            type: "messageReceived",
            serverId:
              place.kind === "channel"
                ? (stateRef.current.server?.id ?? null)
                : null,
            message,
            currentUserId,
          });
          return true;
        } catch (error) {
          showError(error);
          return false;
        }
      },

      /** Returns true when the message was changed. */
      editMessage: async (
        messageId: string,
        content: string,
      ): Promise<boolean> => {
        try {
          const message = await api.editMessage(token, messageId, content);
          dispatch({ type: "messageUpdated", message });
          return true;
        } catch (error) {
          showError(error);
          return false;
        }
      },

      deleteMessage: async (placeId: string, messageId: string) => {
        try {
          await api.deleteMessage(token, messageId);
          dispatch({ type: "messageDeleted", placeId, messageId });
        } catch (error) {
          showError(error);
        }
      },

      loadOlder: async (place: Place) => {
        const channelId = place.id;
        const entry = stateRef.current.messages[channelId];
        if (!entry?.nextCursor || entry.loadingOlder) return;
        dispatch({ type: "olderLoading", channelId });
        try {
          const page = await api.listMessages(token, place, entry.nextCursor);
          dispatch({ type: "olderLoaded", channelId, page });
        } catch (error) {
          dispatch({ type: "olderLoaded", channelId, page: null });
          showError(error);
        }
      },

      /** Tells the server which voice channel this tab is sitting in. */
      announceVoice: (channelId: string | null) => {
        socketRef.current?.emit(
          channelId ? "voice:join" : "voice:leave",
          channelId ? { channelId } : {},
        );
      },

      /** Tells the others the user is typing, at most every 2 seconds. */
      notifyTyping: (place: Place) => {
        const now = Date.now();
        const last = lastTypingSentRef.current;
        if (
          last.placeId === place.id &&
          now - last.at < TYPING_SEND_INTERVAL_MS
        ) {
          return;
        }
        lastTypingSentRef.current = { placeId: place.id, at: now };
        socketRef.current?.emit(
          "typing",
          place.kind === "channel"
            ? { channelId: place.id }
            : { conversationId: place.id },
        );
      },

      /** Shows a message in the error banner. */
      showMessage: (message: string) =>
        dispatch({ type: "errorShown", message }),

      dismissError: () => dispatch({ type: "errorDismissed" }),
    }),
    [
      token,
      currentUserId,
      openServer,
      openHome,
      loadMessages,
      loadFriends,
      showError,
    ],
  );

  return { state, actions };
}

export type ChatActions = ReturnType<typeof useChat>["actions"];
