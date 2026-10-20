"use client";

import { motion } from "framer-motion";
import { LINKS } from "@/lib/links";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

const ease = [0.16, 1, 0.3, 1] as const;

const STACK = [
  "Tauri / Rust",
  "React / TypeScript",
  "WASM Core",
  "Venice AI (E2EE)",
  "GLM-4.7",
  "Next.js",
  "Claude Code",
];

export default function OriginView() {
  return (
    <section
      className="relative flex flex-col items-center overflow-hidden bg-black"
      style={{ paddingTop: "8rem", paddingBottom: "6rem", paddingInline: "var(--pad-x)" }}
      aria-label="Origin story"
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
        className="relative z-10 flex w-full max-w-2xl flex-col items-center"
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.9, ease }}
      >
        <h1
          className="font-display text-center"
          style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)", lineHeight: 1.14, color: "#fff", marginBottom: "3rem" }}
        >
          how the starchild came to be
        </h1>

        <div className="lead flex flex-col gap-8" style={{ fontSize: "clamp(0.98rem, 1.5vw, 1.08rem)" }}>
          <p>
            When the OpenClaw craze came about, I quickly jumped on it. But I had
            one core issue with it, and that&apos;s the lack of{" "}
            <span className="accent">privacy</span>.
          </p>

          <p>
            Having a personal AI agent with a Telegram or other social app
            connector makes the parasocial dynamics much stronger, and I sensed
            that with my usage of an OpenClaw as well. But when using any regular
            AI provider, we are sending all of our data to the companies, hoping
            that they will use it justly.
          </p>

          <p className="font-display" style={{ color: "#fff", fontSize: "clamp(1.15rem, 2vw, 1.4rem)", lineHeight: 1.4 }}>
            Our data, our thoughts, our dreams, are the most valuable things we
            get to carry as the output of our minds.
          </p>

          <p>I also saw the hurdle of installation for a non-technical person.</p>

          <p>
            When I started my hackathon journey last year in Cannes, fate paved
            the way for me to meet with{" "}
            <a href="https://www.owenbarnes.com/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--lavender)", borderBottom: "1px solid var(--line-strong)" }}>
              Owen Barnes
            </a>
            , a fellow creative soul. We quickly got to build a solid friendship,
            and ended up travelling the world together, winning hackathons.
          </p>

          <p>
            We made it a habit with Owen to inform each other about the latest
            developments we are seeing in tech, and how we can put our creative
            spin on them. Once on a call, the idea and the name of{" "}
            <span className="accent-gold">Starchild</span>{" "}came about: an
            easy-to-install executable app that gamifies improving one&apos;s
            life.
          </p>

          <p>
            Back then, I had no idea of Venice AI. Through my OpenClaw
            experimentations I discovered Venice, and at the right place and the
            right time, I stumbled upon the Synthesis hackathon.
          </p>

          <p className="font-display" style={{ color: "#fff", fontSize: "clamp(1.15rem, 2vw, 1.4rem)", lineHeight: 1.4 }}>
            It felt like the <span className="accent">perfect</span> opportunity
            to push myself into a sprint of building the Starchild, to test out
            this idea.
          </p>
        </div>

        {/* Delusional prompt video */}
        <div style={{ marginTop: "8rem", width: "100%", textAlign: "center" }}>
          <h2
            className="font-display"
            style={{ fontSize: "clamp(1.4rem, 2.6vw, 2.1rem)", color: "#fff", marginBottom: "2.5rem", lineHeight: 1.3 }}
          >
            if you got this far, behold my most{" "}
            <span className="accent">delusional</span> prompt
          </h2>
          <video
            src="/videos/delulumaxxing.mp4"
            controls
            playsInline
            style={{
              width: "100%",
              maxWidth: "640px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line)",
              margin: "0 auto",
              display: "block",
            }}
          />
        </div>

        {/* The philosophy */}
        <div style={{ marginTop: "8rem", width: "100%" }}>
          <p className="eyebrow" style={{ marginBottom: "1rem" }}>
            the philosophy
          </p>
          <h2
            className="font-display"
            style={{ fontSize: "clamp(1.7rem, 3.4vw, 2.6rem)", color: "#fff", lineHeight: 1.16, marginBottom: "2rem" }}
          >
            every human already knows{" "}
            <span className="accent">the meaning of their life</span>
          </h2>
          <div className="lead flex flex-col gap-6" style={{ fontSize: "clamp(0.98rem, 1.5vw, 1.08rem)" }}>
            <p>
              They might not believe it&apos;s achievable. The gap between where
              they are and where they want to be feels too vast. So they stop
              looking at it.
            </p>
            <p>
              Starchild asks the question that reopens that gap, gently. Then it
              puts the answer on a map as soon as possible, and starts drawing
              little steps toward it. Tiny quests that build momentum, so the
              person can snowball toward their goal.
            </p>
            <p className="font-display" style={{ color: "#fff", fontSize: "clamp(1.15rem, 2vw, 1.4rem)", lineHeight: 1.4 }}>
              Not therapy. Not coaching. A{" "}
              <span className="accent-gold">divinity tool</span>, helping a human
              remember who they actually are.
            </p>
            <p>
              The psychology draws from Motivational Interviewing (selective
              reflection), Clean Language (developing metaphors forward), SFBT
              (scaling questions), and ACT (values into micro-commitments). But
              the user never sees any of that. They just talk to their Starchild.
            </p>
          </div>
        </div>

        {/* How it was built */}
        <div style={{ marginTop: "8rem", width: "100%" }}>
          <p className="eyebrow" style={{ marginBottom: "1rem" }}>
            how it was built
          </p>
          <h2
            className="font-display"
            style={{ fontSize: "clamp(1.7rem, 3.4vw, 2.6rem)", color: "#fff", lineHeight: 1.16, marginBottom: "2.5rem" }}
          >
            the technical yapping
          </h2>

          <div className="lead flex flex-col gap-5" style={{ fontSize: "clamp(0.98rem, 1.5vw, 1.08rem)" }}>
            <p>
              Starchild images were generated using{" "}
              <span className="accent">Nano Banana 2</span>. Videos using{" "}
              <span className="accent">Kling 0.3 Pro</span>.
            </p>
            <p>
              The scaffolding was done using{" "}
              <a href="https://github.com/forever8896/agency" target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)", borderBottom: "1px solid rgba(232, 216, 168, 0.3)" }}>
                The Agency
              </a>
              , an open-source Claude Code orchestrator. The entire codebase was
              then built using <span className="accent-gold">Claude Code</span> as
              the sole code writer and executor of the vision.
            </p>
            <p>
              As we were building, Venice released their{" "}
              <span className="accent">end-to-end encryption</span> feature, which
              perfectly fit into Starchild&apos;s privacy-first architecture, so
              we implemented it. Every conversation is now encrypted on your
              device and only decrypted inside hardware-verified trusted execution
              environments.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-2.5">
            {STACK.map((label) => (
              <span key={label} className="pill">
                {label}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      <p className="mt-24" style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>
        want to build something together?{" "}
        <a href={LINKS.x} target="_blank" rel="noopener noreferrer" style={{ color: "var(--lavender)", borderBottom: "1px solid var(--line-strong)" }}>
          reach out on x
        </a>
      </p>
    </section>
  );
}
