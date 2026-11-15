"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { ChannelType, Place, User } from "@/lib/types";
import { useChat } from "@/lib/use-chat";
import { useVoice } from "@/lib/use-voice";
import { SLOW_HINT, useSlowHint } from "@/lib/use-slow-hint";
import { ChannelSidebar } from "./channel-sidebar";
import { FriendsPane } from "./friends-pane";
import { HomeSidebar } from "./home-sidebar";
import { MemberList, type MemberActions } from "./member-list";
import { MessagePane } from "./message-pane";
import { PromptModal } from "./modal";
import { ServerRail } from "./server-rail";
import { VoicePane } from "./voice-pane";

type Dialog = "create-server" | "join-server" | "create-channel" | null;

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-screen items-center justify-center bg-[#0b0d12] text-sm text-gray-400">
      {children}
    </main>
  );
}

function LoadingScreen({ label }: { label: string }) {
  const slow = useSlowHint(true);
  return (
    <FullScreenMessage>
      <span className="text-center">
        {label}
        {slow && <span className="mt-2 block text-xs">{SLOW_HINT}</span>}
      </span>
    </FullScreenMessage>
  );
}

/** Entry point of /app: requires a signed-in user. */
export function ChatApp() {
  const { state, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "signed-out") router.replace("/login");
  }, [state.status, router]);

  if (state.status !== "signed-in") {
    return <LoadingScreen label="Loading…" />;
  }
  return <Chat token={state.token} user={state.user} onLogout={logout} />;
}

