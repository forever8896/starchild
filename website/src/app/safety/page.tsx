import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SafetyView from "./SafetyView";

export const metadata: Metadata = {
  title: "Safety",
  description:
    "How Starchild responds when someone may be in crisis: on-device detection, real human help lines, and no game until they're safe. Starchild is an AI, not a therapist.",
  alternates: { canonical: "/safety" },
};

export default function SafetyPage() {
  return (
    <>
      <Navbar />
      <SafetyView />
      <Footer />
    </>
  );
}
