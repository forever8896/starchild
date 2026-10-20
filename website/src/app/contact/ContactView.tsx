"use client";

import PageShell, { DetailRow, Rubric } from "@/components/PageShell";
import { COMPANY, ADDRESS_INLINE } from "@/lib/company";
import { LINKS } from "@/lib/links";

export default function ContactView() {
  return (
    <PageShell
      title="get in touch"
      intro="A real person reads everything that arrives here."
    >
      <div className="flex flex-col">
        <DetailRow
          label="Email"
          value={
            <a href={`mailto:${COMPANY.email}`} className="accent">
              {COMPANY.email}
            </a>
          }
        />
        <DetailRow
          label="On X"
          value={
            <a href={LINKS.x} target="_blank" rel="noopener noreferrer" className="accent">
              @KilianSolutions
            </a>
          }
        />
        <DetailRow
          label="Bugs & features"
          value={
            <a href={LINKS.issues} target="_blank" rel="noopener noreferrer" className="accent">
              GitHub issues
            </a>
          }
        />
        <DetailRow label="Postal" value={ADDRESS_INLINE} />
      </div>

      <Rubric>something broken?</Rubric>

      <p>
        Open an issue on{" "}
        <a href={LINKS.issues} target="_blank" rel="noopener noreferrer" className="accent">
          GitHub
        </a>{" "}
        — it is the fastest route, and it leaves a record other people with the
        same problem can find. Include your operating system and the version you
        are running.
      </p>

      <Rubric>found a security flaw?</Rubric>

      <p>
        Please do not open a public issue. Write to{" "}
        <a href={`mailto:${COMPANY.email}`} className="accent">
          {COMPANY.email}
        </a>{" "}
        with the details and we will acknowledge within 72 hours. Starchild
        handles people&apos;s most private thoughts; a vulnerability report is the
        most valuable thing you can send us, and we will credit you unless you
        would rather we did not.
      </p>

      <Rubric>press, partnerships, everything else</Rubric>

      <p>
        Same address. {COMPANY.legalName} is a small operation, so the answer may
        take a few days, but it will come from a human.
      </p>
    </PageShell>
  );
}
