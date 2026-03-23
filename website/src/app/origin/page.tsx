"use client";

import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

export default function OriginPage() {
  return (
    <>
      <Navbar />
      <section
        className="relative flex flex-col items-center overflow-hidden bg-black px-6 md:px-6"
        style={{ paddingTop: "8rem", paddingBottom: "6rem" }}
        aria-label="Origin Story"
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
          <h1
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2.4rem)",
              fontWeight: 300,
              lineHeight: 1.22,
              letterSpacing: "-0.01em",
              color: "#fff",
              fontStyle: "italic",
              marginBottom: "3rem",
              textAlign: "center",
            }}
          >
            how the starchild came to be
          </h1>

          {/* Story */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2rem",
              fontSize: "clamp(0.95rem, 1.6vw, 1.05rem)",
              lineHeight: 1.75,
              color: "rgba(255,255,255,0.52)",
              fontWeight: 400,
            }}
          >
            <p>
              When the OpenClaw craze came about, I quickly jumped on it. But I had
              one core issue with it, and that&apos;s the lack of{" "}
              <span style={{ color: "var(--lavender)" }}>privacy</span>.
            </p>

            <p>
              Having a personal AI agent with a Telegram or other social app connector
              makes the parasocial dynamics much stronger &mdash; I sensed that with
              my usage of an OpenClaw as well. But when using any regular AI provider,
              we are sending all of our data to the companies, hoping that they will
              use it justly.
            </p>

            <p style={{ color: "#fff", fontStyle: "italic", fontWeight: 300, fontSize: "clamp(1.1rem, 2vw, 1.3rem)" }}>
              Our data, our thoughts, our dreams, are the most valuable things we
              get to carry as the output of our minds.
            </p>

            <p>
              I also saw the hurdle of installation for a non-technical person.
            </p>

            <p>
              When I started my hackathon journey last year in Cannes, fate paved the
              way for me to meet with{" "}
              <a href="https://www.owenbarnes.com/" target="_blank" style={{ color: "var(--lavender)", borderBottom: "1px solid rgba(184, 160, 216, 0.3)" }}>Owen Barnes</a>,
              a fellow creative soul. We quickly
              got to build a solid friendship, and ended up travelling the world
              together, winning hackathons.
            </p>

            <p>
              We made it a habit with Owen to inform each other about the latest
              developments we are seeing in tech, and how we can put our creative
              spin on them. Once on a call, the idea and the name of{" "}
              <span style={{ color: "var(--gold)" }}>Starchild</span>{" "}
              came about &mdash; an easy-to-install executable app that gamifies
              improving one&apos;s life.
            </p>

            <p>
              Back then, I had no idea of Venice AI. Through my OpenClaw
              experimentations I discovered Venice, and at the right place and the
              right time, I stumbled upon the Synthesis hackathon.
            </p>

            <p style={{ color: "#fff", fontStyle: "italic", fontWeight: 300, fontSize: "clamp(1.1rem, 2vw, 1.3rem)" }}>
              It felt like the{" "}
              <span style={{ color: "var(--lavender)" }}>perfect</span> opportunity
              to push myself into a sprint of building the Starchild, to test out
              this idea.
            </p>
          </div>

          {/* Delusional prompt video */}
          <div style={{ marginTop: "8rem", width: "100%", textAlign: "center" }}>
            <h2
              style={{
                fontSize: "clamp(1.3rem, 2.5vw, 2rem)",
                fontWeight: 300,
                fontStyle: "italic",
                color: "#fff",
                marginBottom: "2.5rem",
                lineHeight: 1.3,
              }}
            >
              if you got this far, behold my most{" "}
              <span style={{ color: "var(--lavender)" }}>delusional</span> prompt
            </h2>
            <video
              src="/videos/delulumaxxing.mp4"
              controls
              playsInline
              style={{
                width: "100%",
                maxWidth: "640px",
                borderRadius: "12px",
                border: "1px solid rgba(74, 63, 96, 0.3)",
                margin: "0 auto",
                display: "block",
              }}
            />
          </div>

          {/* ── The Core Belief ─────────────────────────────────── */}
          <div style={{ marginTop: "8rem", width: "100%" }}>
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
              the philosophy
            </p>
            <h2
              style={{
                fontSize: "clamp(1.5rem, 3vw, 2.4rem)",
                fontWeight: 300,
                fontStyle: "italic",
                color: "#fff",
                lineHeight: 1.22,
                marginBottom: "2rem",
              }}
            >
              every human already knows{" "}
              <span style={{ color: "var(--lavender)" }}>
                the meaning of their life
              </span>
            </h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
                fontSize: "clamp(0.95rem, 1.6vw, 1.05rem)",
                lineHeight: 1.75,
                color: "rgba(255,255,255,0.52)",
                fontWeight: 400,
              }}
            >
              <p>
                They might not believe it&apos;s achievable. The gap between where
                they are and where they want to be feels too vast. So they stop
                looking at it.
              </p>
              <p>
                Starchild asks the question that reopens that gap &mdash; gently.
                Then it puts the answer on a map as soon as possible, and starts
                drawing little steps toward it. Tiny quests that build momentum,
                so the person can snowball toward their goal.
              </p>
              <p style={{ color: "#fff", fontStyle: "italic", fontWeight: 300, fontSize: "clamp(1.1rem, 2vw, 1.3rem)" }}>
                Not therapy. Not coaching. A{" "}
                <span style={{ color: "var(--gold)" }}>divinity tool</span> &mdash;
                helping a human remember who they actually are.
              </p>
              <p>
                The psychology draws from Motivational Interviewing (selective
                reflection), Clean Language (developing metaphors forward), SFBT
                (scaling questions), and ACT (values into micro-commitments). But
                the user never sees any of that. They just talk to their Starchild.
              </p>
            </div>
          </div>

          {/* ── The Technical Yapping ───────────────────────────── */}
          <div style={{ marginTop: "8rem", width: "100%" }}>
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
              how it was built
            </p>
            <h2
              style={{
                fontSize: "clamp(1.5rem, 3vw, 2.4rem)",
                fontWeight: 300,
                fontStyle: "italic",
                color: "#fff",
                lineHeight: 1.22,
                marginBottom: "2.5rem",
              }}
            >
              the technical yapping
            </h2>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.2rem",
                fontSize: "clamp(0.95rem, 1.6vw, 1.05rem)",
                lineHeight: 1.75,
                color: "rgba(255,255,255,0.52)",
                fontWeight: 400,
              }}
            >
              <p>
                Starchild images were generated using{" "}
                <span style={{ color: "var(--lavender)" }}>Nano Banana 2</span>.
                Videos using{" "}
                <span style={{ color: "var(--lavender)" }}>Kling 0.3 Pro</span>.
              </p>
              <p>
                The scaffolding was done using{" "}
                <a href="https://github.com/forever8896/agency" target="_blank" style={{ color: "var(--gold)", borderBottom: "1px solid rgba(232, 216, 168, 0.3)" }}>The Agency</a>, an open-source
                Claude Code orchestrator. The entire codebase was then built using{" "}
                <span style={{ color: "var(--gold)" }}>Claude Code</span> as the sole
                code writer and executor of the vision.
              </p>
              <p>
                As we were building, Venice released their{" "}
                <span style={{ color: "var(--lavender)" }}>end-to-end encryption</span>{" "}
                feature, which perfectly fit into Starchild&apos;s privacy-first
                architecture &mdash; so we implemented it. Every conversation is now
                encrypted on your device and only decrypted inside hardware-verified
                trusted execution environments.
              </p>
            </div>

            {/* Tech stack badges */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.6rem",
                marginTop: "2rem",
              }}
            >
              {[
                "Tauri / Rust",
                "React / TypeScript",
                "Venice AI (E2EE)",
                "Qwen 3.5 122B",
                "Base / EAS",
                "ERC-8004",
                "Cloudflare Workers",
                "Claude Code",
              ].map((label) => (
                <span
                  key={label}
                  style={{
                    display: "inline-block",
                    padding: "0.35rem 0.85rem",
                    border: "1px solid rgba(184, 160, 216, 0.25)",
                    borderRadius: "9999px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--lavender)",
                    background: "rgba(184, 160, 216, 0.06)",
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </section>
    </>
  );
}
