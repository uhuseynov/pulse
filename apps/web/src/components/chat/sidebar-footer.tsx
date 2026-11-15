import type { User } from "@/lib/types";
import type { VoiceState } from "@/lib/use-voice";
import { Avatar } from "./avatar";
import { VoiceBar } from "./voice-bar";

/** Bottom of every sidebar: the ongoing call, if any, and the signed-in user. */
export function SidebarFooter({
  user,
  voice,
  voiceChannelName,
  onLeaveVoice,
  onToggleMute,
  onLogout,
}: {
  user: User;
  voice: VoiceState;
  /** Name of the voice channel the user is connected to. */
  voiceChannelName: string | null;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      {voice.status === "connected" && voiceChannelName && (
        <VoiceBar
          channelName={voiceChannelName}
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
    </>
  );
}
