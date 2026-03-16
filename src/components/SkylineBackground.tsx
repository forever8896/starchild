/**
 * SkylineBackground.tsx — AI-generated cosmic skyline
 *
 * Uses the Nano Banana 2 generated skyline image as the base,
 * with a subtle time-aware brightness overlay.
 */

import { useState, useEffect } from 'react'
import skylineImg from '../assets/skyline-bg.png'

type TimeOfDay = 'night' | 'dawn' | 'day' | 'dusk'

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours()
  if (hour >= 22 || hour < 5) return 'night'
  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 18) return 'day'
  return 'dusk'
}

const TIME_OPACITY: Record<TimeOfDay, number> = {
  night: 1,
  dawn: 0.85,
  day: 0.7,
  dusk: 0.9,
}

export default function SkylineBackground() {
  const [time, setTime] = useState<TimeOfDay>(getTimeOfDay)

  // Update time of day every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => setTime(getTimeOfDay()), 300_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <img
        src={skylineImg}
        alt=""
        className="w-full h-full object-cover transition-opacity duration-[3000ms]"
        style={{ opacity: TIME_OPACITY[time] }}
        draggable={false}
      />
      {/* Subtle vignette for depth */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, var(--bg-deep) 100%)',
          opacity: 0.4,
        }}
      />
    </div>
  )
}
