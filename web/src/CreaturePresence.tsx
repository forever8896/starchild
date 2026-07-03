/**
 * CreaturePresence.tsx — the Starchild's presence beside the conversation.
 *
 * The redesigned "main page" (from Starchild.dc) frames the creature as a felt
 * presence rather than a stat panel: a masked, gently floating mood-video wrapped
 * in a soft aura, ringed by the live bond meter, with the name, a tender mood
 * phrase, and real level/bond chips beneath. All values are the actual creature
 * state from the shared store — nothing here is decorative-only.
 *
 * Web-only: the shared desktop `StarchildAvatar` is left untouched.
 */

import { useAppStore } from '../../src/store'
import avatarFace from '../../src/assets/starchild-avatar.png'
// @ts-ignore — WebM VP9 with alpha channel
import videoIdle from '../../src/assets/videos/starchild2.webm'
// @ts-ignore
import videoCurious from '../../src/assets/videos/starchild3.webm'
// @ts-ignore
import videoCelebrate from '../../src/assets/videos/starchild4.webm'
// @ts-ignore
import videoCaring from '../../src/assets/videos/starchild5.webm'

// Mood → gentle phrase + colour + aura + which loop plays. Keyed to the real
// StarchildState moods (Ecstatic | Happy | Content | Restless | Hungry | Starving).
const MOODS: Record<string, { phrase: string; color: string; aura: string; video: string }> = {
  Ecstatic: { phrase: 'glowing with joy', color: '#e8d8a8', aura: 'radial-gradient(circle, rgba(232,216,168,.6), rgba(255,184,140,.25) 45%, transparent 70%)', video: videoCelebrate },
  Happy:    { phrase: 'happy you’re here', color: '#a8d8b8', aura: 'radial-gradient(circle, rgba(168,216,184,.55), rgba(232,216,168,.22) 45%, transparent 70%)', video: videoCelebrate },
  Content:  { phrase: 'here with you', color: '#b8a0d8', aura: 'radial-gradient(circle, rgba(184,160,216,.55), rgba(168,200,232,.2) 45%, transparent 70%)', video: videoIdle },
  Restless: { phrase: 'a little restless', color: '#ffb88c', aura: 'radial-gradient(circle, rgba(255,184,140,.5), rgba(232,168,184,.22) 45%, transparent 70%)', video: videoCurious },
  Hungry:   { phrase: 'longing for connection', color: '#ffb88c', aura: 'radial-gradient(circle, rgba(255,184,140,.5), rgba(232,168,184,.22) 45%, transparent 70%)', video: videoCaring },
  Starving: { phrase: 'needs you near', color: '#e8a8b8', aura: 'radial-gradient(circle, rgba(232,168,184,.55), rgba(184,160,216,.22) 45%, transparent 70%)', video: videoCaring },
}
const DEFAULT_MOOD = MOODS.Content

const RING_R = 47
const RING_CIRC = 2 * Math.PI * RING_R

