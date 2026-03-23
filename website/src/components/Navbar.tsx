"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const isOrigin = pathname === "/origin";

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-4 md:px-8 md:py-8">
      <Link href="/">
        <Image
          src="/starchild-logo.png"
          alt="Starchild"
          width={120}
          height={36}
          priority
          className="w-20 md:w-30"
          style={{ objectFit: "contain", opacity: 0.85 }}
        />
      </Link>

      <Link
        href={isOrigin ? "/" : "/origin"}
        style={{
          fontSize: "0.75rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--lavender)",
          fontWeight: 600,
          opacity: 0.5,
          transition: "opacity 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
        title={isOrigin ? "back to starchild" : "how the starchild came to be"}
      >
        {isOrigin ? "home" : "origin story"}
      </Link>
    </div>
  );
}
