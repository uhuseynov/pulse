"use client";

import type { VoiceState } from "@/lib/use-voice";

/** Stays visible while connected, so voice survives browsing other channels. */
export function VoiceBar({
  channelName,
  voice,
  onLeave,
  onToggleMute,
}: {
  channelName: string;
  voice: VoiceState;
  onLeave: () => void;
  onToggleMute: () => void;
}) {
  return (
    <div className="border-t border-white/10 bg-emerald-500/5 px-3 py-2.5">
      <p className="flex items-center gap-2 text-xs">
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        <span className="font-medium text-emerald-300">Voice connected</span>
      </p>
      <p className="mt-0.5 truncate pl-4 text-xs text-gray-400">
        🔊 {channelName}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={voice.selfMuted}
          className="flex-1 rounded-md bg-white/[0.06] px-2 py-1.5 text-xs font-medium hover:bg-white/10"
        >
          {voice.selfMuted ? "🔇 Unmute" : "🎙️ Mute"}
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="flex-1 rounded-md bg-white/[0.06] px-2 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/15"
        >
          Leave
        </button>
      </div>
    </div>
  );
}
