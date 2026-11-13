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
export type VideoSource = "camera" | "screen";

/** Key of a video track in `VoiceState.videoTracks`. */
export const videoKey = (userId: string, source: VideoSource) =>
  `${userId}:${source}`;

export interface VoiceState {
  /** The voice channel the user is connected to, or trying to connect to. */
  channelId: string | null;
  status: VoiceStatus;
  /** User ids heard speaking right now. */
  speaking: Set<string>;
  /** User ids whose microphone is off. */
  muted: Set<string>;
  /** Live camera and screen tracks, keyed with `videoKey`. */
  videoTracks: Map<string, Track>;
  selfMuted: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  /** True when the browser is holding back audio until the user interacts. */
  needsAudioUnlock: boolean;
  error: string | null;
}

const INITIAL: VoiceState = {
  channelId: null,
  status: "idle",
  speaking: new Set(),
  muted: new Set(),
  videoTracks: new Map(),
  selfMuted: false,
  cameraOn: false,
  screenOn: false,
  needsAudioUnlock: false,
  error: null,
};

type Device = "microphone" | "camera" | "screen";

function describe(error: unknown, device: Device = "microphone"): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    // The names the browser uses when a device cannot be opened.
    if (error.name === "NotAllowedError") {
      return device === "screen"
        ? "Screen sharing was blocked by the browser."
        : `Access to your ${device} was blocked. Allow it in your browser and try again.`;
    }
    if (error.name === "NotFoundError") {
      return `No ${device} was found.`;
    }
    if (error.name === "NotReadableError") {
      return `Your ${device} is already in use by another app.`;
    }
    if (/401|unauthori[sz]ed|invalid token/i.test(error.message)) {
      return "The voice server rejected the connection. Its keys may be set up incorrectly.";
    }
    if (error.message) {
      return `Could not join the voice channel: ${error.message}`;
    }
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

        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        let joined = false;

        /** Re-reads microphones, cameras and screens from the room. */
        const readRoom = () => {
          const muted = new Set<string>();
          const videoTracks = new Map<string, Track>();
          for (const participant of [
            room.localParticipant,
            ...room.remoteParticipants.values(),
          ]) {
            if (!participant.isMicrophoneEnabled) {
              muted.add(participant.identity);
            }
            for (const publication of participant.videoTrackPublications.values()) {
              if (!publication.track || publication.isMuted) {
                continue;
              }
              const source: VideoSource | null =
                publication.source === Track.Source.Camera
                  ? "camera"
                  : publication.source === Track.Source.ScreenShare
                    ? "screen"
                    : null;
              if (source) {
                videoTracks.set(
                  videoKey(participant.identity, source),
                  publication.track,
                );
              }
            }
          }
          setState((previous) => ({
            ...previous,
            muted,
            videoTracks,
            selfMuted: !room.localParticipant.isMicrophoneEnabled,
            cameraOn: room.localParticipant.isCameraEnabled,
            screenOn: room.localParticipant.isScreenShareEnabled,
          }));
        };

        // LiveKit emits some events (a track being unsubscribed, for one)
        // just before it updates the participant, so read on the next tick.
        const sync = () => {
          setTimeout(() => {
            if (roomRef.current === room) readRoom();
          }, 0);
        };

        room
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
            if (track.kind === Track.Kind.Audio && audioRef.current) {
              audioRef.current.appendChild(track.attach());
            }
            sync();
          })
          .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
            if (track.kind === Track.Kind.Audio) {
              track.detach().forEach((element) => element.remove());
            }
            sync();
          })
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            setState((previous) => ({
              ...previous,
              speaking: new Set(speakers.map((s) => s.identity)),
            }));
          })
          .on(RoomEvent.TrackUnpublished, sync)
          .on(RoomEvent.TrackMuted, sync)
          .on(RoomEvent.TrackUnmuted, sync)
          .on(RoomEvent.LocalTrackPublished, sync)
          // Also fires when sharing is stopped from the browser's own bar.
          .on(RoomEvent.LocalTrackUnpublished, sync)
          .on(RoomEvent.ParticipantConnected, sync)
          .on(RoomEvent.ParticipantDisconnected, sync)
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
        readRoom();
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

  /** Turns one of the user's own devices on or off. */
  const toggleDevice = useCallback(async (device: Device) => {
    const local = roomRef.current?.localParticipant;
    if (!local) {
      return;
    }
    try {
      if (device === "microphone") {
        await local.setMicrophoneEnabled(!local.isMicrophoneEnabled);
      } else if (device === "camera") {
        await local.setCameraEnabled(!local.isCameraEnabled);
      } else {
        await local.setScreenShareEnabled(!local.isScreenShareEnabled);
      }
      setState((previous) => ({
        ...previous,
        selfMuted: !local.isMicrophoneEnabled,
        cameraOn: local.isCameraEnabled,
        screenOn: local.isScreenShareEnabled,
        error: null,
      }));
    } catch (error) {
      // Closing the browser's screen picker is a choice, not a failure.
      const dismissedPicker =
        device === "screen" &&
        error instanceof Error &&
        (error.name === "NotAllowedError" || error.name === "AbortError");
      if (!dismissedPicker) {
        setState((previous) => ({
          ...previous,
          error: describe(error, device),
        }));
      }
    }
  }, []);

  const toggleMute = useCallback(
    () => toggleDevice("microphone"),
    [toggleDevice],
  );
  const toggleCamera = useCallback(
    () => toggleDevice("camera"),
    [toggleDevice],
  );
  const toggleScreen = useCallback(
    () => toggleDevice("screen"),
    [toggleDevice],
  );

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

  return {
    state,
    audioRef,
    join,
    leave,
    toggleMute,
    toggleCamera,
    toggleScreen,
    unlockAudio,
  };
}

export type VoiceControls = ReturnType<typeof useVoice>;
