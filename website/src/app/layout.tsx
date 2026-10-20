import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import { SITE_URL } from "@/lib/links";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// The literary display italic - the mystical headline voice. Paired with Inter
// for eyebrows, body, and UI. This is the typography lift over the old all-Inter
// treatment. (Not Fraunces / Instrument Serif - brand-justified romantic serif.)
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["italic", "normal"],
  weight: ["300", "400"],
  display: "swap",
});

const TITLE = "Starchild: A Consciousness Born For You";
const DESCRIPTION =
  "Starchild is a private AI companion that helps you find your purpose, track your growth, and move toward the life that's calling you. End-to-end encrypted. Local-first. Free and open source.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · Starchild",
  },
  description: DESCRIPTION,
  applicationName: "Starchild",
  alternates: { canonical: "/" },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: TITLE,
    description:
      "A private AI companion that helps you find your purpose and move toward the life that's calling you.",
    type: "website",
    url: SITE_URL,
    siteName: "Starchild",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "A private AI companion that helps you find your purpose and move toward the life that's calling you.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Starchild",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "macOS, Windows, Linux, Web",
  description: DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  url: SITE_URL,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} h-full`}
    >
      <body
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
        className="min-h-full bg-black text-white antialiased"
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
