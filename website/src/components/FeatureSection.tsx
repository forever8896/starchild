"use client";

import { motion } from "framer-motion";
import VideoPlayer from "./VideoPlayer";

interface FeatureSectionProps {
  videoSrc: string;
  /** "left" = video on left, text on right. "right" = video on right, text on left. */
  alignment: "left" | "right";
  eyebrow?: string;
  title: string;
  body: string;
  footnote?: string;
  /** Optional ambient glow colour behind the video (CSS color string) */
  glowColor?: string;
  /** Whether video is an MP4 (wider / different sizing) */
  wide?: boolean;
}

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

export default function FeatureSection({
  videoSrc,
  alignment,
  eyebrow,
  title,
  body,
  footnote,
  glowColor = "rgba(184, 160, 216, 0.18)",
  wide = false,
}: FeatureSectionProps) {
  const videoFirst = alignment === "left";

  const videoBlock = (
    <motion.div
      className="relative flex items-center justify-center"
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
      style={{ flex: wide ? "0 0 auto" : "1 1 0", minWidth: 0 }}
    >
      {/* Ambient glow blob */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "-20%",
          background: `radial-gradient(ellipse 70% 70% at 50% 50%, ${glowColor}, transparent 70%)`,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <VideoPlayer
        src={videoSrc}
        loop
        className={wide ? "" : "glow-lavender"}
        style={{
          width: wide
            ? "clamp(320px, 72vw, 900px)"
            : "clamp(220px, 36vw, 520px)",
          height: "auto",
          display: "block",
          position: "relative",
          zIndex: 1,
        }}
      />
    </motion.div>
  );

  const textBlock = (
    <motion.div
      className="flex flex-col justify-center"
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.9, ease: "easeOut", delay: 0.25 }}
      style={{ flex: "1 1 0", minWidth: 0, maxWidth: wide ? "100%" : "480px" }}
    >
      {eyebrow && (
        <p
          style={{
            fontSize: "0.75rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--lavender)",
            marginBottom: "0.85rem",
            fontWeight: 600,
          }}
        >
          {eyebrow}
        </p>
      )}
      <h2
        style={{
          fontSize: "clamp(1.5rem, 3vw, 2.4rem)",
          fontWeight: 300,
          lineHeight: 1.22,
          letterSpacing: "-0.01em",
          color: "#fff",
          marginBottom: "1.2rem",
          fontStyle: "italic",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: "clamp(0.95rem, 1.6vw, 1.05rem)",
          lineHeight: 1.75,
          color: "rgba(255,255,255,0.52)",
          fontWeight: 400,
          marginBottom: footnote ? "1.2rem" : 0,
        }}
      >
        {body}
      </p>
      {footnote && (
        <p
          style={{
            fontSize: "0.8rem",
            lineHeight: 1.65,
            color: "rgba(184, 160, 216, 0.6)",
            fontStyle: "italic",
            borderLeft: "2px solid rgba(184, 160, 216, 0.3)",
            paddingLeft: "0.9rem",
          }}
        >
          {footnote}
        </p>
      )}
    </motion.div>
  );

  if (wide) {
    // Full-width stacked layout for the vision tree section
    return (
      <section
        className="relative flex flex-col items-center gap-12 overflow-hidden bg-black px-6 py-28"
        aria-label={title}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(90, 60, 140, 0.1), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        {videoBlock}
        <div className="flex w-full max-w-3xl flex-col items-center text-center">
          {textBlock}
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-6 py-24"
      aria-label={title}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(30, 10, 60, 0.6), transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        className="relative z-10 flex w-full max-w-6xl flex-col items-center gap-16 lg:flex-row lg:gap-20"
        style={{
          flexDirection: videoFirst ? undefined : "row-reverse",
        }}
      >
        {videoFirst ? (
          <>
            {videoBlock}
            {textBlock}
          </>
        ) : (
          <>
            {textBlock}
            {videoBlock}
          </>
        )}
      </div>
    </section>
  );
}
