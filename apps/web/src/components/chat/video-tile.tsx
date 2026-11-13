"use client";

import { useEffect, useRef } from "react";
import type { Track } from "livekit-client";

/** Plays one LiveKit video track. Audio travels on its own track. */
export function VideoTile({
  track,
  label,
  mirrored = false,
  fit = "cover",
}: {
  track: Track;
  label: string;
  /** Mirror the user's own camera, the way a mirror would show it. */
  mirrored?: boolean;
  fit?: "cover" | "contain";
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      aria-label={label}
      className={`h-full w-full bg-black ${
        fit === "cover" ? "object-cover" : "object-contain"
      } ${mirrored ? "-scale-x-100" : ""}`}
    />
  );
}
