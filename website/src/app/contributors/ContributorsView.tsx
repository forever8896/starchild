"use client";

import { motion } from "framer-motion";
import { LINKS } from "@/lib/links";

const fadeUp = {
  hidden: { opacity: 0, y: 34 },
  visible: { opacity: 1, y: 0 },
};

const ease = [0.16, 1, 0.3, 1] as const;

const ways = [
  {
    title: "write code",
    body: "The whole Starchild stack is open: Tauri/Rust backend, React frontend, and the Next.js sites. Pick an issue, fork, build, and open a PR.",
    link: { href: LINKS.issues, label: "browse open issues" },
  },
  {
    title: "audit the privacy",
    body: "Everything Starchild promises rests on its cryptography. Read the encryption path, probe the enclave attestation, and tell us where it is weaker than we claim. Responsible disclosure is in SECURITY.md.",
    link: { href: LINKS.security, label: "read the security policy" },
  },
  {
    title: "design & art",
    body: "Starchild is a visual, cinematic project. Illustration, motion, UI polish, branding: if you have an eye for it, the experience can always be more beautiful.",
    link: { href: LINKS.issues, label: "open an issue" },
  },
  {
    title: "test and report bugs",
    body: "Run the app, push it to its edges, and open an issue when something breaks. Every bug report makes Starchild stronger.",
    link: { href: LINKS.issues, label: "open an issue" },
  },
  {
    title: "improve the docs",
    body: "Docs are never done. If something was confusing, unclear, or missing, fix it. The README and architecture docs all live in the repo.",
    link: { href: LINKS.readme, label: "read the docs" },
  },
  {
    title: "spread the word",
    body: "Tell someone who needs this. Share the origin story. The best growth is word-of-mouth from people who believe in the mission.",
    link: { href: LINKS.x, label: "follow the founder" },
  },
];

export default function ContributorsView() {
  return (
    <section
      className="relative flex flex-col items-center overflow-hidden bg-black"
      style={{ paddingTop: "8rem", paddingBottom: "6rem", paddingInline: "var(--pad-x)" }}
      aria-label="Contributors"
    >
      <div
        className="aurora"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 20%, rgba(30, 10, 60, 0.55), transparent 70%)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-[62rem] flex-col items-center">
        <motion.p className="eyebrow" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}>
          contributors
        </motion.p>
        <motion.h1
          className="font-display mt-4 text-center"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease, delay: 0.1 }}
          style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)", lineHeight: 1.14, color: "#fff" }}
        >
          this is not a <span className="accent">one-person</span> project
        </motion.h1>
        <motion.p
          className="lead mt-5 max-w-xl text-center"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease, delay: 0.2 }}
          style={{ fontSize: "clamp(0.98rem, 1.5vw, 1.08rem)" }}
        >
          Starchild is open source from the Rust core to this website. The app,
          the cryptography, the design, the docs: each layer has a place for you,
          whether you write code, break things on purpose, or simply believe in
          it.
        </motion.p>

        {/* Ways to contribute */}
        <div className="mt-16 grid w-full gap-5 sm:grid-cols-2">
          {ways.map((item, i) => (
            <motion.div
              key={item.title}
              className="card flex flex-col"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, ease, delay: 0.05 + (i % 2) * 0.08 }}
              style={{ padding: "1.75rem" }}
            >
              <h2 style={{ fontSize: "1.1rem", fontWeight: 500, color: "#fff", marginBottom: "0.6rem", letterSpacing: "-0.01em" }}>
                {item.title}
              </h2>
              <p className="lead" style={{ fontSize: "0.92rem", marginBottom: "1rem", flex: 1 }}>
                {item.body}
              </p>
              <a
                href={item.link.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "0.78rem", color: "var(--lavender)", fontWeight: 500, letterSpacing: "0.03em" }}
              >
                {item.link.label} &rsaquo;
              </a>
            </motion.div>
          ))}
        </div>

        {/* The membrane */}
        <motion.div
          className="card mt-16 w-full text-center"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease }}
          style={{ padding: "2.25rem" }}
        >
          <p className="eyebrow" style={{ marginBottom: "0.8rem" }}>
            the promise
          </p>
          <p className="font-display" style={{ fontSize: "clamp(1rem, 1.8vw, 1.2rem)", lineHeight: 1.5, color: "var(--text-body)" }}>
            The companion app stays private, local, and free, forever. No account,
            no subscription, no upsell standing between a person and the question
            that reopens their life. Contributions extend the mission; they never
            become a gate in front of it.
          </p>
        </motion.div>

        <p className="mt-16 text-center" style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
          Questions? Want to build something together?
          <br />
          <a href={LINKS.x} target="_blank" rel="noopener noreferrer" style={{ color: "var(--lavender)", borderBottom: "1px solid var(--line-strong)" }}>
            reach out on x
          </a>
        </p>
      </div>
    </section>
  );
}