function Chat({
  token,
  user,
  onLogout,
}: {
  token: string;
  user: User;
  onLogout: () => void;
}) {
  const { state, actions } = useChat(token, user.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const closeDialog = () => setDialog(null);

  // The gateway tracks who is in a voice channel, so tell it when that changes.
  const { announceVoice } = actions;
  const onVoiceChange = useCallback(
    (channelId: string | null) => announceVoice(channelId),
    [announceVoice],
  );
  const voice = useVoice(token, onVoiceChange);
  const { audioRef } = voice;
  // Remembered so the call stays visible, and can be ended, from any view.
  const [voiceChannel, setVoiceChannel] = useState<{
    name: string;
    serverId: string;
  } | null>(null);

  const { server } = state;
  const channel =
    server?.channels.find((c) => c.id === state.activeChannelId) ?? null;
  const myRole = server?.members.find((m) => m.user.id === user.id)?.role;
  const canManage = myRole === "OWNER" || myRole === "ADMIN";

  const conversation =
    state.conversations?.find((c) => c.id === state.activeConversationId) ??
    null;
  const place: Place | null = state.home
    ? conversation && { kind: "conversation", id: conversation.id }
    : channel && { kind: "channel", id: channel.id };

  const typingNames = place
    ? Object.keys(state.typing[place.id] ?? {})
        .filter((userId) => userId !== user.id)
        .map((userId) =>
          place.kind === "conversation"
            ? (conversation?.user.displayName ?? "Someone")
            : (server?.members.find((m) => m.user.id === userId)?.user
                .displayName ?? "Someone"),
        )
    : [];

  // People the user is friends with, or has a request pending with.
  const { friends } = state;
  const knownUserIds = useMemo(
    () =>
      new Set(
        friends
          ? [...friends.friends, ...friends.incoming, ...friends.outgoing].map(
              (entry) => entry.user.id,
            )
          : [],
      ),
    [friends],
  );
  const homeUnread =
    Object.keys(state.unreadConversations).length > 0 ||
    (friends?.incoming.length ?? 0) > 0;

  // Leave the call if its server is gone: deleted, or the user was removed.
  const { servers } = state;
  const { leave: leaveVoice, state: voiceState } = voice;
  useEffect(() => {
    if (
      voiceState.status !== "idle" &&
      voiceChannel &&
      servers &&
      !servers.some((s) => s.id === voiceChannel.serverId)
    ) {
      leaveVoice();
    }
  }, [voiceState.status, voiceChannel, servers, leaveVoice]);

  const memberActions: MemberActions = {
    onSetRole: (member, role) => {
      if (server) void actions.setMemberRole(server.id, member.id, role);
    },
    onKick: (member) => {
      if (
        server &&
        window.confirm(
          `Remove ${member.user.displayName} from ${server.name}? They can join again with an invite code.`,
        )
      ) {
        void actions.kickMember(server.id, member.id);
      }
    },
    onAddFriend: (member) => {
      void actions.sendFriendRequest(member.user.username).then((result) => {
        if ("error" in result) actions.showMessage(result.error);
      });
    },
  };
  const sidebarVoice = {
    voice: voice.state,
    voiceChannelName: voiceChannel?.name ?? null,
    onLeaveVoice: voice.leave,
    onToggleMute: () => void voice.toggleMute(),
  };

  if (state.servers === null) {
    return state.error ? (
      <FullScreenMessage>
        <span className="text-red-300">{state.error}</span>
      </FullScreenMessage>
    ) : (
      <LoadingScreen label="Loading your servers…" />
    );
  }

  return (
    <main className="flex h-screen overflow-hidden bg-[#0b0d12] text-white">
      <ServerRail
        servers={state.servers}
        activeServerId={state.activeServerId}
        unreadServers={state.unreadServers}
        homeActive={state.home}
        homeUnread={homeUnread}
        onHome={actions.openHome}
        onSelect={actions.selectServer}
        onCreate={() => setDialog("create-server")}
        onJoin={() => setDialog("join-server")}
      />

      {state.home ? (
        <HomeSidebar
          user={user}
          friends={friends}
          conversations={state.conversations}
          activeConversationId={state.activeConversationId}
          unreadConversations={state.unreadConversations}
          onSelect={actions.selectConversation}
          onLogout={onLogout}
          {...sidebarVoice}
        />
      ) : (
        <ChannelSidebar
          server={server}
          user={user}
          activeChannelId={state.activeChannelId}
          unreadChannels={state.unreadChannels}
          voiceParticipants={state.voiceParticipants}
          voiceEnabled={state.voiceEnabled}
          {...sidebarVoice}
          canManage={canManage}
          isOwner={myRole === "OWNER"}
          onSelectChannel={actions.selectChannel}
          onCreateChannel={() => setDialog("create-channel")}
          onDeleteChannel={(channelId, name) => {
            if (window.confirm(`Delete ${name}? Its messages will be lost.`)) {
              if (voice.state.channelId === channelId) {
                voice.leave();
              }
              void actions.deleteChannel(channelId);
            }
          }}
          onLeave={() => {
            if (server && window.confirm(`Leave ${server.name}?`)) {
              voice.leave();
              void actions.leaveServer(server.id);
            }
          }}
          onDelete={() => {
            if (
              server &&
              window.confirm(
                `Delete ${server.name}? All of its channels and messages will be lost.`,
              )
            ) {
              voice.leave();
              void actions.deleteServer(server.id);
            }
          }}
          onLogout={onLogout}
        />
      )}

      {state.home ? (
        conversation ? (
          <MessagePane
            key={conversation.id}
            kind="conversation"
            name={conversation.user.displayName}
            entry={state.messages[conversation.id]}
            typingNames={typingNames}
            connected={state.connected}
            currentUserId={user.id}
            canModerate={false}
            readOnlyReason={
              friends &&
              !friends.friends.some((f) => f.user.id === conversation.user.id)
                ? `You and ${conversation.user.displayName} are no longer friends, so you cannot send messages here.`
                : undefined
            }
            onSend={(content) =>
              actions.sendMessage(
                { kind: "conversation", id: conversation.id },
                content,
              )
            }
            onTyping={() =>
              actions.notifyTyping({
                kind: "conversation",
                id: conversation.id,
              })
            }
            onLoadOlder={() =>
              void actions.loadOlder({
                kind: "conversation",
                id: conversation.id,
              })
            }
            onRetry={() =>
              actions.retryMessages({
                kind: "conversation",
                id: conversation.id,
              })
            }
            onEdit={actions.editMessage}
            onDelete={(messageId) =>
              void actions.deleteMessage(conversation.id, messageId)
            }
          />
        ) : (
          <FriendsPane
            friends={friends}
            onMessage={(userId) => void actions.startConversation(userId)}
            onRequest={actions.sendFriendRequest}
            onAccept={(id) => void actions.acceptFriendRequest(id)}
            onRemove={(id) => void actions.removeFriend(id)}
          />
        )
      ) : server && channel?.type === "VOICE" ? (
        <>
          <VoicePane
            key={channel.id}
            channel={channel}
            members={server.members}
            participantIds={state.voiceParticipants[channel.id] ?? []}
            voice={voice.state}
            currentUserId={user.id}
            onJoin={() => {
              setVoiceChannel({ name: channel.name, serverId: server.id });
              void voice.join(channel.id);
            }}
            onLeave={voice.leave}
            onToggleMute={() => void voice.toggleMute()}
            onToggleCamera={() => void voice.toggleCamera()}
            onToggleScreen={() => void voice.toggleScreen()}
            onUnlockAudio={() => void voice.unlockAudio()}
          />
          <MemberList
            members={server.members}
            currentUserId={user.id}
            knownUserIds={knownUserIds}
            actions={memberActions}
          />
        </>
      ) : server && channel ? (
        <>
          <MessagePane
            key={channel.id}
            kind="channel"
            name={channel.name}
            entry={state.messages[channel.id]}
            typingNames={typingNames}
            connected={state.connected}
            currentUserId={user.id}
            canModerate={canManage}
            onSend={(content) =>
              actions.sendMessage({ kind: "channel", id: channel.id }, content)
            }
            onTyping={() =>
              actions.notifyTyping({ kind: "channel", id: channel.id })
            }
            onLoadOlder={() =>
              void actions.loadOlder({ kind: "channel", id: channel.id })
            }
            onRetry={() =>
              actions.retryMessages({ kind: "channel", id: channel.id })
            }
            onEdit={actions.editMessage}
            onDelete={(messageId) =>
              void actions.deleteMessage(channel.id, messageId)
            }
          />
          <MemberList
            members={server.members}
            currentUserId={user.id}
            knownUserIds={knownUserIds}
            actions={memberActions}
          />
        </>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center bg-[#171a22] px-6 text-center">
          {state.activeServerId ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <>
              <p className="text-2xl font-bold">
                {state.servers.length === 0
                  ? "Welcome to Pulse"
                  : "Pick a server"}
              </p>
              <p className="mt-2 max-w-sm text-sm text-gray-400">
                Create your own server, or join one with an invite code from a
                friend.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setDialog("create-server")}
                  className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold hover:bg-indigo-500"
                >
                  Create a server
                </button>
                <button
                  type="button"
                  onClick={() => setDialog("join-server")}
                  className="rounded-lg border border-white/15 px-5 py-2.5 text-sm font-semibold hover:bg-white/5"
                >
                  Join with a code
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {state.error && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-red-500/30 bg-[#2a1215] px-4 py-2.5 text-sm text-red-200 shadow-xl"
        >
          {state.error}
          <button
            type="button"
            onClick={actions.dismissError}
            aria-label="Dismiss"
            className="text-red-300 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {dialog === "create-server" && (
        <PromptModal
          title="Create a server"
          description="A server is a home for your community. You can invite people after it is created."
          label="Server name"
          placeholder="My community"
          submitLabel="Create"
          maxLength={50}
          onSubmit={actions.createServer}
          onClose={closeDialog}
        />
      )}
      {dialog === "join-server" && (
        <PromptModal
          title="Join a server"
          description="Paste the invite code someone shared with you."
          label="Invite code"
          placeholder="e.g. aB3xY9_k"
          submitLabel="Join"
          maxLength={64}
          onSubmit={actions.joinServer}
          onClose={closeDialog}
        />
      )}
      {dialog === "create-channel" && server && (
        <PromptModal<ChannelType>
          title="Create a channel"
          description={`Add a new channel to ${server.name}.`}
          label="Channel name"
          placeholder="announcements"
          submitLabel="Create"
          maxLength={32}
          choices={
            state.voiceEnabled
              ? [
                  {
                    value: "TEXT",
                    label: "Text",
                    description: "Messages and history",
                  },
                  {
                    value: "VOICE",
                    label: "Voice",
                    description: "Talk in real time",
                  },
                ]
              : undefined
          }
          onSubmit={(name, type) =>
            actions.createChannel(server.id, name, type || "TEXT")
          }
          onClose={closeDialog}
        />
      )}
      {/* Remote voice tracks are attached here. */}
      <div ref={audioRef} className="hidden" aria-hidden />
    </main>
  );
}
