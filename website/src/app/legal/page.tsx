import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LegalView from "./LegalView";

export const metadata: Metadata = {
  title: "Legal",
  description:
    "Statutory disclosure for the business operating Starchild: registered name, registration number, VAT ID, registered seat and licensing.",
  alternates: { canonical: "/legal" },
};

export default function LegalPage() {
  return (
    <>
      <Navbar />
      <LegalView />
      <Footer />
    </>
  );
}
