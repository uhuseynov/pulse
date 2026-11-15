"use client";

import type { Conversation, FriendsOverview, User } from "@/lib/types";
import type { VoiceState } from "@/lib/use-voice";
import { Avatar } from "./avatar";
import { SidebarFooter } from "./sidebar-footer";

/** Sidebar of the home view: the friends page and every conversation. */
export function HomeSidebar({
  user,
  friends,
  conversations,
  activeConversationId,
  unreadConversations,
  voice,
  voiceChannelName,
  onSelect,
  onLeaveVoice,
  onToggleMute,
  onLogout,
}: {
  user: User;
  friends: FriendsOverview | null;
  conversations: Conversation[] | null;
  activeConversationId: string | null;
  unreadConversations: Record<string, true>;
  voice: VoiceState;
  voiceChannelName: string | null;
  /** Null opens the friends page. */
  onSelect: (conversationId: string | null) => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onLogout: () => void;
}) {
  const pending = friends?.incoming.length ?? 0;
  const friendsActive = activeConversationId === null;

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-[#11141b]">
      <header className="border-b border-white/10 px-4 py-3">
        <h1 className="font-semibold">Home</h1>
        <p className="mt-1 text-xs text-gray-400">Friends and messages</p>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-current={friendsActive ? "true" : undefined}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
            friendsActive
              ? "bg-white/10 text-white"
              : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
          }`}
        >
          <span className="flex-1 font-medium">Friends</span>
          {pending > 0 && (
            <span
              aria-label={`${pending} pending friend requests`}
              className="rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white"
            >
              {pending}
            </span>
          )}
        </button>

        <p className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Direct messages
        </p>
        {conversations?.length === 0 && (
          <p className="px-2 text-xs text-gray-500">
            Message a friend to start a conversation.
          </p>
        )}
        <div className="space-y-0.5">
          {conversations?.map((conversation) => {
            const active = conversation.id === activeConversationId;
            const unread = Boolean(unreadConversations[conversation.id]);
            const friend = friends?.friends.find(
              (f) => f.user.id === conversation.user.id,
            );
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                aria-current={active ? "true" : undefined}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm ${
                  active
                    ? "bg-white/10 text-white"
                    : unread
                      ? "font-semibold text-white hover:bg-white/5"
                      : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                }`}
              >
                <Avatar
                  id={conversation.user.id}
                  name={conversation.user.displayName}
                  status={friend?.status}
                  size="sm"
                />
                <span className="flex-1 truncate">
                  {conversation.user.displayName}
                </span>
                {unread && !active && (
                  <span
                    aria-label="Unread messages"
                    className="h-2 w-2 rounded-full bg-rose-500"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <SidebarFooter
        user={user}
        voice={voice}
        voiceChannelName={voiceChannelName}
        onLeaveVoice={onLeaveVoice}
        onToggleMute={onToggleMute}
        onLogout={onLogout}
      />
    </aside>
  );
}
