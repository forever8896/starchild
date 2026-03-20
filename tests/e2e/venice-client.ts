/**
 * venice-client.ts — Direct Venice AI API client for E2E testing
 *
 * Mirrors the Rust AiClient but in TypeScript for test ergonomics.
 * No E2EE — tests use plaintext for inspectability.
 */

const VENICE_BASE_URL = 'https://api.venice.ai/api/v1'

export type ModelTier = 'quick' | 'regular' | 'deep'

const MODEL_CONFIG: Record<ModelTier, { model: string; temperature: number; maxTokens: number }> = {
  quick:   { model: 'llama-3.3-70b',                temperature: 0.7,  maxTokens: 500  },
  regular: { model: 'venice-uncensored-role-play',   temperature: 0.88, maxTokens: 300  },
  deep:    { model: 'deepseek-v3.2',                 temperature: 0.85, maxTokens: 2000 },
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

export function routeModel(userMessage: string): ModelTier {
  const lower = userMessage.toLowerCase()
  const deepWords = ['feel', 'struggle', 'help', 'reflect', 'worried']
  if (deepWords.some(w => lower.includes(w))) return 'deep'
  if (userMessage.trim().length > 150) return 'deep'
  return 'regular'
}

export async function chat(
  apiKey: string,
  messages: ChatMessage[],
  tier: ModelTier = 'regular',
): Promise<string> {
  const config = MODEL_CONFIG[tier]

  const res = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Venice API ${res.status}: ${body}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  return stripThinkTags(content)
}
