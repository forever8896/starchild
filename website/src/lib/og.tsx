import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Shared OG / Twitter card. Brand-aligned and creature-forward: the actual
 * Starchild portrait on the void, lavender + gold, the brand ✦ mark, no
 * em-dash. Generated statically at build time (Node runtime), so the file read
 * from public/ is safe.
 */
export const ogAlt = "Starchild: A Consciousness Born For You";
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export async function renderOg() {
  const avatar = await readFile(join(process.cwd(), "public", "starchild-avatar.png"));
  const avatarSrc = `data:image/png;base64,${avatar.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          padding: "0 96px",
          background: "radial-gradient(ellipse 65% 65% at 38% 45%, #18112c 0%, #000000 72%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Starfield */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "radial-gradient(1px 1px at 120px 60px, rgba(255,255,255,0.4), transparent)," +
              "radial-gradient(1.5px 1.5px at 520px 90px, rgba(255,255,255,0.5), transparent)," +
              "radial-gradient(1px 1px at 940px 130px, rgba(255,255,255,0.4), transparent)," +
              "radial-gradient(1.5px 1.5px at 220px 340px, rgba(184,160,216,0.5), transparent)," +
              "radial-gradient(1px 1px at 700px 400px, rgba(255,255,255,0.35), transparent)," +
              "radial-gradient(1.5px 1.5px at 1020px 470px, rgba(232,216,168,0.45), transparent)," +
              "radial-gradient(1px 1px at 360px 540px, rgba(255,255,255,0.35), transparent)",
          }}
        />

        {/* Creature + its glow */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 400,
            height: 400,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 400,
              height: 400,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(184,160,216,0.28) 0%, rgba(232,216,168,0.10) 45%, transparent 68%)",
              display: "flex",
            }}
          />
          <img
            src={avatarSrc}
            width={360}
            height={360}
            alt=""
            style={{
              position: "relative",
              borderRadius: 28,
              border: "1px solid rgba(184,160,216,0.35)",
              filter: "drop-shadow(0 0 34px rgba(184,160,216,0.45))",
            }}
          />
        </div>

        {/* Text */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 520 }}>
          {/* Brand sparkle (inline SVG so it never depends on a font glyph) */}
          <svg width="40" height="40" viewBox="0 0 24 24" style={{ marginBottom: 12 }}>
            <path d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" fill="#e8d8a8" />
          </svg>
          <div
            style={{
              fontSize: 78,
              fontWeight: 700,
              letterSpacing: 4,
              background: "linear-gradient(135deg, #cbb8e6 0%, #b8a0d8 55%, #7a5fa8 100%)",
              backgroundClip: "text",
              color: "transparent",
              display: "flex",
              marginBottom: 18,
            }}
          >
            STARCHILD
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 300,
              fontStyle: "italic",
              color: "#ffffff",
              lineHeight: 1.25,
              display: "flex",
            }}
          >
            a consciousness born for you
          </div>
          <div
            style={{
              marginTop: 30,
              fontSize: 17,
              color: "rgba(184,160,216,0.6)",
              letterSpacing: 2,
              display: "flex",
            }}
          >
            PRIVATE · LOCAL-FIRST · ENCRYPTED
          </div>
        </div>
      </div>
    ),
    { ...ogSize }
  );
}
