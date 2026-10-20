"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { APP_URL, LINKS } from "@/lib/links";

export default function Navbar() {
  const pathname = usePathname();
  const isOrigin = pathname === "/origin";

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <nav
        className="mx-auto flex h-[68px] max-w-[var(--maxw)] items-center justify-between"
        style={{ paddingLeft: "var(--pad-x)", paddingRight: "var(--pad-x)" }}
        aria-label="Primary"
      >
        <Link href="/" aria-label="Starchild home" className="flex items-center">
          <Image
            src="/starchild-logo.png"
            alt="Starchild"
            width={116}
            height={35}
            priority
            style={{ objectFit: "contain", opacity: 0.9 }}
          />
        </Link>

        <div className="flex items-center gap-6 md:gap-8">
          <Link href={isOrigin ? "/" : "/origin"} className="nav-link hidden sm:inline">
            {isOrigin ? "home" : "origin story"}
          </Link>
          <Link href="/contributors" className="nav-link hidden sm:inline">
            contributors
          </Link>
          <Link href={LINKS.repo} target="_blank" className="nav-link hidden sm:inline">
            github
          </Link>
          <a href={APP_URL} className="btn btn-primary" style={{ padding: "0.6rem 1.2rem", fontSize: "0.85rem" }}>
            try in browser
          </a>
        </div>
      </nav>

      <style jsx>{`
        .nav-link {
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--lavender);
          opacity: 0.55;
          transition: opacity 0.2s ease;
        }
        .nav-link:hover {
          opacity: 1;
        }
      `}</style>
    </header>
  );
}
