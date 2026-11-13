"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from "livekit-client";
import { api, ApiError } from "./api";

export type VoiceStatus = "idle" | "connecting" | "connected";

export interface VoiceState {
  /** The voice channel the user is connected to, or trying to connect to. */
  channelId: string | null;
  status: VoiceStatus;
  /** User ids heard speaking right now. */
  speaking: Set<string>;
  /** User ids whose microphone is off. */
  muted: Set<string>;
  selfMuted: boolean;
  /** True when the browser is holding back audio until the user interacts. */
  needsAudioUnlock: boolean;
  error: string | null;
}

const INITIAL: VoiceState = {
  channelId: null,
  status: "idle",
  speaking: new Set(),
  muted: new Set(),
  selfMuted: false,
  needsAudioUnlock: false,
  error: null,
};

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    // The names the browser uses when microphone access cannot be granted.
    if (error.name === "NotAllowedError") {
      return "Microphone access was blocked. Allow it in your browser and try again.";
    }
    if (error.name === "NotFoundError") {
      return "No microphone was found.";
    }
    if (error.name === "NotReadableError") {
      return "Your microphone is already in use by another app.";
    }
  }
  if (
    error instanceof Error &&
    /401|unauthori[sz]ed|invalid token/i.test(error.message)
  ) {
    return "The voice server rejected the connection. Its keys may be set up incorrectly.";
  }
  if (error instanceof Error && error.message) {
    return `Could not join the voice channel: ${error.message}`;
  }
  return "Could not join the voice channel. Please try again.";
}

/**
 * Connects to one LiveKit room at a time. Audio elements are attached to
 * `audioRef`, which must be rendered for remote participants to be heard.
 */
export function useVoice(
  authToken: string,
  onConnectedChange: (channelId: string | null) => void,
) {
  const [state, setState] = useState<VoiceState>(INITIAL);
  const audioRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  /** Guards against a slow connect finishing after the user left again. */
  const attemptRef = useRef(0);

  // Callbacks must not re-create the effects below when the parent re-renders.
  const notifyRef = useRef(onConnectedChange);
  useEffect(() => {
    notifyRef.current = onConnectedChange;
  }, [onConnectedChange]);

  const teardown = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      void room.disconnect();
    }
    if (audioRef.current) {
      audioRef.current.replaceChildren();
    }
  }, []);

  const leave = useCallback(() => {
    attemptRef.current += 1;
    teardown();
    notifyRef.current(null);
    setState(INITIAL);
  }, [teardown]);

  // Leave the room when the component goes away or the page is closed.
  useEffect(() => {
    const onUnload = () => teardown();
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      teardown();
    };
  }, [teardown]);

  const join = useCallback(
    async (channelId: string) => {
      const attempt = attemptRef.current + 1;
      attemptRef.current = attempt;
      const current = roomRef.current;
      teardown();

      if (current) {
        notifyRef.current(null);
      }
      setState({ ...INITIAL, channelId, status: "connecting" });

      try {
        const credentials = await api.voiceToken(authToken, channelId);
        if (attemptRef.current !== attempt) {
          return;
        }

        const room = new Room({ adaptiveStream: true });
        roomRef.current = room;
        let joined = false;

        const syncParticipants = () => {
          const muted = new Set<string>();
          for (const participant of [
            room.localParticipant,
            ...room.remoteParticipants.values(),
          ]) {
            if (!participant.isMicrophoneEnabled) {
              muted.add(participant.identity);
            }
          }
          setState((previous) => ({
            ...previous,
            muted,
            selfMuted: !room.localParticipant.isMicrophoneEnabled,
          }));
        };

        room
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
            if (track.kind === Track.Kind.Audio && audioRef.current) {
              audioRef.current.appendChild(track.attach());
            }
            syncParticipants();
          })
          .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
            track.detach().forEach((element) => element.remove());
            syncParticipants();
          })
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            setState((previous) => ({
              ...previous,
              speaking: new Set(speakers.map((s) => s.identity)),
            }));
          })
          .on(RoomEvent.TrackMuted, syncParticipants)
          .on(RoomEvent.TrackUnmuted, syncParticipants)
          .on(RoomEvent.ParticipantConnected, syncParticipants)
          .on(RoomEvent.ParticipantDisconnected, syncParticipants)
          .on(RoomEvent.AudioPlaybackStatusChanged, () => {
            setState((previous) => ({
              ...previous,
              needsAudioUnlock: !room.canPlaybackAudio,
            }));
          })
          .on(RoomEvent.ConnectionStateChanged, (connectionState) => {
            // Only a drop after a successful join is handled here. A failed
            // join also passes through Disconnected, and that case belongs
            // to the catch block below so its error is shown.
            if (
              connectionState === ConnectionState.Disconnected &&
              joined &&
              roomRef.current === room
            ) {
              leave();
              setState({ ...INITIAL, error: "The voice connection was lost." });
            }
          });

        await room.connect(credentials.url, credentials.token);
        if (attemptRef.current !== attempt) {
          room.removeAllListeners();
          await room.disconnect();
          return;
        }

        joined = true;
        await room.localParticipant.setMicrophoneEnabled(true);
        syncParticipants();
        setState((previous) => ({
          ...previous,
          status: "connected",
          needsAudioUnlock: !room.canPlaybackAudio,
        }));
        notifyRef.current(channelId);
      } catch (error) {
        if (attemptRef.current !== attempt) {
          return;
        }
        // Kept in the console so a failed join can be diagnosed.
        console.error("Could not join the voice channel:", error);
        teardown();
        notifyRef.current(null);
        setState({ ...INITIAL, error: describe(error) });
      }
    },
    [authToken, teardown, leave],
  );

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      return;
    }
    const enabled = room.localParticipant.isMicrophoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(!enabled);
      setState((previous) => ({ ...previous, selfMuted: enabled }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: describe(error) }));
    }
  }, []);

  /** Starts audio after the browser blocked it until a user gesture. */
  const unlockAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      return;
    }
    await room.startAudio();
    setState((previous) => ({
      ...previous,
      needsAudioUnlock: !room.canPlaybackAudio,
    }));
  }, []);

  const dismissError = useCallback(() => {
    setState((previous) => ({ ...previous, error: null }));
  }, []);

  return {
    state,
    audioRef,
    join,
    leave,
    toggleMute,
    unlockAudio,
    dismissError,
  };
}

export type VoiceControls = ReturnType<typeof useVoice>;
