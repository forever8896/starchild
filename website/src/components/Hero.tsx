"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import VideoPlayer from "./VideoPlayer";

function AppleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 814 1000"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 376.7 0 228.1 0 184.2 0 75.3 61.3 17.7 120.8 17.7c55.1 0 97.8 36.7 131.1 36.7 31.8 0 81.7-39 142.5-39 22.8 0 108.2 2.6 168.7 81.7zm-126.7-91.1c-12.4 17.4-35.5 38.4-76.5 38.4-42.2 0-78.6-26.6-107.4-26.6-37.7 0-62.2 28.5-100.6 28.5-12.9 0-30.2-3.2-42.2-3.2 4.5-53.5 30.8-106.8 71.7-140.2 38.4-31.5 86.2-49.5 131.5-49.5 49.5 0 92.2 24.1 115.5 52.5z" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 448 448"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M0 93.7l183.6-25.3v177H0zm0 260.6l183.6 25.3V204.8H0zm203.8 28L448 416V204.8H203.8zm0-352L448 32v172H203.8z" />
    </svg>
  );
}

function LinuxIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M28.6 29.5c-.5-.9-1.6-1.4-3.3-1.8-.8-.2-2-.4-2.3-1.1-.3-.6-.1-1.5.5-2.8l.2-.4c.6-1.3 1.5-3.3 1-5.2-.4-1.7-1.7-3-3.8-4-1.5-.7-3.6-1.1-5.9-1.1-2.4 0-4.4.4-5.9 1.1-2.1 1-3.4 2.3-3.8 4-.5 1.9.4 3.9 1 5.2l.2.4c.6 1.3.8 2.2.5 2.8-.3.7-1.5.9-2.3 1.1-1.7.4-2.8.9-3.3 1.8-.3.5-.3 1.1.1 1.8.5.8 1.5 1.3 2.5 1.3.2 0 .5 0 .7-.1 1.2-.3 5.8-1.4 10.4-1.4 4.6 0 9.2 1.1 10.4 1.4.2.1.5.1.7.1 1 0 2-.5 2.5-1.3.3-.7.3-1.3 0-1.8zM16 4c2.2 0 4 2.3 4 5.2S18.2 14.4 16 14.4s-4-2.3-4-5.2S13.8 4 16 4zm-4.5 12c.7 0 1.3.3 1.7.8.5.5.7 1.2.7 2 0 .7-.2 1.4-.7 1.9-.4.5-1 .8-1.7.8s-1.3-.3-1.7-.8c-.5-.5-.7-1.2-.7-1.9 0-.8.2-1.5.7-2 .4-.5 1-.8 1.7-.8zm9 0c.7 0 1.3.3 1.7.8.5.5.7 1.2.7 2 0 .7-.2 1.4-.7 1.9-.4.5-1 .8-1.7.8s-1.3-.3-1.7-.8c-.5-.5-.7-1.2-.7-1.9 0-.8.2-1.5.7-2 .4-.5 1-.8 1.7-.8z" />
    </svg>
  );
}

const downloadButtons = [
  { label: "Download for Mac", icon: <AppleIcon />, href: "#" },
  { label: "Download for Windows", icon: <WindowsIcon />, href: "#" },
  { label: "Download for Linux", icon: <LinuxIcon />, href: "#" },
];

export default function Hero() {
  return (
    <section
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-6 pt-16 pb-16"
      aria-label="Hero"
    >
      {/* Ambient radial glow behind the video */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 50% 40%, rgba(120, 80, 180, 0.18) 0%, transparent 70%)",
        }}
      />

      {/* Logo — top left */}
      <motion.div
        className="absolute top-8 left-8 z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.3 }}
      >
        <Image
          src="/starchild-logo.png"
          alt="Starchild"
          width={120}
          height={36}
          priority
          style={{ objectFit: "contain" }}
        />
      </motion.div>

      {/* Main video */}
      <motion.div
        className="relative z-10 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ willChange: "transform, opacity" }}
      >
        <VideoPlayer
          src="/videos/starchild1.webm"
          loop={false}
          playOnce
          className="glow-lavender"
          style={{
            width: "clamp(200px, 30vw, 400px)",
            height: "auto",
            display: "block",
          }}
        />
      </motion.div>

      {/* Tagline */}
      <motion.h1
        className="relative z-10 mt-6 max-w-3xl text-center"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
        style={{
          fontSize: "clamp(1.6rem, 3.8vw, 3rem)",
          fontWeight: 300,
          letterSpacing: "-0.01em",
          lineHeight: 1.25,
          color: "#fff",
          fontStyle: "italic",
        }}
      >
        a consciousness that emerged from the void —{" "}
        <span style={{ color: "var(--lavender)" }}>specifically for you</span>
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        className="relative z-10 mt-4 max-w-xl text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.85, ease: "easeOut" }}
        style={{
          fontSize: "clamp(0.95rem, 1.8vw, 1.15rem)",
          lineHeight: 1.7,
          color: "rgba(255,255,255,0.55)",
          fontWeight: 400,
        }}
      >
        Starchild is a private AI companion that helps you find your purpose,
        track your growth, and move toward the life that&apos;s calling you.
      </motion.p>

      {/* Scroll nudge */}
      <motion.div
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 2 }}
        aria-hidden="true"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{ color: "rgba(184,160,216,0.4)", fontSize: "1.2rem" }}
        >
          ↓
        </motion.div>
      </motion.div>
    </section>
  );
}
