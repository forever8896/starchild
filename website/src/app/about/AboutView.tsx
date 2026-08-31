"use client";

import Link from "next/link";
import PageShell, { DetailRow, Rubric } from "@/components/PageShell";
import { COMPANY, ADDRESS_INLINE } from "@/lib/company";
import { LINKS } from "@/lib/links";

export default function AboutView() {
  return (
    <PageShell
      title="about starchild"
      intro="A small software company building a private AI companion that runs on your own machine."
    >
      <p>
        Starchild is a desktop application for macOS, Windows and Linux. It helps
        people describe the life they actually want, maps that answer onto a
        vision tree, and breaks the distance between here and there into small,
        specific quests. It is free, it is{" "}
        <a href={LINKS.repo} target="_blank" rel="noopener noreferrer" className="accent">
          open source
        </a>
        , and it is built so that the most personal thing a person can type —
        what they would do if nothing were in the way — never becomes someone
        else&apos;s training data.
      </p>

      <Rubric>what we build</Rubric>

      <p>
        The product is a Tauri and Rust application with a React front end,
        shipping today as version 0.2.0 on all three desktop platforms. Every
        conversation is encrypted on the user&apos;s device and decrypted only
        inside hardware-verified trusted execution environments, so no operator
        in the chain — ourselves included — can read it. Conversation state lives
        locally in the user&apos;s own database file, not in our infrastructure.
      </p>

      <p>
        That architecture is the whole thesis. A companion that asks people the
        questions they have been avoiding is only useful if they can be honest
        with it, and honesty requires a guarantee stronger than a promise in a
        privacy policy. We would rather carry the engineering cost of
        attestation than ask anyone to trust us.
      </p>

      <Rubric>who builds it</Rubric>

      <p>
        Starchild is built by {COMPANY.founder}, working with Owen Barnes, whom
        he met on the hackathon circuit in Cannes and has been building alongside
        since. The project began during{" "}
        <a href={LINKS.synthesis} target="_blank" rel="noopener noreferrer" className="accent">
          The Synthesis hackathon
        </a>{" "}
        and has continued past it. Development happens in the open — the full
        stack, from the Rust core to this website, is public, and{" "}
        <Link href="/contributors" className="accent">
          contributions are welcome
        </Link>
        . The{" "}
        <Link href="/origin" className="accent">
          origin story
        </Link>{" "}
        has the longer version.
      </p>

      <Rubric>the company</Rubric>

      <p>
        Starchild is operated by {COMPANY.legalName}, a sole trader registered
        in {COMPANY.countryLabel}, trading since {COMPANY.founded}.
      </p>

      <div className="flex flex-col" style={{ marginTop: "0.5rem" }}>
        <DetailRow label="Legal name" value={COMPANY.legalName} />
        <DetailRow label="Registration no." value={COMPANY.regNumber} />
        {COMPANY.vatId ? <DetailRow label="VAT ID" value={COMPANY.vatId} /> : null}
        <DetailRow label="Registered seat" value={ADDRESS_INLINE} />
        <DetailRow
          label="Contact"
          value={
            <a href={`mailto:${COMPANY.email}`} className="accent">
              {COMPANY.email}
            </a>
          }
        />
      </div>

      <p style={{ marginTop: "0.5rem" }}>
        Full statutory details are on the{" "}
        <Link href="/legal" className="accent">
          legal page
        </Link>
        , and anything else reaches us at{" "}
        <Link href="/contact" className="accent">
          contact
        </Link>
        .
      </p>
    </PageShell>
  );
}
