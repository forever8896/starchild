/**
 * voices.ts — the Starchild's voice (web).
 *
 * Venice TTS, `tts-elevenlabs-turbo-v2-5` (the natural model the voice
 * audition used — kokoro is markedly robotic). The 21 voice ids are plain
 * names, validated against the model's own `voices` list. The default is a
 * soft, tender voice fitting a small celestial creature; users can pick any
 * of the audition voices in Settings (`tts_voice` setting).
 *
 * PRIVACY: speaking a reply sends the STARCHILD'S words (never the user's
 * messages) to Venice's TTS service in plaintext — there is no E2EE TTS
 * enclave. The chat-header "🔊 voice" toggle and Settings state this honestly.
 */

export const TTS_MODEL = 'tts-elevenlabs-turbo-v2-5'

/** Voice ids accepted by the model (also the audition set in ~/starchild-voices). */
export const TTS_VOICES = [
  'Alice', 'Aria', 'Bill', 'Brian', 'Callum', 'Charlie', 'Charlotte',
  'Chris', 'Daniel', 'Eric', 'George', 'Jessica', 'Laura', 'Liam',
  'Lily', 'Matilda', 'Rachel', 'River', 'Roger', 'Sarah', 'Will',
] as const

export type TtsVoice = (typeof TTS_VOICES)[number]

/** Default until the audition verdict lands — soft and gentle. */
export const DEFAULT_TTS_VOICE: TtsVoice = 'Lily'

/** The settings key holding the user's chosen voice. */
export const TTS_VOICE_SETTING = 'tts_voice'

export function isTtsVoice(v: string): v is TtsVoice {
  return (TTS_VOICES as readonly string[]).includes(v)
}
