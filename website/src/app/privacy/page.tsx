import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PrivacyView from "./PrivacyView";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Starchild does with your data: conversations encrypted on your device, decrypted only in verified enclaves, stored locally. This website sets no cookies and runs no analytics.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <PrivacyView />
      <Footer />
    </>
  );
}
