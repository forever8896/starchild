"use client";

import PageShell, { Rubric } from "@/components/PageShell";
import { COMPANY } from "@/lib/company";
import { LINKS } from "@/lib/links";

/** Bump when the substance changes, not for typo fixes. */
const LAST_UPDATED = "31 August 2026";

export default function PrivacyView() {
  return (
    <PageShell
      title="privacy"
      intro="The short version: your conversations are encrypted on your device, they live on your device, and we cannot read them."
    >
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Last updated {LAST_UPDATED}. Controller: {COMPANY.legalName},{" "}
        {COMPANY.address.join(", ")} — {COMPANY.email}.
      </p>

      <Rubric>this website</Rubric>

      <p>
        starchild.software sets no cookies, runs no analytics, embeds no tracking
        pixels and has no accounts, forms or server endpoints of its own. There is
        nothing here to opt out of, which is why you were never shown a consent
        banner.
      </p>

      <p>
        The site is served by Vercel from their Frankfurt region. Like any web
        host, Vercel processes standard request data — IP address, user agent,
        the URL requested — to deliver pages and defend against abuse. That is
        their processing as our hosting provider, retained on their schedule, and
        we do not build profiles from it or receive it as a dataset. Downloading
        a release sends you to GitHub, whose own terms then apply.
      </p>

      <Rubric>the application</Rubric>

      <p>
        Starchild runs on your computer. Your conversations, your vision tree,
        your quests and your progress are written to a local database file in
        your own user directory. They are not uploaded to us, we hold no copy,
        and there is no account to create — we do not know who you are.
      </p>

      <p>
        To answer you, the app sends the text of a conversation to{" "}
        <a href={LINKS.venice} target="_blank" rel="noopener noreferrer" className="accent">
          Venice AI
        </a>
        , which provides the language model. That transmission is end-to-end
        encrypted: the message is encrypted on your device and decrypted only
        inside a hardware-verified trusted execution environment whose attestation
        the client checks. Venice operates a zero-retention policy for these
        requests. The practical effect is that neither we nor Venice can read
        what you write, and neither of us can hand it to anyone who asks.
      </p>

      <p>
        We would rather be precise than reassuring, so: this protection rests on
        the correctness of the enclave attestation and on Venice honouring
        zero-retention. Those are engineering and contractual guarantees, not
        laws of physics. They are considerably stronger than a promise not to
        look, which is what most assistants offer, but they are not magic.
      </p>

      <Rubric>deleting everything</Rubric>

      <p>
        Delete the application&apos;s data directory and your history is gone —
        there is no server-side copy to chase, and no request to us is needed.
        Because we hold no personal data about you, requests for access,
        rectification, erasure or portability have nothing to act on; we will
        confirm that in writing if you want it on record. If you believe we have
        got any of this wrong, you may complain to your national data protection
        authority, and we would appreciate hearing from you first at{" "}
        <a href={`mailto:${COMPANY.email}`} className="accent">
          {COMPANY.email}
        </a>
        .
      </p>

      <Rubric>children</Rubric>

      <p>
        Starchild is not intended for anyone under 16.
      </p>

      <Rubric>wallets and blockchains</Rubric>

      <p>
        The companion app does not connect to a wallet, does not read one if you
        have one, and never writes anything about you to a blockchain. Community
        projects around Starchild that do involve on-chain activity are operated
        separately, on their own sites and under their own terms; nothing in the
        app depends on them.
      </p>

      <Rubric>changes</Rubric>

      <p>
        If this policy changes in substance we will update the date above and note
        it in the release notes. Since the site keeps no mailing list, the
        repository is the place to watch.
      </p>
    </PageShell>
  );
}
