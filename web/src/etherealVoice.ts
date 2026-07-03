/**
 * etherealVoice.ts — the creature treatment for the Starchild's voice.
 *
 * A raw TTS voice sounds like a person. This makes it sound like a being:
 *
 *   • pitch + pace down (~7%) — `playbackRate` with pitch-preservation OFF, so
 *     the voice drops ~1.3 semitones AND slows into a wiser, more deliberate
 *     cadence (one knob, two effects — exactly the ffmpeg `asetrate` preview
 *     the voice was auditioned with);
 *   • a soft cosmic reverb — a ConvolverNode fed a synthetic exponential-decay
 *     noise impulse (~1.7s), mixed gently under the dry signal, so it speaks
 *     as if from a vast, kind place.
 *
 * Everything happens live in the browser on the normal HTMLAudioElement, so
 * `window.__ttsAudio` semantics (currentTime/duration/pause — the char-reveal
 * sync and stop buttons) are untouched. If Web Audio is unavailable the plain
 * element still plays — the treatment degrades, the voice never dies.
 */

/**
 * Pitch/pace drop. 1 = untouched. NEUTRALIZED (2026-07-03): the voice was
 * recast to Minimax **YoungKnight**, judged and approved RAW — naturalness
 * beat every DSP variant (deep, gentle, sprite, pitched-up all rejected).
 * The knobs stay for future direction; don't turn them without new ear-time.
 */
const ETHEREAL_RATE = 1.0
/** Reverb mix under the dry voice. 0 = raw (a ≤0.15 whisper is the only
 *  variant still on the table, pending the founder's A/B). */
const WET_LEVEL = 0.0
const DRY_LEVEL = 1.0
/** Impulse-response tail length (seconds) — the size of the "space". */
const IR_SECONDS = 1.4

let ctx: AudioContext | null = null
let impulse: AudioBuffer | null = null

function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/** Synthetic stereo impulse response: decaying noise = a smooth, airy hall. */
function impulseResponse(c: AudioContext): AudioBuffer {
  if (impulse && impulse.sampleRate === c.sampleRate) return impulse
  const length = Math.floor(IR_SECONDS * c.sampleRate)
  const buf = c.createBuffer(2, length, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.8)
    }
  }
  impulse = buf
  return buf
}

/**
 * Build the treated audio element for a base64 mp3. Returns a normal
 * HTMLAudioElement — play/pause/currentTime/duration all behave as usual.
 */
export function createEtherealAudio(base64Mp3: string): HTMLAudioElement {
  const audio = new Audio(`data:audio/mp3;base64,${base64Mp3}`)

  // Pitch + pace: turn OFF pitch preservation so a rate change shifts timbre.
  // Skipped entirely when neutral — raw means raw.
  if (ETHEREAL_RATE !== 1.0) {
    try {
      ;(audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false
      ;(audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = false
      audio.playbackRate = ETHEREAL_RATE
    } catch {
      /* rate stays 1 — still fine */
    }
  }

  // Reverb: route the element through a convolver + dry mix. Best-effort — any
  // failure leaves the untreated element playing normally.
  if (WET_LEVEL > 0) {
    try {
      const c = audioContext()
      void c.resume().catch(() => {})
      const source = c.createMediaElementSource(audio)
      const dry = c.createGain()
      dry.gain.value = DRY_LEVEL
      const convolver = c.createConvolver()
      convolver.buffer = impulseResponse(c)
      const wet = c.createGain()
      wet.gain.value = WET_LEVEL
      source.connect(dry)
      dry.connect(c.destination)
      source.connect(convolver)
      convolver.connect(wet)
      wet.connect(c.destination)
    } catch {
      /* no Web Audio — plain playback */
    }
  }

  return audio
}
