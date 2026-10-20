"use client";

import { motion } from "framer-motion";

function LockIcon() {
  return (
    <svg
      width="44"
      height="44"
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
  { label: "Zero Retention", title: "Nothing stored on our servers" },
  { label: "Local-First", title: "Your data lives on your device" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: { opacity: 1, y: 0 },
};

const ease = [0.16, 1, 0.3, 1] as const;

export default function Privacy() {
  return (
    <section
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-black"
      style={{ paddingBlock: "var(--section-y)", paddingInline: "var(--pad-x)" }}
      aria-label="Privacy and security"
    >
      <div
        className="aurora"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 48% 48% at 50% 50%, rgba(60, 40, 100, 0.24), transparent 66%)",
        }}
      />

      <div className="relative z-10 flex max-w-2xl flex-col items-center gap-8 text-center">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease }}
          style={{
            padding: "1.2rem",
            borderRadius: "var(--r-full)",
            border: "1px solid var(--line-strong)",
            background: "rgba(184, 160, 216, 0.06)",
            display: "inline-flex",
          }}
        >
          <LockIcon />
        </motion.div>

        <motion.h2
          className="font-display"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease, delay: 0.1 }}
          style={{
            fontSize: "clamp(1.7rem, 3.6vw, 2.8rem)",
            lineHeight: 1.16,
            color: "#fff",
          }}
        >
          your deepest thoughts,{" "}
          <span className="accent">cryptographically protected</span>
        </motion.h2>

        <motion.p
          className="lead"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease, delay: 0.2 }}
          style={{ fontSize: "clamp(0.98rem, 1.5vw, 1.08rem)" }}
        >
          End-to-end encrypted, with hardware-verified trusted execution
          environments. Your conversations are encrypted on your device and only
          decrypted inside verified enclaves. Not even the AI provider can read
          them.
        </motion.p>

        <motion.div
          className="flex flex-wrap items-center justify-center gap-3"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease, delay: 0.35 }}
          role="list"
          aria-label="Security features"
        >
          {badges.map(({ label, title }) => (
            <span key={label} role="listitem" title={title} className="pill">
              {label}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
