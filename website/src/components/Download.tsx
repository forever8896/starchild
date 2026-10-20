"use client";

import { motion } from "framer-motion";
import VideoPlayer from "./VideoPlayer";
import { APP_URL, DOWNLOADS, LINKS, type OsKey } from "@/lib/links";

function OsIcon({ os }: { os: OsKey }) {
  if (os === "mac")
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
    );
  if (os === "windows")
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 12V6.5l7-1V12H3zm0 .5h7v6.5l-7-1V12.5zM11 5.3l10-1.5V12H11V5.3zM11 12.5h10v7.2l-10-1.5V12.5z" />
      </svg>
    );
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.5 2C9.64 2 8.57 4.55 8.42 6.58c-.14 1.85-.71 2.35-1.26 3.27C6.61 10.83 6 11.7 6 13.5c0 .72.19 1.45.56 2.08-.32.17-.6.39-.83.65C5.26 16.76 5 17.46 5 18.25c0 .6.15 1.17.41 1.66-.26.11-.45.36-.45.65 0 .39.32.71.71.71h12.66c.39 0 .71-.32.71-.71 0-.29-.19-.54-.45-.65.26-.49.41-1.06.41-1.66 0-.79-.26-1.49-.73-2.02-.23-.26-.51-.48-.83-.65.37-.63.56-1.36.56-2.08 0-1.8-.61-2.67-1.16-3.65-.55-.92-1.12-1.42-1.26-3.27C15.43 4.55 14.36 2 12.5 2zm0 2c1.14 0 1.69 1.6 1.78 2.88.1 1.33.5 2.37 1.22 3.57.55.92.5 1.17.5 3.05 0 .55-.13 1.08-.38 1.55-.27-.1-.56-.15-.87-.15H9.75c-.31 0-.6.05-.87.15-.25-.47-.38-1-.38-1.55 0-1.88-.05-2.13.5-3.05.72-1.2 1.12-2.24 1.22-3.57C10.31 5.6 10.86 4 12.5 4z" />
    </svg>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: { opacity: 1, y: 0 },
};

const ease = [0.16, 1, 0.3, 1] as const;

export default function Download() {
  return (
    <section
      id="download"
      className="relative flex scroll-mt-24 flex-col items-center justify-center overflow-hidden bg-black"
      style={{ paddingBlock: "var(--section-y)", paddingInline: "var(--pad-x)" }}
      aria-label="Meet your starchild"
    >
      <div
        className="aurora"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 62% 52% at 50% 38%, rgba(100, 60, 160, 0.22), transparent 66%)",
        }}
      />

      <motion.div
        className="relative z-10 flex items-center justify-center"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease }}
      >
        <VideoPlayer
          src="/videos/starchild2.webm"
          loop
          className="glow-lavender"
          style={{ width: "clamp(200px, 26vw, 400px)", height: "auto", display: "block" }}
        />
      </motion.div>

      <motion.h2
        className="font-display relative z-10 mt-10 max-w-xl text-center"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease, delay: 0.15 }}
        style={{ fontSize: "clamp(1.7rem, 3.6vw, 2.8rem)", lineHeight: 1.16, color: "#fff" }}
      >
        ready to meet your <span className="accent">starchild?</span>
      </motion.h2>

      {/* Primary path: the browser experience */}
      <motion.div
        className="relative z-10 mt-9 flex flex-col items-center gap-3"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease, delay: 0.25 }}
      >
        <a href={APP_URL} className="btn btn-primary" style={{ padding: "1rem 2rem" }}>
          meet your starchild in your browser
        </a>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          no install, encrypted, free
        </span>
      </motion.div>

      {/* Secondary path: the desktop app */}
      <motion.p
        className="eyebrow relative z-10 mt-16 mb-6"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease, delay: 0.3 }}
      >
        or keep it on your desktop
      </motion.p>

      <motion.div
        className="relative z-10 flex flex-wrap items-stretch justify-center gap-4"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease, delay: 0.4 }}
        role="group"
        aria-label="Desktop download options"
      >
        {DOWNLOADS.map(({ key, label, sublabel, href }) => (
          <a
            key={key}
            href={href}
            aria-label={`Download for ${label}`}
            className="dl"
          >
            <span style={{ opacity: 0.7, color: "var(--lavender)" }}>
              <OsIcon os={key} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "0.95rem", fontWeight: 500, color: "#fff" }}>{label}</span>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{sublabel}</span>
            </span>
          </a>
        ))}
      </motion.div>

      <motion.p
        className="lead relative z-10 mt-8 text-center"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease, delay: 0.5 }}
        style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}
      >
        Free, open source, and your data never leaves your device.{" "}
        <a
          href={LINKS.readme}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--lavender)", borderBottom: "1px solid var(--line-strong)" }}
        >
          Build from source
        </a>
      </motion.p>

      <style jsx>{`
        .dl {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 1rem 1.75rem;
          min-width: 210px;
          border-radius: var(--r-md);
          border: 1px solid var(--line-strong);
          background: rgba(184, 160, 216, 0.05);
          text-decoration: none;
          transition: background 0.25s ease, border-color 0.25s ease,
            transform 0.2s ease, box-shadow 0.25s ease;
        }
        .dl:hover {
          background: rgba(184, 160, 216, 0.12);
          border-color: var(--lavender);
          transform: translateY(-3px);
          box-shadow: 0 10px 34px -10px var(--glow-lavender);
        }
      `}</style>
    </section>
  );
}
