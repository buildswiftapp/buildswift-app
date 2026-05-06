import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { assertCanUseProFeature } from '@/lib/server/billing'
import { getOpenAIClient } from '@/lib/server/openai'
import { rfiStructuredImprovementSchema } from '@/lib/server/rfi-ai-schema'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { improveRfiSchema } from '@/lib/server/validators'

const NA = 'N/A'
const NOT_PROVIDED = 'Not Provided'

const SYSTEM_PROMPT = `You are an expert at writing construction RFIs. Respond with JSON only (no markdown).
The JSON must have:
- improvedDescription (string): clear, professional, actionable question/description. Do not invent site facts — only clarify/sharpen from the user's text and notes.

- structured (object):
  - summaryTitle: concise RFI subject line (same intent as improvedDescription; may match document title style)
  - questionDetails.detailedQuestion, reasonForRequest, conflictIdentification, missingInformation, clarificationRequired
  - reference.drawingSheetNumber, specificationSection, specificReference, location
  - impacts.costImpact, scheduleImpact, description — use terse values for costImpact/scheduleImpact: "None", "Potential", or "Yes" unless user specified otherwise.

If any field lacks evidence in input, use "${NA}" for short categorical fields or "${NOT_PROVIDED}" for narrative blanks as appropriate — never fabricate drawings, grids, spec sections, or locations.`

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
      response_format: { type: 'json_object' },
    })

    const raw =
      typeof completion.choices[0]?.message?.content === 'string'
        ? completion.choices[0].message.content.trim()
        : ''
    if (!raw) return serverError('AI improvement temporarily unavailable.')

    let parsedJson: Record<string, unknown>
    try {
      parsedJson = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return serverError('AI improvement temporarily unavailable.')
    }

    const improvedDescription =
      typeof parsedJson.improvedDescription === 'string' ? parsedJson.improvedDescription.trim() : ''

    let structuredPayload: Record<string, unknown> | undefined
    if (
      parsedJson.structured &&
      typeof parsedJson.structured === 'object' &&
      !Array.isArray(parsedJson.structured)
    ) {
      const s = rfiStructuredImprovementSchema.safeParse(parsedJson.structured)
      if (s.success) {
        structuredPayload = s.data as unknown as Record<string, unknown>
      }
    }

    if (!improvedDescription) return serverError('AI improvement temporarily unavailable.')

    return ok({
      improvedDescription,
      ...(structuredPayload ? { structured: structuredPayload } : {}),
    })
  } catch {
    return serverError('AI improvement temporarily unavailable.')
  }
}
