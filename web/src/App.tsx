/**
 * App.tsx — thin web shell wrapper.
 *
 * Skeleton only. The real experience (onboarding, conversation, creature, skill
 * tree) is shared UI that moves into `src/components/*` and mounts here once the
 * platform seam and WASM core land (PRD §4, Phases 2–4). For now this renders a
 * placeholder and proves the platform is wired through context.
 */

import { usePlatform } from './platform'

export default function App() {
  const platform = usePlatform()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        gap: '0.75rem',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <h1 style={{ margin: 0, fontWeight: 700, color: 'var(--accent-lavender)' }}>
        Starchild
      </h1>
      <p style={{ margin: 0, color: 'var(--text-muted)', maxWidth: '28rem' }}>
        Web shell scaffolded. Platform: <code>{platform.name}</code>. The shared
        experience mounts here once the WASM core is built.
      </p>
    </div>
  )
}
