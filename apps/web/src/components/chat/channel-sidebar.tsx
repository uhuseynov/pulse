"use client";

import { useState } from "react";
import type { ServerDetails, User } from "@/lib/types";
import { Avatar } from "./avatar";

export function ChannelSidebar({
  server,
  user,
  activeChannelId,
  unreadChannels,
  canManage,
  isOwner,
  onSelectChannel,
  onCreateChannel,
  onDeleteChannel,
  onLeave,
  onDelete,
  onLogout,
}: {
  server: ServerDetails | null;
  user: User;
  activeChannelId: string | null;
  unreadChannels: Record<string, true>;
  canManage: boolean;
  isOwner: boolean;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: () => void;
  onDeleteChannel: (channelId: string, name: string) => void;
  onLeave: () => void;
  onDelete: () => void;
  onLogout: () => void;
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
                Text channels
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

            <ul className="space-y-0.5">
              {server.channels.map((channel) => {
                const active = channel.id === activeChannelId;
                const unread = unreadChannels[channel.id] && !active;
                return (
                  <li key={channel.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelectChannel(channel.id)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                        active
                          ? "bg-white/10 text-white"
                          : unread
                            ? "font-semibold text-white hover:bg-white/5"
                            : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                      }`}
                    >
                      <span className="text-gray-500">#</span>
                      <span className="flex-1 truncate">{channel.name}</span>
                      {unread && (
                        <span
                          aria-label="Unread messages"
                          className="h-2 w-2 rounded-full bg-rose-500"
                        />
                      )}
                    </button>
                    {canManage && server.channels.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          onDeleteChannel(channel.id, channel.name)
                        }
                        title={`Delete #${channel.name}`}
                        aria-label={`Delete #${channel.name}`}
                        className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded bg-[#11141b] px-1.5 text-gray-400 hover:text-red-400 group-hover:block"
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
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
