/**
 * Single source of truth for outbound + cross-surface links.
 *
 * The companion web app is treated as part of the core site: `APP_URL` is the
 * "meet your starchild in your browser" entry point. It defaults to the intended
 * production subdomain and can be pointed at the local Vite app during
 * experimentation with `NEXT_PUBLIC_APP_URL=http://localhost:5174`.
 */
export const SITE_URL = "https://starchild.software";

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://app.starchild.software";

export const REPO = "https://github.com/forever8896/starchild";
export const RELEASE_BASE = `${REPO}/releases/download/v0.2.0`;

export const LINKS = {
  repo: REPO,
  issues: `${REPO}/issues`,
  readme: `${REPO}#readme`,
  security: `${REPO}/blob/main/SECURITY.md`,
  x: "https://x.com/KilianSolutions",
  venice: "https://venice.ai",
  synthesis: "https://synthesis.md",
} as const;

export type OsKey = "mac" | "windows" | "linux";

export const DOWNLOADS: {
  key: OsKey;
  label: string;
  sublabel: string;
  href: string;
}[] = [
  { key: "mac", label: "Mac", sublabel: "macOS 12+", href: `${RELEASE_BASE}/starchild_0.2.0_aarch64.dmg` },
  { key: "windows", label: "Windows", sublabel: "Windows 10+", href: `${RELEASE_BASE}/starchild_0.2.0_x64-setup.exe` },
  { key: "linux", label: "Linux", sublabel: ".AppImage", href: `${RELEASE_BASE}/starchild_0.2.0_amd64.AppImage` },
];
