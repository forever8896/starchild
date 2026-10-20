"use client";

import { MotionConfig } from "framer-motion";

/**
 * Global motion policy. `reducedMotion="user"` makes every framer-motion
 * animation on the site honor the OS "reduce motion" setting (Section 6.B),
 * without wrapping each component by hand.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
