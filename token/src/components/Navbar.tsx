"use client";

import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  const linkStyle = {
    fontSize: "0.75rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "var(--lavender)",
    fontWeight: 600,
    opacity: 0.5,
    transition: "opacity 0.2s",
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between"
      style={{ padding: "32px" }}
    >
      {/* Logo → the token home */}
      <Link href="/">
        <Image
          src="/starchild-logo.png"
          alt="Starchild"
          width={120}
          height={36}
          priority
          style={{ objectFit: "contain", opacity: 0.85 }}
        />
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        <Link
          href="/dao"
          style={linkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
          title="help shape what gets built"
        >
          dao
        </Link>
        <Link
          href="https://starchild.software"
          target="_blank"
          style={linkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
          title="the private companion"
        >
          the app
        </Link>
        <Link
          href="https://github.com/forever8896/starchild"
          target="_blank"
          style={linkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
        >
          github
        </Link>
      </div>
    </div>
  );
}
