import type { SupabaseClient } from '@supabase/supabase-js'
import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { writeAuditLog } from '@/lib/server/audit'
import { getAuthContext } from '@/lib/server/auth'
import { getOpenAIClient } from '@/lib/server/openai'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'
import { aiGenerateSchema } from '@/lib/server/validators'

const SYSTEM_PROMPTS: Record<'RFI' | 'ChangeOrder' | 'Submittal', string> = {
  RFI: `You are an assistant that helps construction professionals draft clear and professional RFIs (Requests for Information).

The user will provide a description or question in plain language. Your task is to rewrite and expand that description into a well-structured, professional RFI body. Follow these rules:

- Use formal construction industry language.
- Be clear, concise, and actionable.
- If the user mentions a drawing number, specification section, or detail, include that reference naturally.
- Do not invent new facts or questions beyond what the user has provided.
- Do not generate metadata (RFI number, date, to/from).

Output only the rewritten RFI body text, with no additional commentary or formatting wrappers.`,
  ChangeOrder: `You are an assistant responsible for professionally drafting change orders for construction projects.

The user provides a brief description of the changes. Your task is to expand this description into the following two parts:

1. A clear description of the scope of work being added, deleted, or modified.

2. A concise justification or reason for the change.

Do not explicitly separate the descriptions.

Write using formal construction terminology. Do not include cost amounts or schedule impacts; the user will provide such information separately.

Output only the expanded description text, without additional explanations or formatting.`,
  Submittal: `You are an assistant that writes professional Submittal descriptions for construction projects.

The user will provide a short description of an item or material being submitted. Your task is to expand that description into a clear explanation of the item, its intended use, and any relevant context (e.g., where it will be installed or which specification it satisfies).

Use formal construction language. Do not invent product details beyond what the user provides.

Output only the expanded description text, with no additional commentary or formatting.`,
}

async function countAiGenerationsThisPeriod(
  supabase: SupabaseClient,
  accountId: string,
  userId: string
): Promise<number | null> {
  const periodStart = new Date()
  periodStart.setUTCDate(1)
  periodStart.setUTCHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('actor_user_id', userId)
    .eq('event_type', 'ai.document_generate')
    .gte('created_at', periodStart.toISOString())

  if (error) return null
  return count ?? 0
}

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()

  const parsed = aiGenerateSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten())

  const openai = getOpenAIClient()
  if (!openai) return serverError('OPENAI_API_KEY is not configured')

  const { documentType, description, additionalSystemPrompt } = parsed.data
  const systemPrompt = SYSTEM_PROMPTS[documentType]
  const resolvedSystemPrompt = additionalSystemPrompt
    ? `${systemPrompt}\n\nAdditional required guidance:\n${additionalSystemPrompt}`
    : systemPrompt

  const userContent = [
    'Use the following as the factual basis for the narrative. Expand and polish it per your instructions.',
    '',
    '--- Description ---',
    description,
  ].join('\n')

  const model = process.env.OPENAI_MODEL || 'gpt-4o'

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: resolvedSystemPrompt },
        { role: 'user', content: userContent },
      ],
    })

    const generated =
      typeof completion.choices[0]?.message?.content === 'string'
        ? completion.choices[0].message.content.trim()
        : ''

    if (!generated) {
      return serverError('AI generation temporarily unavailable. Please try again.')
    }

    const supabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient())
    let usageCountThisPeriod: number | null = null

    if (supabase && auth.accountId) {
      await writeAuditLog(
        {
          accountId: auth.accountId,
          actorType: 'user',
          actorUserId: auth.user.id,
          actorEmail: auth.user.email ?? null,
          eventType: 'ai.document_generate',
          eventData: { documentType },
        },
        supabase
      )
      usageCountThisPeriod = await countAiGenerationsThisPeriod(
        supabase,
        auth.accountId,
        auth.user.id
      )
    }

    return ok({
      generatedContent: generated,
      ...(usageCountThisPeriod !== null ? { usageCountThisPeriod } : {}),
    })
  } catch {
    return serverError('AI generation temporarily unavailable. Please try again.')
  }
}
