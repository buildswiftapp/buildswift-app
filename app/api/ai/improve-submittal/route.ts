import { badRequest, forbidden, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { writeAuditLog } from '@/lib/server/audit'
import { getAuthContext } from '@/lib/server/auth'
import { assertCanUseAiAssist } from '@/lib/server/billing'
import { incrementMonthlyAiGenerations } from '@/lib/server/account-usage'
import { getOpenAIClient } from '@/lib/server/openai'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { improveSubmittalSchema } from '@/lib/server/validators'

const SYSTEM_PROMPT = `You are a construction submittal reviewer. Improve and professionalize the submittal description for a formal submission: use precise technical language, state the intended use clearly, and weave in product/material context when the user hints at it.

When applicable, note or align with likely specification sections (CSI format) and drawing/sheet references inferred from the input—only when reasonable, do not invent bid-specific section numbers.

Ensure completeness of what is being submitted relative to the text given. Return only the improved description text (plain text, no markdown).`

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (!auth.accountId) return badRequest('Account context is unavailable.')
  const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
  if (!supabase) return serverError('Supabase is not configured')
  const aiGate = await assertCanUseAiAssist(supabase as any, auth.accountId)
  if (!aiGate.ok) return forbidden(aiGate.reason)

  const parsed = improveSubmittalSchema.safeParse(await req.json().catch(() => ({})))
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

    await writeAuditLog(
      {
        accountId: auth.accountId,
        actorType: 'user',
        actorUserId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        eventType: 'ai.generation',
        eventData: { feature: 'improve_submittal', model },
      },
      supabase as any
    )

    try {
      await incrementMonthlyAiGenerations(supabase as any, auth.accountId, 1)
    } catch {
    }

    return ok({ improvedDescription: improved })
  } catch {
    return serverError('AI improvement temporarily unavailable.')
  }
}
