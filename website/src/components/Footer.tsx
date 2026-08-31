import Link from "next/link";
import { LINKS } from "@/lib/links";
import { COMPANY } from "@/lib/company";

/**
 * The site's single footer. (Previously duplicated across the page shell and the
 * Download section; consolidated here.)
 */
export default function Footer() {
  return (
    <footer
      className="hairline flex flex-col items-center gap-5 text-center"
      style={{ paddingBlock: "3rem", paddingInline: "var(--pad-x)" }}
      role="contentinfo"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <Link href="/origin" className="foot-link">
          origin story
        </Link>
        <span className="foot-sep">/</span>
        <Link href="/contributors" className="foot-link">
          contributors
        </Link>
        <span className="foot-sep">/</span>
        <a href={LINKS.repo} target="_blank" rel="noopener noreferrer" className="foot-link">
          github
        </a>
        <span className="foot-sep">/</span>
        <a href={LINKS.x} target="_blank" rel="noopener noreferrer" className="foot-link">
          @KilianSolutions
        </a>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <Link href="/about" className="foot-link foot-link-quiet">
          about
        </Link>
        <span className="foot-sep">/</span>
        <Link href="/contact" className="foot-link foot-link-quiet">
          contact
        </Link>
        <span className="foot-sep">/</span>
        <Link href="/privacy" className="foot-link foot-link-quiet">
          privacy
        </Link>
        <span className="foot-sep">/</span>
        <Link href="/legal" className="foot-link foot-link-quiet">
          legal
        </Link>
      </div>

      <p style={{ fontSize: "0.76rem", color: "var(--text-faint)" }}>
        powered by{" "}
        <a href={LINKS.venice} target="_blank" rel="noopener noreferrer" style={{ color: "var(--lavender)", opacity: 0.7 }}>
          venice.ai
        </a>
        {"  ·  "}
        built for the{" "}
        <a href={LINKS.synthesis} target="_blank" rel="noopener noreferrer" style={{ color: "var(--lavender)", opacity: 0.7 }}>
          synthesis hackathon
        </a>
      </p>

      <p style={{ fontSize: "0.72rem", color: "var(--text-faint)" }}>
        {COMPANY.legalName} · IČO {COMPANY.regNumber}
      </p>

      <style>{`
        .foot-link {
          font-size: 0.8rem;
          color: var(--text-muted);
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .foot-link:hover { color: var(--lavender); }
        .foot-sep { color: rgba(255,255,255,0.14); font-size: 0.8rem; }
        .foot-link-quiet { font-size: 0.74rem; color: var(--text-faint); }
        .foot-link-quiet:hover { color: var(--lavender); }
      `}</style>
    </footer>
  );
}
