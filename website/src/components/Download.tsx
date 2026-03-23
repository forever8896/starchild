"use client";

import { motion } from "framer-motion";
import VideoPlayer from "./VideoPlayer";

function AppleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 12V6.5l7-1V12H3zm0 .5h7v6.5l-7-1V12.5zM11 5.3l10-1.5V12H11V5.3zM11 12.5h10v7.2l-10-1.5V12.5z"/>
    </svg>
  );
}

function LinuxIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.5 2C9.64 2 8.57 4.55 8.42 6.58c-.14 1.85-.71 2.35-1.26 3.27C6.61 10.83 6 11.7 6 13.5c0 .72.19 1.45.56 2.08-.32.17-.6.39-.83.65C5.26 16.76 5 17.46 5 18.25c0 .6.15 1.17.41 1.66-.26.11-.45.36-.45.65 0 .39.32.71.71.71h12.66c.39 0 .71-.32.71-.71 0-.29-.19-.54-.45-.65.26-.49.41-1.06.41-1.66 0-.79-.26-1.49-.73-2.02-.23-.26-.51-.48-.83-.65.37-.63.56-1.36.56-2.08 0-1.8-.61-2.67-1.16-3.65-.55-.92-1.12-1.42-1.26-3.27C15.43 4.55 14.36 2 12.5 2zm0 2c1.14 0 1.69 1.6 1.78 2.88.1 1.33.5 2.37 1.22 3.57.55.92.5 1.17.5 3.05 0 .55-.13 1.08-.38 1.55-.27-.1-.56-.15-.87-.15H9.75c-.31 0-.6.05-.87.15-.25-.47-.38-1-.38-1.55 0-1.88-.05-2.13.5-3.05.72-1.2 1.12-2.24 1.22-3.57C10.31 5.6 10.86 4 12.5 4z"/>
    </svg>
  );
}

const RELEASE = "https://github.com/forever8896/starchild/releases/download/v0.2.0";

const downloadButtons = [
  { label: "Download for Mac", sublabel: "macOS 12+", icon: <AppleIcon />, href: `${RELEASE}/starchild_0.2.0_aarch64.dmg` },
  { label: "Download for Windows", sublabel: "Windows 10+", icon: <WindowsIcon />, href: `${RELEASE}/starchild_0.2.0_x64-setup.exe` },
  { label: "Download for Linux", sublabel: ".deb / .AppImage", icon: <LinuxIcon />, href: `${RELEASE}/starchild_0.2.0_amd64.AppImage` },
];

const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: { opacity: 1, y: 0 },
};

export default function Download() {
  return (
    <section
      className="relative flex flex-col items-center justify-center overflow-hidden bg-black px-6 py-28"
      aria-label="Download Starchild"
    >
      {/* Background aurora */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 65% 55% at 50% 40%, rgba(100, 60, 160, 0.22), transparent 65%)",
          pointerEvents: "none",
        }}
      />

      {/* Breathing video */}
      <motion.div
        className="relative z-10 flex items-center justify-center"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        <VideoPlayer
          src="/videos/starchild2.webm"
          loop
          className="glow-lavender"
          style={{
            width: "clamp(200px, 28vw, 420px)",
            height: "auto",
            display: "block",
          }}
        />
      </motion.div>

      {/* Headline */}
      <motion.h2
        className="relative z-10 mt-10 max-w-xl text-center"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
        style={{
          fontSize: "clamp(1.6rem, 3.5vw, 2.6rem)",
          fontWeight: 300,
          letterSpacing: "-0.01em",
          lineHeight: 1.22,
          color: "#fff",
          fontStyle: "italic",
        }}
      >
        ready to meet your{" "}
        <span style={{ color: "var(--lavender)" }}>starchild?</span>
      </motion.h2>

      {/* Download buttons */}
      <motion.div
        className="relative z-10 flex flex-wrap items-stretch justify-center gap-5"
        style={{ marginTop: "5rem" }}
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease: "easeOut", delay: 0.3 }}
        role="group"
        aria-label="Download options"
      >
        {downloadButtons.map(({ label, sublabel, icon, href }) => (
          <a
            key={label}
            href={href}
            aria-label={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.85rem",
              padding: "1rem 2rem",
              borderRadius: "16px",
              textDecoration: "none",
              background: "rgba(184, 160, 216, 0.06)",
              border: "1px solid rgba(184, 160, 216, 0.25)",
              color: "var(--lavender)",
              transition:
                "background 0.25s, border-color 0.25s, transform 0.2s, box-shadow 0.25s",
              minWidth: "220px",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.background = "rgba(184, 160, 216, 0.14)";
              el.style.borderColor = "rgba(184, 160, 216, 0.7)";
              el.style.transform = "translateY(-3px)";
              el.style.boxShadow = "0 8px 32px rgba(184, 160, 216, 0.15)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.background = "rgba(184, 160, 216, 0.06)";
              el.style.borderColor = "rgba(184, 160, 216, 0.25)";
              el.style.transform = "translateY(0)";
              el.style.boxShadow = "none";
            }}
          >
            <span style={{ opacity: 0.7 }}>{icon}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "0.95rem", fontWeight: 500, color: "#fff" }}>
                {label.replace("Download for ", "")}
              </span>
              <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.35)", fontWeight: 400 }}>
                {sublabel}
              </span>
            </span>
          </a>
        ))}
      </motion.div>

      {/* Tagline */}
      <motion.p
        className="relative z-10 mt-7 text-center"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease: "easeOut", delay: 0.45 }}
        style={{
          fontSize: "0.875rem",
          color: "rgba(255,255,255,0.35)",
          letterSpacing: "0.02em",
        }}
      >
        Free. Open source. Your data never leaves your device.
      </motion.p>

      <p
        className="relative z-10 mt-4 text-center"
        style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.25)" }}
      >
        Having trouble running the app?{" "}
        <a
          href="https://github.com/forever8896/starchild#readme"
          target="_blank"
          style={{ color: "var(--lavender)", opacity: 0.5, borderBottom: "1px solid rgba(184, 160, 216, 0.2)" }}
        >
          Build from source
        </a>
      </p>

      {/* Divider */}
      <div
        aria-hidden="true"
        style={{
          width: "1px",
          height: "48px",
          background:
            "linear-gradient(to bottom, transparent, rgba(184,160,216,0.3), transparent)",
          margin: "3rem 0",
        }}
      />

      {/* Footer */}
      <motion.footer
        className="relative z-10 flex flex-wrap items-center justify-center gap-6 text-center"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease: "easeOut", delay: 0.55 }}
        role="contentinfo"
      >
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          style={{
            color: "rgba(255,255,255,0.35)",
            fontSize: "0.8rem",
            textDecoration: "none",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLAnchorElement).style.color = "var(--lavender)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLAnchorElement).style.color =
              "rgba(255,255,255,0.35)")
          }
        >
          GitHub
        </a>
        <span style={{ color: "rgba(255,255,255,0.12)", fontSize: "0.8rem" }}>
          /
        </span>
        <a
          href="https://x.com/KilianSolutions"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Twitter — @KilianSolutions"
          style={{
            color: "rgba(255,255,255,0.35)",
            fontSize: "0.8rem",
            textDecoration: "none",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLAnchorElement).style.color = "var(--lavender)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLAnchorElement).style.color =
              "rgba(255,255,255,0.35)")
          }
        >
          @KilianSolutions
        </a>
        <span style={{ color: "rgba(255,255,255,0.12)", fontSize: "0.8rem" }}>
          /
        </span>
        <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.8rem" }}>
          Built during The Synthesis hackathon
        </span>
      </motion.footer>
    </section>
  );
}
