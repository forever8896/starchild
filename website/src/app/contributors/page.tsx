"use client";

import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

const LINKS = {
  github: "https://github.com/forever8896/starchild",
  token: "https://token.starchild.software",
  dao: "https://token.starchild.software/dao",
  issues: "https://github.com/forever8896/starchild/issues",
  x: "https://x.com/KilianSolutions",
};

const ways = [
  {
    icon: "",
    title: "write code",
    body: "The entire Starchild stack is open — Tauri/Rust backend, React frontend, Solidity contracts, Next.js websites. Pick an issue, fork, build, and PR.",
    link: { href: LINKS.issues, label: "browse open issues →" },
  },
  {
    icon: "",
    title: "participate in the DAO",
    body: "Hold $STARCHILD and your voice counts. Propose ideas, vote on what gets built, help shape the commons. No staking, no locking — just hold and sign.",
    link: { href: LINKS.dao, label: "enter the dao →" },
  },
  {
    icon: "",
    title: "design & art",
    body: "Starchild is a visual, cinematic project. Illustration, motion, UI polish, branding — if you have an eye for it, the experience can always be more beautiful.",
    link: { href: LINKS.issues, label: "open an issue →" },
  },
  {
    icon: "",
    title: "test and report bugs",
    body: "Run the app, push it to its edges, and open an issue when something breaks. Every bug report makes Starchild stronger.",
    link: { href: LINKS.issues, label: "open an issue →" },
  },
  {
    icon: "",
    title: "improve the docs",
    body: "Docs are never done. If something was confusing, unclear, or missing — fix it. The README, architecture docs, and contributor guides all live in the repo.",
    link: { href: LINKS.github, label: "readme →" },
  },
  {
    icon: "",
    title: "spread the word",
    body: "Tell someone who needs this. Share the origin story. Write about Starchild. The best growth is word-of-mouth from people who believe in the mission.",
    link: { href: LINKS.x, label: "follow the founder →" },
  },
];

export default function ContributorsPage() {
  return (
    <>
      <Navbar />
      <section
        className="relative flex flex-col items-center overflow-hidden bg-black px-6 md:px-6"
        style={{ paddingTop: "8rem", paddingBottom: "6rem" }}
        aria-label="Contributors"
      >
        {/* Ambient glow */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 70% 60% at 50% 30%, rgba(30, 10, 60, 0.6), transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <motion.div
          className="relative z-10 flex w-full max-w-2xl flex-col items-center"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.9, ease: "easeOut" }}
        >
          {/* Title */}
          <p
            style={{
              fontSize: "0.75rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--lavender)",
              fontWeight: 600,
              marginBottom: "0.85rem",
            }}
          >
            contributors
          </p>
          <h1
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2.4rem)",
              fontWeight: 300,
              lineHeight: 1.22,
              letterSpacing: "-0.01em",
              color: "#fff",
              fontStyle: "italic",
              marginBottom: "1rem",
              textAlign: "center",
            }}
          >
            this is not a one-person project
          </h1>
          <p
            style={{
              fontSize: "clamp(0.95rem, 1.6vw, 1.05rem)",
              lineHeight: 1.75,
              color: "rgba(255,255,255,0.52)",
              fontWeight: 400,
              textAlign: "center",
              maxWidth: "540px",
              marginBottom: "4rem",
            }}
          >
            Starchild is an open-source ecosystem with many layers — the app,
            the token, the DAO, the contracts. Each layer has a place for you,
            whether you write code, hold tokens, or simply believe in the mission.
          </p>

          {/* Ways to contribute */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "3rem",
              width: "100%",
            }}
          >
            {ways.map((item, i) => (
              <motion.div
                key={item.title}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 + i * 0.08 }}
                style={{
                  display: "flex",
                  gap: "1.5rem",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    fontSize: "1.8rem",
                    flexShrink: 0,
                    marginTop: "0.2rem",
                  }}
                  aria-hidden
                >
                  {item.icon}
                </span>
                <div>
                  <h2
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 500,
                      color: "#fff",
                      marginBottom: "0.4rem",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {item.title}
                  </h2>
                  <p
                    style={{
                      fontSize: "0.92rem",
                      lineHeight: 1.7,
                      color: "rgba(255,255,255,0.52)",
                      fontWeight: 400,
                      marginBottom: "0.6rem",
                    }}
                  >
                    {item.body}
                  </p>
                  <a
                    href={item.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--lavender)",
                      fontWeight: 500,
                      letterSpacing: "0.03em",
                      borderBottom: "1px solid rgba(184, 160, 216, 0.3)",
                    }}
                  >
                    {item.link.label}
                  </a>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Membrane reminder */}
          <div
            style={{
              marginTop: "5rem",
              padding: "2rem",
              border: "1px solid rgba(184, 160, 216, 0.15)",
              borderRadius: "12px",
              background: "rgba(184, 160, 216, 0.04)",
              textAlign: "center",
              width: "100%",
            }}
          >
            <p
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--lavender)",
                fontWeight: 600,
                marginBottom: "0.6rem",
              }}
            >
              the membrane
            </p>
            <p
              style={{
                fontSize: "0.92rem",
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.45)",
                fontStyle: "italic",
              }}
            >
              The companion app stays private, local, and free — forever. The
              token, DAO, and burns are the commons that surround it, never
              the gate. Good contributions extend the mission from the outside;
              they never make the app depend on the token.
            </p>
          </div>

          {/* Footer */}
          <p
            style={{
              marginTop: "4rem",
              fontSize: "0.78rem",
              color: "rgba(255,255,255,0.25)",
              textAlign: "center",
              lineHeight: 1.7,
            }}
          >
            Questions? Want to build something together?<br />
            <a
              href={LINKS.x}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--lavender)", borderBottom: "1px solid rgba(184, 160, 216, 0.3)" }}
            >
              reach out on x
            </a>
          </p>
        </motion.div>
      </section>
    </>
  );
}