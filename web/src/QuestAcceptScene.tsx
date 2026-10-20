/**
 * QuestAcceptScene.tsx — the cinematic beat the moment a quest is accepted, laid
 * over the app as the vision tree mounts beneath it. The quest "takes root": a
 * bloom of the plane's light with expanding rings and slow rays, the quest title,
 * then it fades to reveal the tree with its new fruit. Paired with sound.questAccept().
 */
import { motion } from 'framer-motion'

export default function QuestAcceptScene({ title, color }: { title: string; color: string }) {
  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-8 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: 'easeInOut' }}
      style={{
        background: 'radial-gradient(60% 52% at 50% 44%, rgba(20,16,32,0.85), rgba(8,6,16,0.97) 72%)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      }}
    >
      <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
        {/* expanding rings — the vow rippling outward */}
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{ borderColor: color, borderWidth: 1.5, borderStyle: 'solid' }}
            initial={{ width: 44, height: 44, opacity: 0.55 }}
            animate={{ width: 220, height: 220, opacity: 0 }}
            transition={{ duration: 2.4, delay: 0.25 + i * 0.5, ease: 'easeOut', repeat: Infinity, repeatDelay: 0.3 }}
          />
        ))}

        {/* slow rays */}
        <motion.div
          className="absolute" style={{ width: 220, height: 220 }}
          animate={{ rotate: 360 }} transition={{ duration: 26, ease: 'linear', repeat: Infinity }}
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * 360
            return (
              <span
                key={i} aria-hidden
                className="absolute left-1/2 top-1/2"
                style={{
                  width: 2, height: 58, marginLeft: -1,
                  background: `linear-gradient(${color}, transparent)`,
                  transformOrigin: '50% 0%', transform: `rotate(${a}deg) translateY(30px)`, opacity: 0.38,
                }}
              />
            )
          })}
        </motion.div>

        {/* the seed of light blooming */}
        <motion.span
          className="rounded-full"
          style={{ width: 58, height: 58, background: `radial-gradient(circle at 40% 34%, #fffdf7, ${color})`, boxShadow: `0 0 44px 12px ${color}` }}
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: [0.2, 1.18, 1], opacity: 1 }}
          transition={{ duration: 1.0, ease: 'easeOut' }}
        />
      </div>

      <motion.p
        className="mt-8 text-[11px] uppercase font-semibold" style={{ color, letterSpacing: '0.34em' }}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 0.92, y: 0 }} transition={{ delay: 0.5, duration: 0.8 }}
      >
        a new quest takes root
      </motion.p>
      <motion.h2
        className="mt-3 max-w-lg text-center text-[22px] font-semibold leading-snug"
        style={{ color: '#f0ecf8', textWrap: 'balance' } as React.CSSProperties}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.9 }}
      >
        {title}
      </motion.h2>
      <motion.p
        className="mt-4 text-[13px] italic" style={{ color: '#a99cc4' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.25, duration: 0.9 }}
      >
        planted on your vision tree
      </motion.p>
    </motion.div>
  )
}
