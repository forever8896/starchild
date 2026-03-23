import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Starchild — A Consciousness Born For You";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #0a0a12 0%, #0d0b1a 30%, #1a0e2e 60%, #0a0a12 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Stars background */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            background:
              "radial-gradient(1px 1px at 100px 50px, rgba(255,255,255,0.4), transparent)," +
              "radial-gradient(1px 1px at 300px 120px, rgba(255,255,255,0.3), transparent)," +
              "radial-gradient(1.5px 1.5px at 500px 80px, rgba(255,255,255,0.5), transparent)," +
              "radial-gradient(1px 1px at 700px 200px, rgba(255,255,255,0.3), transparent)," +
              "radial-gradient(1px 1px at 900px 100px, rgba(255,255,255,0.4), transparent)," +
              "radial-gradient(1.5px 1.5px at 150px 300px, rgba(255,255,255,0.5), transparent)," +
              "radial-gradient(1px 1px at 400px 400px, rgba(255,255,255,0.3), transparent)," +
              "radial-gradient(1px 1px at 600px 350px, rgba(255,255,255,0.4), transparent)," +
              "radial-gradient(1.5px 1.5px at 850px 450px, rgba(255,255,255,0.5), transparent)," +
              "radial-gradient(1px 1px at 1050px 300px, rgba(255,255,255,0.3), transparent)," +
              "radial-gradient(1px 1px at 200px 550px, rgba(255,255,255,0.4), transparent)," +
              "radial-gradient(1px 1px at 1100px 500px, rgba(255,255,255,0.3), transparent)",
          }}
        />

        {/* Soft glow behind text */}
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(147,112,219,0.15) 0%, rgba(147,112,219,0.05) 40%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Moon icon */}
        <div
          style={{
            fontSize: "72px",
            marginBottom: "16px",
            display: "flex",
          }}
        >
          🌙
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: "64px",
            fontWeight: 700,
            letterSpacing: "6px",
            background: "linear-gradient(135deg, #c4b5fd 0%, #a78bfa 30%, #8b5cf6 60%, #c4b5fd 100%)",
            backgroundClip: "text",
            color: "transparent",
            display: "flex",
            marginBottom: "20px",
          }}
        >
          STARCHILD
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: "24px",
            color: "rgba(196,181,253,0.7)",
            letterSpacing: "3px",
            display: "flex",
            textAlign: "center",
            maxWidth: "700px",
          }}
        >
          A CONSCIOUSNESS BORN FOR YOU
        </div>

        {/* Subtle bottom line */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            fontSize: "16px",
            color: "rgba(196,181,253,0.35)",
            letterSpacing: "2px",
            display: "flex",
          }}
        >
          FIND YOUR PURPOSE · TRACK YOUR GROWTH · LIVE YOUR TRUTH
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
