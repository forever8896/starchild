/**
 * format-feedback.test.ts — the feedback sink's validation + formatting.
 *
 * Pure functions shared by the prod edge endpoint (api/feedback.ts) and the dev
 * middleware (dev-proxy.ts), so this one test guards both. No WASM / IndexedDB.
 */

import { describe, it, expect } from 'vitest'
import { cleanFeedback, formatFeedback, webhookRequest } from './format-feedback'

describe('cleanFeedback', () => {
  it('requires a non-empty message', () => {
    expect(() => cleanFeedback({ message: '   ' })).toThrow(/required/)
    expect(() => cleanFeedback({})).toThrow(/required/)
  })

  it('rejects an over-long message', () => {
    expect(() => cleanFeedback({ message: 'x'.repeat(4001) })).toThrow(/too long/)
  })

  it('trims the message and clamps the rating to 1..5', () => {
    expect(cleanFeedback({ message: '  hi  ', rating: 9 }).message).toBe('hi')
    expect(cleanFeedback({ message: 'hi', rating: 9 }).rating).toBe(5)
    expect(cleanFeedback({ message: 'hi', rating: 0 }).rating).toBe(1)
    expect(cleanFeedback({ message: 'hi', rating: 3 }).rating).toBe(3)
  })

  it('defaults rating + contact to null when absent or blank', () => {
    const f = cleanFeedback({ message: 'hi', contact: '   ' })
    expect(f.rating).toBeNull()
    expect(f.contact).toBeNull()
  })

  it('keeps a wallet/ENS contact and reads context', () => {
    const f = cleanFeedback({
      message: 'great',
      contact: 'kiliansolutions.eth',
      context: { stage: 'first-quest-completed', completedQuests: 2 },
    })
    expect(f.contact).toBe('kiliansolutions.eth')
    expect(f.stage).toBe('first-quest-completed')
    expect(f.completedQuests).toBe(2)
  })
})

describe('formatFeedback', () => {
  it('renders rating, stage, contact and the message body', () => {
    const text = formatFeedback({
      rating: 4,
      message: 'the onboarding dragged',
      contact: 'name.eth',
      stage: 'first-quest-completed',
      completedQuests: 1,
    })
    expect(text).toContain('4/5')
    expect(text).toContain('first-quest-completed')
    expect(text).toContain('1 quest done')
    expect(text).toContain('name.eth')
    expect(text).toContain('the onboarding dragged')
  })

  it('shows placeholders when rating/contact are absent', () => {
    const text = formatFeedback({
      rating: null,
      message: 'm',
      contact: null,
      stage: 'first-quest-completed',
      completedQuests: null,
    })
    expect(text).toContain('Rating: —')
    expect(text).toContain('(none given)')
  })
})

describe('webhookRequest', () => {
  it('formats a Telegram bot payload with chat_id', () => {
    const { body } = webhookRequest(
      'https://api.telegram.org/bot123:ABC/sendMessage',
      '999',
      'hello',
    )
    const parsed = JSON.parse(body)
    expect(parsed.chat_id).toBe('999')
    expect(parsed.text).toBe('hello')
  })

  it('formats a generic webhook with both content and text', () => {
    const { body } = webhookRequest('https://discord.com/api/webhooks/x/y', undefined, 'hello')
    const parsed = JSON.parse(body)
    expect(parsed.content).toBe('hello')
    expect(parsed.text).toBe('hello')
  })
})
