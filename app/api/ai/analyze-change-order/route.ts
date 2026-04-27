import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { assertCanUseProFeature } from '@/lib/server/billing'
import { getOpenAIClient } from '@/lib/server/openai'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { analyzeChangeOrderSchema } from '@/lib/server/validators'

const SYSTEM_PROMPT = `You are a senior construction project manager reviewing a Change Order scope description. Identify:
- Missing scope elements
- Unclear or vague areas
- Suggestions for improvement

Respond with a valid JSON object containing:
- "missingScope" (array of strings)
- "unclearAreas" (array of strings)
- "suggestedRevision" (string - a complete, improved version of the scope description)

Return only valid JSON.`

type ChangeOrderAnalysis = {
  missingScope: string[]
  unclearAreas: string[]
  suggestedRevision: string
}

const FALLBACK: ChangeOrderAnalysis = {
  missingScope: [],
  unclearAreas: [],
  suggestedRevision: '',
}

function normalizeResult(raw: unknown): ChangeOrderAnalysis {
  if (!raw || typeof raw !== 'object') return FALLBACK
  const obj = raw as Record<string, unknown>
  const missingScope = Array.isArray(obj.missingScope)
    ? obj.missingScope.filter((item): item is string => typeof item === 'string')
    : []
  const unclearAreas = Array.isArray(obj.unclearAreas)
    ? obj.unclearAreas.filter((item): item is string => typeof item === 'string')
    : []
  const suggestedRevision =
    typeof obj.suggestedRevision === 'string' ? obj.suggestedRevision.trim() : ''
  return { missingScope, unclearAreas, suggestedRevision }
}

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')
  const proGate = await assertCanUseProFeature(supabase as any, auth.accountId, 'Missing Scope AI')
  if (!proGate.ok) return badRequest(proGate.reason)

  const parsed = analyzeChangeOrderSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const openai = getOpenAIClient()
  if (!openai) return serverError('Scope analysis temporarily unavailable.')

  const { description, notes } = parsed.data
  const userMessage = notes?.trim()
    ? `Change order scope description:\n${description}\n\nAdditional user notes:\n${notes}`
    : `Change order scope description:\n${description}`
  const model = process.env.OPENAI_MODEL || 'gpt-4o'

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    })

    const rawText = completion.choices[0]?.message?.content
    if (typeof rawText !== 'string' || !rawText.trim()) return ok(FALLBACK)

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawText)
    } catch {
      return ok(FALLBACK)
    }

    return ok(normalizeResult(parsedJson))
  } catch {
    return serverError('Scope analysis temporarily unavailable.')
  }
}
