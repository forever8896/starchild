"use client";

import { motion } from "framer-motion";

function LockIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ color: "var(--lavender)" }}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const badges = [
  { label: "E2EE", title: "End-to-End Encrypted" },
  { label: "TEE Attestation", title: "Trusted Execution Environment" },
  { label: "Zero Data Retention", title: "Nothing stored on our servers" },
  { label: "Local-First", title: "Your data lives on your device" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: { opacity: 1, y: 0 },
};

export default function Privacy() {
  return (
    <section
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-6 py-28"
      aria-label="Privacy and security"
    >
      {/* Subtle background glow */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(60, 40, 100, 0.25), transparent 65%)",
          pointerEvents: "none",
        }}
      />

      <div className="relative z-10 flex max-w-2xl flex-col items-center text-center gap-8">
        {/* Icon */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{
            padding: "1.2rem",
            borderRadius: "50%",
            border: "1px solid rgba(184, 160, 216, 0.2)",
            background: "rgba(184, 160, 216, 0.06)",
            display: "inline-flex",
          }}
        >
          <LockIcon />
        </motion.div>

        {/* Title */}
        <motion.h2
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
          style={{
            fontSize: "clamp(1.6rem, 3.5vw, 2.6rem)",
            fontWeight: 300,
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
            color: "#fff",
            fontStyle: "italic",
          }}
        >
          your deepest thoughts,{" "}
          <span style={{ color: "var(--lavender)" }}>
            cryptographically protected
          </span>
        </motion.h2>

        {/* Body */}
        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          style={{
            fontSize: "clamp(0.95rem, 1.6vw, 1.05rem)",
            lineHeight: 1.8,
            color: "rgba(255,255,255,0.52)",
          }}
        >
          End-to-end encrypted with hardware-verified trusted execution
          environments. Your conversations are encrypted on your device and only
          decrypted inside verified enclaves. Not even the AI provider can read
          them.
        </motion.p>

        {/* Badges */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-3"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.35 }}
          role="list"
          aria-label="Security features"
        >
          {badges.map(({ label, title }) => (
            <span
              key={label}
              role="listitem"
              title={title}
              style={{
                display: "inline-block",
                padding: "0.4rem 1rem",
                border: "1px solid rgba(184, 160, 216, 0.3)",
                borderRadius: "9999px",
                fontSize: "0.78rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--lavender)",
                background: "rgba(184, 160, 216, 0.07)",
              }}
            >
              {label}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
