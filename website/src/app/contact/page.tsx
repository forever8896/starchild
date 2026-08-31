import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ContactView from "./ContactView";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "How to reach the team behind Starchild — support, security reports, press and partnerships.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <ContactView />
      <Footer />
    </>
  );
}
