import type { Metadata } from "next";
import "./globals.css";

const FONT_STACK =
  "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const metadata: Metadata = {
  metadataBase: new URL("https://token.starchild.software"),
  title: "$STARCHILD — back & shape the mission",
  description:
    "Starchild is a private, open-source companion that helps you find your life's purpose — free for everyone. $STARCHILD is how you back the mission and help shape where it goes: an open forum, on-chain burns, a fee-funded incentive fund.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "$STARCHILD — back & shape the mission",
    description:
      "The app is free for everyone. The token is how you back the mission and help shape where it goes — read the burns, join the forum.",
    type: "website",
    siteName: "Starchild Token",
  },
  twitter: {
    card: "summary_large_image",
    title: "$STARCHILD — back & shape the mission",
    description:
      "The app is free for everyone. The token is how you back the mission and help shape where it goes — read the burns, join the forum.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Albert+Sans:ital,wght@0,200;0,300;0,400;0,500;1,200;1,300;1,400&family=Hanken+Grotesk:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{ fontFamily: FONT_STACK }}
        className="min-h-full bg-black text-white antialiased"
      >
        {children}
      </body>
    </html>
  );
}
