import OpenAI from 'openai'

let client: OpenAI | null = null

export function getOpenAIClient() {
  if (client) return client
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  client = new OpenAI({
    apiKey,
    timeout: Number(process.env.OPENAI_TIMEOUT_MS || 120_000),
    maxRetries: Number(process.env.OPENAI_MAX_RETRIES || 2),
  })
  return client
}
