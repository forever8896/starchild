"use client";

import Link from "next/link";
import PageShell, { DetailRow, Rubric } from "@/components/PageShell";
import { COMPANY } from "@/lib/company";
import { LINKS, SITE_URL } from "@/lib/links";

export default function LegalView() {
  return (
    <PageShell
      title="legal"
      intro="Statutory disclosure for the business that operates Starchild and this website."
    >
      <div className="flex flex-col">
        <DetailRow label="Operator" value={COMPANY.legalName} />
        <DetailRow label="Trading as" value={COMPANY.tradeName} />
        <DetailRow label="Registration no. (IČO)" value={COMPANY.regNumber} />
        <DetailRow
          label="VAT (DIČ)"
          value={
            COMPANY.vatRegistered
              ? "Registered — number stated on invoices"
              : "Not registered for VAT"
          }
        />
        <DetailRow label="Entered in" value={COMPANY.register} />
        <DetailRow
          label="Registered seat"
          value={
            <span style={{ whiteSpace: "pre-line" }}>{COMPANY.address.join("\n")}</span>
          }
        />
        <DetailRow label="Represented by" value={COMPANY.founder} />
        <DetailRow
          label="Email"
          value={
            <a href={`mailto:${COMPANY.email}`} className="accent">
              {COMPANY.email}
            </a>
          }
        />
        <DetailRow label="Website" value={SITE_URL} />
      </div>

      <Rubric>the software</Rubric>

      <p>
        The Starchild application is published as open source. The authoritative
        copy of the source, the release binaries and the licence under which both
        are offered live in the{" "}
        <a href={LINKS.repo} target="_blank" rel="noopener noreferrer" className="accent">
          public repository
        </a>
        . Where the licence in that repository and anything written here differ,
        the licence governs.
      </p>

      <p>
        The application is provided as-is, without warranty. Starchild is a tool
        for reflection and self-directed growth. It is not a medical device, it
        does not provide medical, psychological or crisis care, and it is not a
        substitute for a qualified professional. If you are in crisis, please
        contact your local emergency services or a crisis line.
      </p>

      <Rubric>content and marks</Rubric>

      <p>
        The Starchild name, logo and the artwork on this site belong to{" "}
        {COMPANY.legalName} unless stated otherwise. The source code is governed
        by its own licence, which is more permissive than this paragraph — read
        the repository, not this sentence, before reusing code.
      </p>

      <Rubric>data protection</Rubric>

      <p>
        How this website and the application handle personal data — which is to
        say, how little of it they touch — is set out on the{" "}
        <Link href="/privacy" className="accent">
          privacy page
        </Link>
        .
      </p>

      <Rubric>disputes</Rubric>

      <p>
        Write to us first at{" "}
        <a href={`mailto:${COMPANY.email}`} className="accent">
          {COMPANY.email}
        </a>
        ; most things end there. Consumers in the EU may also use the European
        Commission&apos;s online dispute resolution platform at{" "}
        <a
          href="https://ec.europa.eu/consumers/odr"
          target="_blank"
          rel="noopener noreferrer"
          className="accent"
        >
          ec.europa.eu/consumers/odr
        </a>
        . We are not obliged to participate in arbitration before a consumer
        arbitration board, and do not currently do so.
      </p>
    </PageShell>
  );
}
