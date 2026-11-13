"use client";

import { useState } from "react";
import type { Channel, Member, ServerDetails, User } from "@/lib/types";
import type { VoiceState } from "@/lib/use-voice";
import { Avatar } from "./avatar";
import { VoiceBar } from "./voice-bar";

interface ChannelRowProps {
  channel: Channel;
  active: boolean;
  unread: boolean;
  canManage: boolean;
  deletable: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function ChannelRow({
  channel,
  active,
  unread,
  canManage,
  deletable,
  onSelect,
  onDelete,
}: ChannelRowProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
          active
            ? "bg-white/10 text-white"
            : unread
              ? "font-semibold text-white hover:bg-white/5"
              : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
        }`}
      >
        <span className="text-gray-500">
          {channel.type === "VOICE" ? "🔊" : "#"}
        </span>
        <span className="flex-1 truncate">{channel.name}</span>
        {unread && (
          <span
            aria-label="Unread messages"
            className="h-2 w-2 rounded-full bg-rose-500"
          />
        )}
      </button>
      {canManage && deletable && (
        <button
          type="button"
          onClick={onDelete}
          title={`Delete ${channel.name}`}
          aria-label={`Delete ${channel.name}`}
          className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded bg-[#11141b] px-1.5 text-gray-400 hover:text-red-400 group-hover:block"
        >
          ×
        </button>
      )}
    </div>
  );
}

function VoiceOccupants({
  userIds,
  members,
  speaking,
}: {
  userIds: string[];
  members: Member[];
  speaking: Set<string>;
}) {
  if (userIds.length === 0) {
    return null;
  }
  return (
    <ul className="mb-1 ml-6 space-y-0.5">
      {userIds.map((userId) => {
        const member = members.find((m) => m.user.id === userId);
        return (
          <li key={userId} className="flex items-center gap-2 px-2 py-0.5">
            <span
              className={`rounded-full ring-2 ${
                speaking.has(userId) ? "ring-emerald-500" : "ring-transparent"
              }`}
            >
              <Avatar
                id={userId}
                name={member?.user.displayName ?? "Someone"}
                size="sm"
              />
            </span>
            <span className="truncate text-xs text-gray-400">
              {member?.user.displayName ?? "Someone"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ChannelSidebar({
  server,
  user,
  activeChannelId,
  unreadChannels,
  voiceParticipants,
  voiceEnabled,
  voice,
  canManage,
  isOwner,
  onSelectChannel,
  onCreateChannel,
  onDeleteChannel,
  onLeave,
  onDelete,
  onLogout,
  onLeaveVoice,
  onToggleMute,
}: {
  server: ServerDetails | null;
  user: User;
  activeChannelId: string | null;
  unreadChannels: Record<string, true>;
  voiceParticipants: Record<string, string[]>;
  voiceEnabled: boolean;
  voice: VoiceState;
  canManage: boolean;
  isOwner: boolean;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: () => void;
  onDeleteChannel: (channelId: string, name: string) => void;
  onLeave: () => void;
  onDelete: () => void;
  onLogout: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyInvite(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied: the code is still visible to copy by hand.
    }
  }

  const textChannels = server?.channels.filter((c) => c.type === "TEXT") ?? [];
  const voiceChannels = server?.channels.filter((c) => c.type === "VOICE") ?? [];
  const textCount = textChannels.length;
  const connectedChannel = server?.channels.find(
    (channel) => channel.id === voice.channelId,
  );

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-[#11141b]">
      {server ? (
        <>
          <header className="border-b border-white/10 px-4 py-3">
            <h1 className="truncate font-semibold" title={server.name}>
              {server.name}
            </h1>
            <button
              type="button"
              onClick={() => copyInvite(server.inviteCode)}
              title="Copy invite code"
              className="mt-1 flex items-center gap-1.5 text-xs text-gray-400 hover:text-white"
            >
              <span>Invite:</span>
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono">
                {server.inviteCode}
              </code>
              <span className="text-indigo-400">
                {copied ? "Copied!" : "Copy"}
              </span>
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-2 py-3">
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Channels
              </span>
              {canManage && (
                <button
                  type="button"
                  onClick={onCreateChannel}
                  title="Create channel"
                  aria-label="Create channel"
                  className="rounded px-1.5 text-lg leading-none text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  +
                </button>
              )}
            </div>

            <div className="space-y-0.5">
              {textChannels.map((channel) => (
                <ChannelRow
                  key={channel.id}
                  channel={channel}
                  active={channel.id === activeChannelId}
                  unread={
                    Boolean(unreadChannels[channel.id]) &&
                    channel.id !== activeChannelId
                  }
                  canManage={canManage}
                  deletable={textCount > 1}
                  onSelect={() => onSelectChannel(channel.id)}
                  onDelete={() => onDeleteChannel(channel.id, channel.name)}
                />
              ))}
            </div>

            {voiceChannels.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Voice channels
                </p>
                <div className="space-y-0.5">
                  {voiceChannels.map((channel) => (
                    <div key={channel.id}>
                      <ChannelRow
                        channel={channel}
                        active={channel.id === activeChannelId}
                        unread={false}
                        canManage={canManage}
                        deletable
                        onSelect={() => onSelectChannel(channel.id)}
                        onDelete={() =>
                          onDeleteChannel(channel.id, channel.name)
                        }
                      />
                      <VoiceOccupants
                        userIds={voiceParticipants[channel.id] ?? []}
                        members={server.members}
                        speaking={
                          voice.channelId === channel.id
                            ? voice.speaking
                            : new Set()
                        }
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {voiceChannels.length === 0 && canManage && voiceEnabled && (
              <p className="px-2 pt-4 text-xs text-gray-500">
                Add a voice channel with + to talk here.
              </p>
            )}
          </div>

          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={isOwner ? onDelete : onLeave}
              className="w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-500 hover:bg-red-500/10 hover:text-red-300"
            >
              {isOwner ? "Delete server" : "Leave server"}
            </button>
          </div>
        </>
      ) : (
        <div className="flex-1" />
      )}

      {voice.status === "connected" && connectedChannel && (
        <VoiceBar
          channelName={connectedChannel.name}
          voice={voice}
          onLeave={onLeaveVoice}
          onToggleMute={onToggleMute}
        />
      )}

      <footer className="flex items-center gap-2.5 border-t border-white/10 bg-black/20 px-3 py-2.5">
        <Avatar id={user.id} name={user.displayName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.displayName}</p>
          <p className="truncate text-xs text-gray-500">@{user.username}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Sign out"
          className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-white/10 hover:text-white"
        >
          Sign out
        </button>
      </footer>
    </aside>
  );
}
