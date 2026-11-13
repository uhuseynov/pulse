"use client";

import type { Channel, Member } from "@/lib/types";
import { videoKey, type VoiceState } from "@/lib/use-voice";
import { Avatar } from "./avatar";
import { VideoTile } from "./video-tile";

function ParticipantTile({
  member,
  voice,
  connectedHere,
  isSelf,
}: {
  member: Member;
  voice: VoiceState;
  connectedHere: boolean;
  isSelf: boolean;
}) {
  const userId = member.user.id;
  const speaking = voice.speaking.has(userId);
  const muted = connectedHere && voice.muted.has(userId);
  const camera = connectedHere
    ? voice.videoTracks.get(videoKey(userId, "camera"))
    : undefined;

  return (
    <li
      className={`relative flex aspect-video flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border transition ${
        speaking
          ? "border-emerald-500/70 bg-emerald-500/5"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      {camera ? (
        <VideoTile
          track={camera}
          label={`${member.user.displayName}'s camera`}
          mirrored={isSelf}
        />
      ) : (
        <span
          className={`rounded-full ring-2 transition ${
            speaking ? "ring-emerald-500" : "ring-transparent"
          }`}
        >
          <Avatar id={userId} name={member.user.displayName} />
        </span>
      )}
      <span
        className={`flex items-center gap-1.5 text-sm font-medium ${
          camera
            ? "absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1"
            : ""
        }`}
      >
        {member.user.displayName}
        {isSelf && <span className="text-xs text-gray-400">(you)</span>}
        {muted && (
          <span aria-label="Microphone off" title="Microphone off">
            🔇
          </span>
        )}
      </span>
    </li>
  );
}

function ControlButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl px-5 py-3 text-sm font-semibold transition ${
        active
          ? "bg-indigo-600 hover:bg-indigo-500"
          : "bg-white/[0.06] hover:bg-white/10"
      }`}
    >
      {children}
    </button>
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
  onToggleCamera,
  onToggleScreen,
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
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onUnlockAudio: () => void;
}) {
  const here = participantIds
    .map((id) => members.find((member) => member.user.id === id))
    .filter((member): member is Member => member !== undefined);
  const connectedHere = voice.channelId === channel.id;
  const connecting = connectedHere && voice.status === "connecting";
  const connected = connectedHere && voice.status === "connected";

  // Screens being shared, each with the member who shares it.
  const screens = connectedHere
    ? here.flatMap((member) => {
        const track = voice.videoTracks.get(videoKey(member.user.id, "screen"));
        return track ? [{ member, track }] : [];
      })
    : [];
  // Phones and some browsers cannot capture the screen.
  const canShareScreen =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function";

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#171a22]">
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="text-lg text-gray-500">🔊</span>
        <h2 className="truncate font-semibold">{channel.name}</h2>
        <span className="ml-auto text-xs text-gray-500">
          {here.length === 0 ? "Nobody here yet" : `${here.length} connected`}
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
          <>
            {screens.map(({ member, track }) => (
              <figure
                key={member.id}
                className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black"
              >
                <div className="aspect-video max-h-[60vh] w-full">
                  <VideoTile
                    track={track}
                    label={`${member.user.displayName}'s screen`}
                    fit="contain"
                  />
                </div>
                <figcaption className="bg-white/[0.03] px-3 py-2 text-xs text-gray-400">
                  🖥️ {member.user.displayName}
                  {member.user.id === currentUserId
                    ? " (you) are sharing your screen"
                    : " is sharing their screen"}
                </figcaption>
              </figure>
            ))}
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {here.map((member) => (
                <ParticipantTile
                  key={member.id}
                  member={member}
                  voice={voice}
                  connectedHere={connectedHere}
                  isSelf={member.user.id === currentUserId}
                />
              ))}
            </ul>
          </>
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

        <div className="flex flex-wrap justify-center gap-3">
          {connected ? (
            <>
              <ControlButton active={voice.selfMuted} onClick={onToggleMute}>
                {voice.selfMuted ? "🔇 Unmute" : "🎙️ Mute"}
              </ControlButton>
              <ControlButton active={voice.cameraOn} onClick={onToggleCamera}>
                {voice.cameraOn ? "📹 Stop camera" : "📹 Camera"}
              </ControlButton>
              {canShareScreen && (
                <ControlButton active={voice.screenOn} onClick={onToggleScreen}>
                  {voice.screenOn ? "🖥️ Stop sharing" : "🖥️ Share screen"}
                </ControlButton>
              )}
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
