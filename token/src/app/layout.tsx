import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://token.starchild.software"),
  title: "$STARCHILD — burns & governance",
  description:
    "Stake $STARCHILD to govern what gets built next for the open-source Starchild companion. Gasless votes, on-chain burns. The token funds the mission — it never touches the product.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "$STARCHILD — burns & governance",
    description:
      "Stake to govern what gets built next. The token funds the mission; the product stays private, local & free.",
    type: "website",
    siteName: "Starchild Token",
  },
  twitter: {
    card: "summary_large_image",
    title: "$STARCHILD — burns & governance",
    description:
      "Stake to govern what gets built next. The token funds the mission; the product stays private, local & free.",
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
