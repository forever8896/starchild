/**
 * tts.test.ts — the web voice path (`platform.ttsSpeak`).
 *
 * Verifies the seam the ChatView voice features hang off:
 *   • trial → POST /api/tts with { text, voice } (key stays server-side)
 *   • BYOK  → direct Venice /audio/speech with the user's key
 *   • the saved `tts_voice` setting is honored (invalid values fall back)
 *   • audio bytes round-trip to the base64 the UI plays
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { webPlatform } from '../../src/platform/web'
import { setSetting } from './storage'
import { DEFAULT_TTS_VOICE, TTS_MODEL, TTS_VOICE_SETTING } from './voices'

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0xff, 0xfb, 0x90])

function stubFetch(): { calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(MP3.slice().buffer, {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })
  }))
  return { calls }
}

beforeEach(async () => {
  // Reset the tier + voice between tests (shared fake-IndexedDB).
  await setSetting('venice_api_key', '')
  await setSetting(TTS_VOICE_SETTING, '')
})
afterEach(() => vi.unstubAllGlobals())

describe('platform.ttsSpeak (web voice)', () => {
  it('is enabled on web', () => {
    expect(webPlatform.supportsTts).toBe(true)
  })

  it('trial → POSTs { text, voice } to /api/tts and returns playable base64', async () => {
    const { calls } = stubFetch()
    const b64 = await webPlatform.ttsSpeak('hello, little star')

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/tts')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body).toEqual({ text: 'hello, little star', voice: DEFAULT_TTS_VOICE })
    // No Authorization header — the trial key never touches the browser.
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined()
    // The base64 the UI plays decodes back to the exact audio bytes.
    expect(new Uint8Array([...atob(b64)].map((c) => c.charCodeAt(0)))).toEqual(MP3)
  })

  it('BYOK → calls Venice directly with the user key and the pinned model', async () => {
    await setSetting('venice_api_key', 'sk-user-key')
    const { calls } = stubFetch()
    await webPlatform.ttsSpeak('spoken by my own key')

    expect(calls[0].url).toBe('https://api.venice.ai/api/v1/audio/speech')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-user-key')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body).toMatchObject({ input: 'spoken by my own key', model: TTS_MODEL, response_format: 'mp3' })
  })

  it('honors the saved tts_voice setting and falls back on invalid values', async () => {
    await setSetting(TTS_VOICE_SETTING, 'River')
    let { calls } = stubFetch()
    await webPlatform.ttsSpeak('with a chosen voice')
    expect(JSON.parse(String(calls[0].init.body)).voice).toBe('River')

    await setSetting(TTS_VOICE_SETTING, 'NotARealVoice')
    ;({ calls } = stubFetch())
    await webPlatform.ttsSpeak('with a bogus voice')
    expect(JSON.parse(String(calls[0].init.body)).voice).toBe(DEFAULT_TTS_VOICE)
  })

  it('surfaces a friendly error when the voice endpoint is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    await expect(webPlatform.ttsSpeak('anything')).rejects.toThrow(/voice unavailable/)
  })
})

describe('platform.transcribe (web mic)', () => {
  // A fake WAV big enough to pass the "nothing to transcribe" floor.
  const WAV = new Uint8Array(256).map((_, i) => i % 251)
  const WAV_B64 = btoa(String.fromCharCode(...WAV))

  function stubJsonFetch(reply: unknown, status = 200) {
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(JSON.stringify(reply), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    }))
    return calls
  }

  it('is enabled on web', () => {
    expect(webPlatform.supportsVoice).toBe(true)
  })

  it('trial → POSTs raw WAV bytes to /api/stt (no auth header) and returns the text', async () => {
    const calls = stubJsonFetch({ text: '  i did the quest today  ' })
    const text = await webPlatform.transcribe(WAV_B64)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/stt')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(new Uint8Array(calls[0].init.body as Uint8Array)).toEqual(WAV)
    expect(text).toBe('i did the quest today') // trimmed
  })

  it('BYOK → multiparts the audio straight to Venice with the user key', async () => {
    await setSetting('venice_api_key', 'sk-user-key')
    const calls = stubJsonFetch({ text: 'spoken privately' })
    const text = await webPlatform.transcribe(WAV_B64)

    expect(calls[0].url).toBe('https://api.venice.ai/api/v1/audio/transcriptions')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-user-key')
    expect(calls[0].init.body).toBeInstanceOf(FormData)
    const form = calls[0].init.body as FormData
    expect(form.get('model')).toBe('openai/whisper-large-v3')
    expect(text).toBe('spoken privately')
  })

  it('surfaces a friendly error when transcription is down', async () => {
    stubJsonFetch({ error: 'nope' }, 503)
    await expect(webPlatform.transcribe(WAV_B64)).rejects.toThrow(/transcription unavailable/)
  })
})
