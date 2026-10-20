"use client";

import PageShell, { Rubric } from "@/components/PageShell";
import { COMPANY } from "@/lib/company";

/** Bump when the protocol changes, not for typo fixes. */
const LAST_UPDATED = "20 October 2026";

export default function SafetyView() {
  return (
    <PageShell
      title="safety"
      intro="Starchild is an AI companion for finding your purpose. It is not a person, not a therapist, and not a crisis service. This page is our protocol for the moments when someone needs more than a companion."
    >
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Last updated {LAST_UPDATED}. Operator: {COMPANY.legalName} — {COMPANY.email}.
      </p>

      <Rubric>who starchild is for</Rubric>

      <p>
        Starchild is for adults. Before the first conversation, everyone confirms
        they are 18 or older and that they understand Starchild is an AI, not
        therapy. Starchild does not diagnose, treat or provide mental health care,
        and it never presents itself as a human.
      </p>

      <Rubric>you always know it&apos;s an AI</Rubric>

      <p>
        Every session opens with a plain notice that you are talking to an AI, and
        the notice returns at least every three hours in a long session.
      </p>

      <Rubric>when someone may be in crisis</Rubric>

      <p>
        Every message you write is checked, on your own device, for language that
        suggests suicidal thoughts, self-harm, or intent to harm someone else. The
        check is deliberately sensitive: showing help when it wasn&apos;t strictly
        needed costs little, and missing someone costs a great deal. When it fires:
      </p>

      <ul style={{ listStyle: "disc", paddingLeft: "1.25rem", display: "grid", gap: "0.6rem" }}>
        <li>
          Real human help lines appear on screen at once — chosen for your region
          where we can tell it from your device&apos;s language settings, and always
          including a worldwide directory (findahelpline.com) and emergency
          services. They appear even if the AI can&apos;t be reached.
        </li>
        <li>
          The game stops. Starchild offers no quests, places nothing on your vision
          tree, and does not reinterpret what you said as a goal or a metaphor.
        </li>
        <li>
          Starchild is instructed to respond plainly and warmly: to acknowledge the
          pain, to say that you matter, and to encourage you to reach a real person
          — a crisis line, someone you trust, or emergency services.
        </li>
        <li>
          This state stays on for the next few messages rather than lifting the
          moment a reply sounds calmer.
        </li>
        <li>
          What you shared is not mined into Starchild&apos;s picture of you.
        </li>
      </ul>

      <Rubric>what we can and can&apos;t see</Rubric>

      <p>
        Your conversations are end-to-end encrypted and stored only on your
        device, so we never see them — including a crisis. That means we cannot
        contact you, and no one at Starchild will. If you are in immediate danger,
        please call your local emergency number (112 · 911 · 999) now.
      </p>

      <Rubric>help lines</Rubric>

      <ul style={{ listStyle: "disc", paddingLeft: "1.25rem", display: "grid", gap: "0.6rem" }}>
        <li>US &amp; Canada — 988 Suicide &amp; Crisis Lifeline: call or text 988</li>
        <li>US — Crisis Text Line: text HOME to 741741</li>
        <li>UK &amp; Ireland — Samaritans: 116 123</li>
        <li>UK — Shout: text SHOUT to 85258</li>
        <li>
          Anywhere —{" "}
          <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer" className="accent">
            findahelpline.com
          </a>{" "}
          lists free, confidential lines by country
        </li>
      </ul>

      <p>
        If you think we&apos;ve got any of this wrong, or Starchild responded badly
        in a hard moment, please tell us at{" "}
        <a href={`mailto:${COMPANY.email}`} className="accent">
          {COMPANY.email}
        </a>
        . We read every message.
      </p>
    </PageShell>
  );
}
