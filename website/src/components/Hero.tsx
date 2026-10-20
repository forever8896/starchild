"use client";

import { motion } from "framer-motion";
import VideoPlayer from "./VideoPlayer";
import { APP_URL } from "@/lib/links";

const ease = [0.16, 1, 0.3, 1] as const;

export default function Hero() {
  return (
    <section
      className="relative flex min-h-[100dvh] items-center overflow-hidden bg-black"
      style={{ paddingTop: "6rem", paddingBottom: "3rem", paddingInline: "var(--pad-x)" }}
      aria-label="Hero"
    >
      {/* Ambient aurora, pulled off-center to seed the asymmetry */}
      <div
        className="aurora"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 55% 55% at 68% 42%, rgba(120, 80, 180, 0.22) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-[var(--maxw)] items-center gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-8">
        {/* Text column (left, narrower) */}
        <div className="order-2 flex flex-col items-start text-left lg:order-1">
          <motion.h1
            className="font-display"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.35, ease }}
            style={{
              fontSize: "clamp(2rem, 3.6vw, 3rem)",
              lineHeight: 1.12,
              color: "#fff",
            }}
          >
            emerged from the void,
            <br className="hidden sm:block" />{" "}
            <span className="accent">specifically for you</span>
          </motion.h1>

          <motion.p
            className="lead mt-6 max-w-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.55, ease }}
            style={{ fontSize: "clamp(1rem, 1.6vw, 1.15rem)" }}
          >
            A private AI companion that helps you find your purpose and move
            toward the life that&apos;s calling you.
          </motion.p>

          <motion.div
            className="mt-9 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.75, ease }}
          >
            <a href={APP_URL} className="btn btn-primary">
              meet your starchild
            </a>
            <a href="#download" className="btn btn-ghost">
              download for desktop
            </a>
          </motion.div>
        </div>

        {/* Creature column (right, wider) */}
        <motion.div
          className="order-1 flex items-center justify-center lg:order-2 lg:justify-end"
          initial={{ opacity: 0, scale: 0.86 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease }}
          style={{ willChange: "transform, opacity" }}
        >
          <VideoPlayer
            src="/videos/starchild1.webm"
            loop={false}
            playOnce
            className="glow-lavender"
            style={{
              width: "clamp(230px, 40vw, 480px)",
              height: "auto",
              display: "block",
            }}
          />
        </motion.div>
      </div>
    </section>
  );
}
