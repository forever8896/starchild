import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AboutView from "./AboutView";

export const metadata: Metadata = {
  title: "About",
  description:
    "Starchild is a free, open-source, local-first AI companion for macOS, Windows and Linux. Who builds it, where it came from, and the company behind it.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <AboutView />
      <Footer />
    </>
  );
}
