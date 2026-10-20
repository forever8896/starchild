"use client";

import { motion } from "framer-motion";
import VideoPlayer from "./VideoPlayer";

interface FeatureSectionProps {
  videoSrc: string;
  /** "left" = video on left, text on right. "right" = video on right, text on left. */
  alignment: "left" | "right";
  eyebrow?: string;
  title: React.ReactNode;
  body: string;
  footnote?: string;
  /** Optional ambient glow colour behind the video (CSS color string) */
  glowColor?: string;
  /** Full-width stacked layout (for the vision tree) */
  wide?: boolean;
}

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

const ease = [0.16, 1, 0.3, 1] as const;

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
      transition={{ duration: 0.9, ease, delay: 0.1 }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "-22%",
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
          width: wide ? "clamp(320px, 72vw, 900px)" : "clamp(220px, 34vw, 480px)",
          height: "auto",
          display: "block",
          position: "relative",
          zIndex: 1,
          borderRadius: wide ? "var(--r-lg)" : undefined,
          border: wide ? "1px solid var(--line)" : undefined,
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
      transition={{ duration: 0.9, ease, delay: 0.22 }}
      style={{ maxWidth: wide ? "42rem" : "30rem" }}
    >
      {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
      <h2
        className="font-display"
        style={{
          fontSize: "clamp(1.7rem, 3.4vw, 2.7rem)",
          lineHeight: 1.16,
          color: "#fff",
          marginBottom: "1.3rem",
        }}
      >
        {title}
      </h2>
      <p className="lead" style={{ fontSize: "clamp(0.98rem, 1.5vw, 1.08rem)" }}>
        {body}
      </p>
      {footnote && (
        <p
          className="mt-6"
          style={{
            fontSize: "0.82rem",
            lineHeight: 1.7,
            color: "rgba(184, 160, 216, 0.62)",
            borderLeft: "2px solid var(--line-strong)",
            paddingLeft: "1rem",
          }}
        >
          {footnote}
        </p>
      )}
    </motion.div>
  );

  if (wide) {
    return (
      <section
        className="relative flex flex-col items-center gap-14 overflow-hidden bg-black"
        style={{ paddingBlock: "var(--section-y)", paddingInline: "var(--pad-x)" }}
        aria-label={typeof title === "string" ? title : eyebrow}
      >
        <div
          className="aurora"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 80% 55% at 50% 45%, rgba(90, 60, 140, 0.14), transparent 70%)",
          }}
        />
        <div className="relative z-10">{videoBlock}</div>
        <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center">
          {textBlock}
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative flex min-h-[100dvh] items-center overflow-hidden bg-black"
      style={{ paddingBlock: "var(--section-y)", paddingInline: "var(--pad-x)" }}
      aria-label={typeof title === "string" ? title : eyebrow}
    >
      <div
        className="aurora"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(30, 10, 60, 0.55), transparent 72%)",
        }}
      />
      <div
        className={`relative z-10 mx-auto grid w-full max-w-[var(--maxw)] items-center gap-12 lg:gap-16 ${
          videoFirst
            ? "lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]"
            : "lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
        }`}
      >
        {videoFirst ? (
          <>
            {videoBlock}
            {textBlock}
          </>
        ) : (
          <>
            <div className="lg:order-2">{videoBlock}</div>
            <div className="lg:order-1">{textBlock}</div>
          </>
        )}
      </div>
    </section>
  );
}
