import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { writeAuditLog } from '@/lib/server/audit'
import { getAuthContext } from '@/lib/server/auth'
import { assertCanUseAiAssist } from '@/lib/server/billing'
import { getOpenAIClient } from '@/lib/server/openai'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { analyzeChangeOrderSchema } from '@/lib/server/validators'

const SYSTEM_PROMPT = `You are a senior construction PM preparing Change Order documentation.

Review the user's change description and any notes. Address:
- Scope: missing work, vague quantities/locations, unspecified means & methods, QA/safety if relevant
- Reason for change: make the commercial/technical driver explicit (owner request, code, design conflict, field condition, scope gap, etc.)
- Traceability: flag if drawing/sheet, spec section, RFI, submittal, or detail references should be cited or clarified
- Cost: if dollar amounts or basis of estimate are mentioned, note gaps in backup or justification language; do not invent dollar amounts
- Schedule: if durations or completion impacts are mentioned, flag vague phrasing; prefer clear calendar-day language

Respond with valid JSON only:
- "missingScope" (array): concrete items the CO should add or clarify
- "unclearAreas" (array): vague or incomplete language that should be tightened
- "suggestedRevision" (string): ONE polished replacement for the main "Description of Change" / scope narrative. Use concise professional construction tone, short paragraphs or bullets as appropriate. Include a short "## Reason for Change" section when the input implies a reason but it is poorly stated. Do not fabricate project-specific references or figures that are absent from the input.

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
  const aiGate = await assertCanUseAiAssist(supabase as any, auth.accountId)
  if (!aiGate.ok) return badRequest(aiGate.reason)

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

    await writeAuditLog(
      {
        accountId: auth.accountId,
        actorType: 'user',
        actorUserId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        eventType: 'ai.generation',
        eventData: { feature: 'analyze_change_order', model },
      },
      supabase as any
    )

    return ok(normalizeResult(parsedJson))
  } catch {
    return serverError('Scope analysis temporarily unavailable.')
  }
}