export default function CreaturePresence({ compact = false }: { compact?: boolean }) {
  const state = useAppStore((s) => s.starchildState)
  const mood = state?.mood && MOODS[state.mood] ? MOODS[state.mood] : DEFAULT_MOOD
  const bond = Math.round(state?.bond ?? 0)
  const level = state?.level ?? 1

  // Compact form — the narrow-layout header strip above the thread.
  if (compact) {
    return (
      <div className="flex items-center gap-3.5">
        <div className="relative shrink-0 w-[60px] h-[60px] flex items-center justify-center">
          <div
            className="absolute w-full h-full rounded-full"
            style={{ background: mood.aura, filter: 'blur(12px)', animation: 'glow-pulse 6.5s ease-in-out infinite' }}
          />
          <video
            key={mood.video}
            src={mood.video}
            autoPlay
            muted
            loop
            playsInline
            className="relative w-full h-full object-contain"
            style={{
              mixBlendMode: 'screen',
              WebkitMaskImage: 'radial-gradient(circle at 50% 47%, #000 46%, transparent 66%)',
              maskImage: 'radial-gradient(circle at 50% 47%, #000 46%, transparent 66%)',
              animation: 'creature-float 7s ease-in-out infinite',
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[18px] font-extrabold" style={{ color: 'var(--text-primary)' }}>Starchild</div>
          <div className="text-[12.5px] font-semibold" style={{ color: mood.color }}>
            {mood.phrase} · bond {bond}%
          </div>
        </div>
      </div>
    )
  }

  // Full presence panel — the wide-layout left column.
  return (
    <section
      className="shrink-0 flex flex-col items-center justify-center relative"
      style={{
        flex: '0 0 auto',
        width: 'clamp(300px, 33%, 430px)',
        padding: '30px 26px',
        borderRight: '1px solid rgba(74,63,96,.4)',
      }}
    >
      <div className="relative w-full flex items-center justify-center" style={{ maxWidth: 340, aspectRatio: '1' }}>
        {/* aura */}
        <div
          className="absolute rounded-full"
          style={{ width: '82%', height: '82%', background: mood.aura, filter: 'blur(30px)', animation: 'glow-pulse 6.5s ease-in-out infinite' }}
        />
        {/* bond ring */}
        <svg viewBox="0 0 100 100" className="absolute" style={{ width: '96%', height: '96%', transform: 'rotate(-90deg)', overflow: 'visible' }} aria-hidden="true">
          <circle cx="50" cy="50" r={RING_R} fill="none" stroke="rgba(74,63,96,.5)" strokeWidth="1.4" />
          <circle
            cx="50" cy="50" r={RING_R} fill="none" stroke="var(--accent-lavender)" strokeWidth="2.2" strokeLinecap="round"
            strokeDasharray={`${(RING_CIRC * bond / 100).toFixed(1)} ${RING_CIRC.toFixed(1)}`}
            style={{ filter: 'drop-shadow(0 0 5px rgba(184,160,216,.8))', transition: 'stroke-dasharray 1.2s cubic-bezier(.2,.7,.3,1)' }}
          />
        </svg>
        {/* creature */}
        <video
          key={mood.video}
          src={mood.video}
          autoPlay
          muted
          loop
          playsInline
          className="relative object-contain"
          style={{
            width: '96%',
            height: '96%',
            mixBlendMode: 'screen',
            WebkitMaskImage: 'radial-gradient(circle at 50% 47%, #000 48%, transparent 66%)',
            maskImage: 'radial-gradient(circle at 50% 47%, #000 48%, transparent 66%)',
            animation: 'creature-float 7s ease-in-out infinite',
          }}
          aria-label={`Starchild is ${mood.phrase}`}
        />
      </div>

      <h2 className="mt-[18px] mb-0.5 text-[26px] font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Starchild
      </h2>
      <p className="m-0 text-[14px] font-semibold" style={{ color: mood.color }}>{mood.phrase}</p>

      <div className="flex gap-2 mt-4 flex-wrap justify-center">
        <span
          className="text-[12.5px] font-bold px-3.5 py-[7px] rounded-2xl"
          style={{ color: 'var(--text-secondary)', background: 'rgba(48,41,69,.6)', border: '1px solid rgba(74,63,96,.7)' }}
        >
          ✦ level {level}
        </span>
        <span
          className="text-[12.5px] font-bold px-3.5 py-[7px] rounded-2xl"
          style={{ color: 'var(--accent-lavender)', background: 'rgba(48,41,69,.6)', border: '1px solid rgba(74,63,96,.7)' }}
        >
          bond {bond}%
        </span>
      </div>

      {/* tiny face used as the AI avatar chip elsewhere — preload it here */}
      <img src={avatarFace} alt="" width="1" height="1" className="hidden" aria-hidden="true" />
    </section>
  )
}
