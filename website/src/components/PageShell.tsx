"use client";

import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Shared shell for the prose pages (about, contact, legal, privacy).
 * Mirrors the OriginView treatment — aurora wash, centred display heading,
 * a single narrow measure — so the company pages read as part of the site
 * rather than bolted-on boilerplate.
 */
export default function PageShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="relative flex flex-col items-center overflow-hidden bg-black"
      style={{ paddingTop: "8rem", paddingBottom: "6rem", paddingInline: "var(--pad-x)" }}
    >
      <div
        className="aurora"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 24%, rgba(30, 10, 60, 0.55), transparent 70%)",
        }}
      />

      <motion.div
        className="relative z-10 flex w-full max-w-2xl flex-col"
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.9, ease }}
      >
        <h1
          className="font-display text-center"
          style={{
            fontSize: "clamp(1.8rem, 4vw, 3rem)",
            lineHeight: 1.14,
            color: "#fff",
            marginBottom: intro ? "1.5rem" : "3rem",
          }}
        >
          {title}
        </h1>

        {intro ? (
          <p
            className="lead text-center"
            style={{ marginBottom: "3.5rem", fontSize: "clamp(0.98rem, 1.5vw, 1.08rem)" }}
          >
            {intro}
          </p>
        ) : null}

        <div
          className="lead flex flex-col gap-8"
          style={{ fontSize: "clamp(0.98rem, 1.5vw, 1.08rem)" }}
        >
          {children}
        </div>
      </motion.div>
    </section>
  );
}

/** A labelled row for the register / contact detail lists. */
export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6"
      style={{ paddingBlock: "0.85rem", borderTop: "1px solid var(--line)" }}
    >
      <span
        className="eyebrow"
        style={{ flex: "0 0 11rem", color: "var(--lavender)", opacity: 0.55 }}
      >
        {label}
      </span>
      <span style={{ color: "var(--text-strong)" }}>{value}</span>
    </div>
  );
}

/** Section heading inside a prose page. */
export function Rubric({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-display"
      style={{
        fontSize: "clamp(1.15rem, 2vw, 1.4rem)",
        lineHeight: 1.4,
        color: "#fff",
        marginTop: "1.5rem",
      }}
    >
      {children}
    </h2>
  );
}
