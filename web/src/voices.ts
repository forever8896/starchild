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

export const TTS_MODEL = 'tts-minimax-speech-02-hd'

/** Voice ids accepted by the model (character-named — Minimax casts by role). */
export const TTS_VOICES = [
  'CalmWoman', 'CasualGuy', 'DeepVoiceMan', 'DeterminedMan', 'ElegantMan',
  'ExuberantGirl', 'FriendlyPerson', 'ImposingManner', 'InspirationalGirl',
  'LivelyGirl', 'LovelyGirl', 'PatientMan', 'SweetGirl', 'WiseWoman',
  'YoungKnight',
] as const

export type TtsVoice = (typeof TTS_VOICES)[number]

/**
 * CAST by the founder's ear (2026-07-03) after a cross-engine audition
 * (ElevenLabs narrators + DSP all rejected): **YoungKnight** — earnest,
 * warm, genuinely on your side; the squire to your quest. Ships RAW (the
 * pitch/reverb treatment in etherealVoice.ts is neutralized — naturalness
 * won). Users can still pick any voice in Settings.
 */
export const DEFAULT_TTS_VOICE: TtsVoice = 'YoungKnight'

/** The settings key holding the user's chosen voice. */
export const TTS_VOICE_SETTING = 'tts_voice'

export function isTtsVoice(v: string): v is TtsVoice {
  return (TTS_VOICES as readonly string[]).includes(v)
}
