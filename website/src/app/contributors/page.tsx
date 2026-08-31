import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ContributorsView from "./ContributorsView";

export const metadata: Metadata = {
  title: "Contributors",
  description:
    "Starchild is open source from the Rust core to this website. Ways to contribute: write code, audit the cryptography, improve the design and docs, or report bugs.",
  alternates: { canonical: "/contributors" },
};

export default function ContributorsPage() {
  return (
    <>
      <Navbar />
      <ContributorsView />
      <Footer />
    </>
  );
}
