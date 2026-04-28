import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { assertCanUseProFeature } from '@/lib/server/billing'
import { getOpenAIClient } from '@/lib/server/openai'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { improveRfiSchema } from '@/lib/server/validators'

const SYSTEM_PROMPT = `You are an expert at writing construction RFIs. Improve the given description to be clear, professional, and actionable. If the user mentions specific drawings, specs, or details, retain and emphasize them. Do not invent new questions - only clarify and sharpen the existing one. Return only the improved description text.`

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')
  const proGate = await assertCanUseProFeature(supabase as any, auth.accountId, 'Missing Scope AI')
  if (!proGate.ok) return badRequest(proGate.reason)

  const parsed = improveRfiSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const openai = getOpenAIClient()
  if (!openai) return serverError('AI improvement temporarily unavailable.')

  const { description, notes } = parsed.data
  const userMessage = notes?.trim()
    ? `Base description:\n${description}\n\nAdditional user notes:\n${notes}`
    : `Base description:\n${description}`

  const model = process.env.OPENAI_MODEL || 'gpt-4o'

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    })

    const improved =
      typeof completion.choices[0]?.message?.content === 'string'
        ? completion.choices[0].message.content.trim()
        : ''

    if (!improved) return serverError('AI improvement temporarily unavailable.')

    return ok({ improvedDescription: improved })
  } catch {
    return serverError('AI improvement temporarily unavailable.')
  }
}
