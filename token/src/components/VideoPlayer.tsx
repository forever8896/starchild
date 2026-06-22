"use client";

import { useEffect, useRef } from "react";

interface VideoPlayerProps {
  src: string;
  loop?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** When true the video plays once and stops on the last frame */
  playOnce?: boolean;
}

/**
 * Viewport-aware video player.
 * Plays when ≥20% of the element is visible; pauses when scrolled away.
 * Transparent-background WebM (VP9 alpha) and MP4 both work.
 */
export default function VideoPlayer({
  src,
  loop = true,
  className = "",
  style,
  playOnce = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          video.play().catch(() => {
            // Autoplay blocked — silently ignore
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      autoPlay
      muted
      playsInline
      loop={!playOnce && loop}
      preload="auto"
      className={className}
      style={style}
      aria-hidden="true"
    />
  );
}
