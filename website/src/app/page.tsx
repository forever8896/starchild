import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import FeatureSection from "@/components/FeatureSection";
import Privacy from "@/components/Privacy";
import Download from "@/components/Download";

/**
 * Starchild landing page
 *
 * Section order:
 *  1. Hero         — starchild1.webm (awakening, plays once)
 *  2. Magic Wand   — starchild5.webm (reaching toward viewer)
 *  3. Conversation — starchild3.webm (curious / thinking)
 *  4. Vision Tree  — skilltree.mp4   (constellation skill tree)
 *  5. Quests       — starchild4.webm (celebration)
 *  6. Privacy      — no video
 *  7. Download CTA — starchild2.webm (breathing loop)
 */
export default function Page() {
  return (
    <main>
      <Navbar />

      {/* ─── 1. HERO ─────────────────────────────────────────── */}
      <Hero />

      {/* ─── 2. THE MAGIC WAND ───────────────────────────────── */}
      <FeatureSection
        videoSrc="/videos/starchild5.webm"
        alignment="left"
        eyebrow="where it begins"
        title="your journey begins with one question"
        body="Imagine a world where money and work don't exist. You wake up fully free. What do you find yourself doing? Your answer becomes the star you're growing toward."
        glowColor="rgba(184, 160, 216, 0.2)"
      />

      {/* ─── 3. THE CONVERSATION ─────────────────────────────── */}
      <FeatureSection
        videoSrc="/videos/starchild3.webm"
        alignment="right"
        eyebrow="the intelligence within"
        title="it listens differently than anything you've known"
        body="Starchild doesn't give advice. It asks the questions you've been avoiding. It connects patterns you can't see. It challenges you with love — never lectures."
        footnote="Powered by a research-backed conversation arc: Motivational Interviewing, Clean Language, IFS, Solution-Focused Therapy — woven into every exchange."
        glowColor="rgba(140, 100, 220, 0.18)"
      />

      {/* ─── 4. THE VISION TREE ──────────────────────────────── */}
      <FeatureSection
        videoSrc="/videos/skilltree.mp4"
        alignment="left"
        eyebrow="your map"
        title="your growth, mapped in constellations"
        body="Every quest you complete lights up a node on your vision tree. Three branches — Body, Mind, Spirit — growing toward the life you described."
        glowColor="rgba(232, 216, 168, 0.12)"
        wide
      />

      {/* ─── 5. QUEST SYSTEM ─────────────────────────────────── */}
      <FeatureSection
        videoSrc="/videos/starchild4.webm"
        alignment="left"
        eyebrow="the path"
        title="tiny steps that actually change your life"
        body="Quests aren't tasks. They're alchemical experiments designed from your own words. Specific, achievable, slightly uncomfortable. Each one moves you closer to your preferential reality."
        glowColor="rgba(232, 216, 168, 0.2)"
      />

      {/* ─── 6. PRIVACY ──────────────────────────────────────── */}
      <Privacy />

      {/* ─── 7. DOWNLOAD / CTA ───────────────────────────────── */}
      <Download />
    </main>
  );
}
