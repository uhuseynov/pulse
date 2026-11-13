"use client";

import type { Channel, Member } from "@/lib/types";
import type { VoiceState } from "@/lib/use-voice";
import { Avatar } from "./avatar";

function ParticipantTile({
  member,
  speaking,
  muted,
  isSelf,
}: {
  member: Member;
  speaking: boolean;
  muted: boolean;
  isSelf: boolean;
}) {
  return (
    <li
      className={`flex flex-col items-center gap-3 rounded-2xl border p-6 transition ${
        speaking
          ? "border-emerald-500/70 bg-emerald-500/5"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <span
        className={`rounded-full ring-2 transition ${
          speaking ? "ring-emerald-500" : "ring-transparent"
        }`}
      >
        <Avatar id={member.user.id} name={member.user.displayName} />
      </span>
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {member.user.displayName}
        {isSelf && <span className="text-xs text-gray-500">(you)</span>}
        {muted && (
          <span aria-label="Microphone off" title="Microphone off">
            🔇
          </span>
        )}
      </span>
    </li>
  );
}

export function VoicePane({
  channel,
  members,
  participantIds,
  voice,
  currentUserId,
  onJoin,
  onLeave,
  onToggleMute,
  onUnlockAudio,
}: {
  channel: Channel;
  members: Member[];
  participantIds: string[];
  voice: VoiceState;
  currentUserId: string;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onUnlockAudio: () => void;
}) {
  const here = participantIds
    .map((id) => members.find((member) => member.user.id === id))
    .filter((member): member is Member => member !== undefined);
  const connectedHere = voice.channelId === channel.id;
  const connecting = connectedHere && voice.status === "connecting";

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#171a22]">
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="text-lg text-gray-500">🔊</span>
        <h2 className="truncate font-semibold">{channel.name}</h2>
        <span className="ml-auto text-xs text-gray-500">
          {here.length === 0
            ? "Nobody here yet"
            : `${here.length} connected`}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {here.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-2xl font-bold">No one is in {channel.name}</p>
            <p className="mt-2 max-w-sm text-sm text-gray-400">
              Join the channel and others will see that you are here.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {here.map((member) => (
              <ParticipantTile
                key={member.id}
                member={member}
                speaking={voice.speaking.has(member.user.id)}
                muted={
                  connectedHere
                    ? voice.muted.has(member.user.id)
                    : false
                }
                isSelf={member.user.id === currentUserId}
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-white/10 px-4 py-4">
        {voice.error && (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300"
          >
            {voice.error}
          </p>
        )}
        {connectedHere && voice.needsAudioUnlock && (
          <button
            type="button"
            onClick={onUnlockAudio}
            className="mb-3 w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200 hover:bg-amber-500/20"
          >
            Your browser is holding back audio. Click to enable sound.
          </button>
        )}

        <div className="flex justify-center gap-3">
          {connectedHere && voice.status === "connected" ? (
            <>
              <button
                type="button"
                onClick={onToggleMute}
                aria-pressed={voice.selfMuted}
                className={`rounded-xl px-6 py-3 text-sm font-semibold transition ${
                  voice.selfMuted
                    ? "bg-white/10 hover:bg-white/15"
                    : "bg-white/[0.06] hover:bg-white/10"
                }`}
              >
                {voice.selfMuted ? "🔇 Unmute" : "🎙️ Mute"}
              </button>
              <button
                type="button"
                onClick={onLeave}
                className="rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold transition hover:bg-red-500"
              >
                Leave
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onJoin}
              disabled={connecting}
              className="rounded-xl bg-emerald-600 px-8 py-3 text-sm font-semibold transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {connecting ? "Connecting…" : "Join voice"}
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
