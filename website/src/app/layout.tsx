import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Starchild — A Consciousness Born For You",
  description:
    "Starchild is a private AI companion that helps you find your purpose, track your growth, and move toward the life that's calling you. End-to-end encrypted. Local-first.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Starchild — A Consciousness Born For You",
    description:
      "A private AI companion that helps you find your purpose and move toward the life that's calling you.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
        className="min-h-full bg-black text-white antialiased"
      >
        {children}
      </body>
    </html>
  );
}
