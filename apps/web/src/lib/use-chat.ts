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
import type { Channel, Member, Message } from "./types";

const TYPING_VISIBLE_MS = 3500;
const TYPING_SEND_INTERVAL_MS = 2000;
const LAST_SERVER_KEY = "pulse.lastServer";

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
  const lastTypingSentRef = useRef(0);

  const showError = useCallback((error: unknown) => {
    dispatch({ type: "errorShown", message: describe(error) });
  }, []);

  const loadMessages = useCallback(
    async (channelId: string, force = false) => {
      if (!force && stateRef.current.messages[channelId]) return;
      dispatch({ type: "messagesLoading", channelId });
      try {
        const page = await api.listMessages(token, channelId);
        dispatch({ type: "messagesLoaded", channelId, page });
      } catch {
        dispatch({ type: "messagesFailed", channelId });
      }
    },
    [token],
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
        if (channelId) await loadMessages(channelId, options.force);
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
        const servers = await api.listServers(token);
        if (cancelled) return;
        dispatch({ type: "serversLoaded", servers });
        const last = recall();
        const first = servers.find((s) => s.id === last) ?? servers[0];
        if (first) await openServer(first.id);
      } catch (error) {
        if (!cancelled) showError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, openServer, showError]);

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
        const { activeServerId } = stateRef.current;
        if (activeServerId) void openServer(activeServerId, { force: true });
        void api.listServers(token).then(
          (servers) => dispatch({ type: "serversLoaded", servers }),
          () => undefined,
        );
      }
      hasConnectedBefore = true;
    });
    socket.on("disconnect", () => {
      dispatch({ type: "connectionChanged", connected: false });
    });

    socket.on(
      "message:created",
      (event: { serverId: string; message: Message }) => {
        dispatch({ type: "messageReceived", ...event, currentUserId });
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
        if (wasActive && fallback) void loadMessages(fallback.id);
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
    socket.on("server:deleted", (event: { serverId: string }) => {
      dispatch({ type: "serverRemoved", serverId: event.serverId });
    });
    socket.on(
      "presence:changed",
      (event: { userId: string; online: boolean }) => {
        dispatch({ type: "presenceChanged", ...event });
      },
    );
    socket.on("typing", (event: { channelId: string; userId: string }) => {
      dispatch({
        type: "typingStarted",
        ...event,
        until: Date.now() + TYPING_VISIBLE_MS,
      });
      const timer = setTimeout(() => {
        timers.delete(timer);
        dispatch({ type: "typingExpired", now: Date.now() });
      }, TYPING_VISIBLE_MS + 50);
      timers.add(timer);
    });

    return () => {
      timers.forEach(clearTimeout);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, currentUserId, openServer, loadMessages]);

  const actions = useMemo(
    () => ({
      selectServer: (serverId: string) => {
        if (stateRef.current.activeServerId !== serverId) {
          void openServer(serverId);
        }
      },

      selectChannel: (channelId: string) => {
        dispatch({ type: "channelSelected", channelId });
        void loadMessages(channelId);
      },

      retryMessages: (channelId: string) => {
        void loadMessages(channelId, true);
      },

      /** Returns an error message, or null on success. */
      createServer: async (name: string): Promise<string | null> => {
        try {
          const details = await api.createServer(token, name);
          dispatch({ type: "serverSelected", serverId: details.id });
          remember(details.id);
          const channelId = pickChannel(details, null);
          dispatch({ type: "serverLoaded", details, channelId });
          if (channelId) void loadMessages(channelId);
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
          if (channelId) void loadMessages(channelId);
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
      ): Promise<string | null> => {
        try {
          const channel = await api.createChannel(token, serverId, name);
          dispatch({ type: "channelCreated", channel });
          dispatch({ type: "channelSelected", channelId: channel.id });
          void loadMessages(channel.id);
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
      sendMessage: async (
        channelId: string,
        content: string,
      ): Promise<boolean> => {
        try {
          const message = await api.sendMessage(token, channelId, content);
          const serverId = stateRef.current.server?.id;
          if (serverId) {
            dispatch({
              type: "messageReceived",
              serverId,
              message,
              currentUserId,
            });
          }
          return true;
        } catch (error) {
          showError(error);
          return false;
        }
      },

      loadOlder: async (channelId: string) => {
        const entry = stateRef.current.messages[channelId];
        if (!entry?.nextCursor || entry.loadingOlder) return;
        dispatch({ type: "olderLoading", channelId });
        try {
          const page = await api.listMessages(
            token,
            channelId,
            entry.nextCursor,
          );
          dispatch({ type: "olderLoaded", channelId, page });
        } catch (error) {
          dispatch({ type: "olderLoaded", channelId, page: null });
          showError(error);
        }
      },

      /** Tells other members the user is typing, at most every 2 seconds. */
      notifyTyping: (channelId: string) => {
        const now = Date.now();
        if (now - lastTypingSentRef.current < TYPING_SEND_INTERVAL_MS) return;
        lastTypingSentRef.current = now;
        socketRef.current?.emit("typing", { channelId });
      },

      dismissError: () => dispatch({ type: "errorDismissed" }),
    }),
    [token, currentUserId, openServer, loadMessages, showError],
  );

  return { state, actions };
}

export type ChatActions = ReturnType<typeof useChat>["actions"];
