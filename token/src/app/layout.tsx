import type { Metadata } from "next";
import "./globals.css";

const FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const metadata: Metadata = {
  metadataBase: new URL("https://token.starchild.software"),
  title: "$STARCHILD — back & shape the mission",
  description:
    "Starchild is a private, open-source companion that helps you find your life's purpose — free for everyone. $STARCHILD is how you back the mission and help shape what gets built: gasless stake-to-govern, on-chain burns.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "$STARCHILD — back & shape the mission",
    description:
      "The app is free for everyone. The token is how you back the mission and help shape what gets built — stake to have a say.",
    type: "website",
    siteName: "Starchild Token",
  },
  twitter: {
    card: "summary_large_image",
    title: "$STARCHILD — back & shape the mission",
    description:
      "The app is free for everyone. The token is how you back the mission and help shape what gets built — stake to have a say.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        style={{ fontFamily: FONT_STACK }}
        className="min-h-full bg-black text-white antialiased"
      >
        {children}
      </body>
    </html>
  );
}
