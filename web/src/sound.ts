/**
 * sound.ts — Starchild's ethereal UI sound design.
 *
 * Every sound is SYNTHESISED in WebAudio (no audio files → instant, tiny, and
 * fully tunable), voiced to the app's calm cosmic feel: soft sine/triangle bells
 * with a gentle attack, long airy decay, and a whisper of convolution reverb.
 * Micro-interactions (click, nav) are deliberately quiet; the reward moments
 * (quest accept/complete, crystallize, level-up) bloom brighter and wider.
 *
 * WebAudio needs a user gesture to begin — every trigger resumes the context,
 * and since sounds fire from taps/clicks that's always satisfied. Respects a
 * persisted mute flag (`starchild_sfx_muted`).
 */

let _ctx: AudioContext | null = null
let _master: GainNode | null = null
let _reverb: ConvolverNode | null = null

const MUTE_KEY = 'starchild_sfx_muted'

export function isMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
}
export function setMuted(m: boolean): void {
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0') } catch { /* private mode */ }
}

/** A short, decaying-noise impulse → a soft, airy hall (same trick as the voice). */
function impulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = c.sampleRate
  const len = Math.max(1, Math.floor(rate * seconds))
  const buf = c.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return buf
}

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!_ctx) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      _ctx = new AC()
      _master = _ctx.createGain()
      _master.gain.value = 0.85
      _master.connect(_ctx.destination)
      _reverb = _ctx.createConvolver()
      _reverb.buffer = impulse(_ctx, 1.7, 2.8)
      const wet = _ctx.createGain()
      wet.gain.value = 0.3
      _reverb.connect(wet)
      wet.connect(_master)
    } catch {
      return null
    }
  }
  if (_ctx.state === 'suspended') void _ctx.resume()
  return _ctx
}

interface ToneOpts {
  freq: number
  dur?: number
  type?: OscillatorType
  when?: number
  gain?: number
  attack?: number
  release?: number
  glideTo?: number
  /** 0–1 send to the reverb bus (in addition to the dry signal). */
  reverb?: number
}

/** One bell-ish voice: an oscillator with an exponential attack/decay envelope. */
function tone(o: ToneOpts): void {
  const c = ctx()
  if (!c || !_master || !_reverb) return
  const t0 = c.currentTime + (o.when ?? 0)
  const dur = o.dur ?? 0.4
  const attack = o.attack ?? 0.008
  const release = o.release ?? dur
  const peak = Math.max(0.0002, o.gain ?? 0.18)

  const osc = c.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.freq, t0)
  if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t0 + dur)

  const g = c.createGain()
  g.gain.setValueAtTime(0.0002, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0002, t0 + attack + release)

  osc.connect(g)
  g.connect(_master)
  const rv = o.reverb ?? 0.5
  if (rv > 0) {
    const rg = c.createGain()
    rg.gain.value = rv
    g.connect(rg)
    rg.connect(_reverb)
  }
  osc.start(t0)
  osc.stop(t0 + attack + release + 0.06)
}

const ok = () => !isMuted()

// ── Note table (a warm C-major / pentatonic palette) ─────────────────────────
const N = {
  C3: 130.81, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0,
  C6: 1046.5, D6: 1174.7, E6: 1318.5, G6: 1568.0,
}

// ── Micro-interactions (quiet, tactile) ──────────────────────────────────────

/** A soft glassy tick for any button/tap. */
export function click(): void {
  if (!ok()) return
  tone({ freq: N.A5, dur: 0.08, type: 'triangle', gain: 0.06, attack: 0.003, release: 0.07, reverb: 0.2 })
  tone({ freq: N.E6, dur: 0.05, type: 'sine', gain: 0.03, when: 0.004, release: 0.05, reverb: 0.18 })
}

/** Switching a view / nav rail — a gentle two-note chime. */
export function nav(): void {
  if (!ok()) return
  tone({ freq: N.C5, dur: 0.16, type: 'sine', gain: 0.08, release: 0.2, reverb: 0.5 })
  tone({ freq: N.G5, dur: 0.14, type: 'sine', gain: 0.05, when: 0.03, release: 0.18, reverb: 0.5 })
}

/** A toggle flipping — pitch rises when turning on, falls when off. */
export function toggle(on: boolean): void {
  if (!ok()) return
  tone({ freq: on ? N.E5 : N.G5, glideTo: on ? N.A5 : N.C5, dur: 0.16, type: 'sine', gain: 0.08, reverb: 0.35 })
}

/** Sending a message — a soft outward, rising puff. */
export function send(): void {
  if (!ok()) return
  tone({ freq: N.E5, glideTo: N.A5, dur: 0.2, type: 'sine', gain: 0.06, release: 0.24, reverb: 0.4 })
}

/** The Starchild's reply lands — a low, warm bloom. */
export function receive(): void {
  if (!ok()) return
  tone({ freq: N.A4, dur: 0.5, type: 'sine', gain: 0.05, attack: 0.03, release: 0.6, reverb: 0.7 })
}

// ── Reward moments (brighter, wider) ─────────────────────────────────────────

/** A quest is accepted — an ascending, resolute shimmer (a vow taken). */
export function questAccept(): void {
  if (!ok()) return
  ;[N.C5, N.E5, N.G5, N.C6].forEach((f, i) =>
    tone({ freq: f, when: i * 0.09, dur: 0.55, type: 'sine', gain: 0.14, release: 0.7, reverb: 0.85 }),
  )
  tone({ freq: N.C4, dur: 0.8, type: 'triangle', gain: 0.07, attack: 0.02, release: 1.0, reverb: 0.6 })
}

/** A quest is completed — a warm blooming chord + a rising sparkle (fruit ripens). */
export function questComplete(): void {
  if (!ok()) return
  ;[N.C4, N.E4, N.G4, N.C5].forEach((f, i) =>
    tone({ freq: f, when: i * 0.03, dur: 1.1, type: 'sine', gain: 0.12, attack: 0.02, release: 1.4, reverb: 0.9 }),
  )
  ;[N.G5, N.C6, N.E6, N.G6].forEach((f, i) =>
    tone({ freq: f, when: 0.2 + i * 0.07, dur: 0.5, type: 'sine', gain: 0.06, release: 0.7, reverb: 0.9 }),
  )
}

/** The vision crystallizes — a slow, wide, magical rise into the light. */
export function crystallize(): void {
  if (!ok()) return
  ;[N.C5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) =>
    tone({ freq: f, when: i * 0.14, dur: 0.95, type: 'sine', gain: 0.1, attack: 0.02, release: 1.2, reverb: 1 }),
  )
  tone({ freq: N.C3, glideTo: N.C4, dur: 1.6, type: 'triangle', gain: 0.08, release: 1.8, reverb: 0.8 })
}

/** Levelling up — a quick bright fanfare. */
export function levelUp(): void {
  if (!ok()) return
  ;[N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) =>
    tone({ freq: f, when: i * 0.06, dur: 0.5, type: 'sine', gain: 0.12, release: 0.6, reverb: 0.8 }),
  )
}

/** Something unlocks (e.g. feedback) — a soft, curious two-note ping. */
export function unlock(): void {
  if (!ok()) return
  tone({ freq: N.G5, dur: 0.3, type: 'sine', gain: 0.1, release: 0.4, reverb: 0.7 })
  tone({ freq: N.C6, dur: 0.4, type: 'sine', gain: 0.08, when: 0.11, release: 0.5, reverb: 0.7 })
}
