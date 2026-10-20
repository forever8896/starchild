import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import OriginView from "./OriginView";

export const metadata: Metadata = {
  title: "Origin Story",
  description:
    "How the Starchild came to be: a privacy-first, local-first AI companion that gamifies improving your life. The story, the philosophy, and how it was built.",
  alternates: { canonical: "/origin" },
};

export default function OriginPage() {
  return (
    <>
      <Navbar />
      <OriginView />
      <Footer />
    </>
  );
}
