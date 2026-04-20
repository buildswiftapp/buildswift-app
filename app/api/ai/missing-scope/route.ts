import { badRequest, ok, serverError, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'
import { getOpenAIClient } from '@/lib/server/openai'
import { missingScopeAiSchema } from '@/lib/server/validators'

const SYSTEM_PROMPT = `You are a senior construction project manager with 20 years of experience reviewing RFIs, Submittals, and Change Orders.

Your task is to analyze the provided construction document and identify:
- Missing scope or incomplete descriptions
- Ambiguities or vague language that could lead to disputes
- Risk exposure for the contractor or owner
- Missing references to drawings, specifications, or contract sections

You must respond with a valid JSON object only. Do not include any text outside the JSON structure.

The JSON object must have exactly two keys:
- "issues": An array of strings. Each string is a bullet point describing a specific gap, ambiguity, or risk you identified. If no issues are found, return an empty array.
- "suggestions": An array of strings. Each string is a specific, actionable sentence or paragraph that the user can insert directly into the document to resolve the issues. The suggestions should be written in professional construction language.

Example format:
{
  "issues": [
    "Missing material specification for concrete strength.",
    "No defined responsibility for debris removal."
  ],
  "suggestions": [
    "Concrete shall have a minimum compressive strength of 4,000 psi at 28 days per ACI 318.",
    "The Contractor is responsible for daily cleanup and final debris removal from the site."
  ]
}

Now analyze the following document:`

const FALLBACK: { issues: string[]; suggestions: string[] } = {
  issues: ['Unable to analyze document at this time.'],
  suggestions: [],
}

function normalizeMissingScopeResult(raw: unknown): { issues: string[]; suggestions: string[] } {
  if (!raw || typeof raw !== 'object') return FALLBACK
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.issues) || !Array.isArray(o.suggestions)) return FALLBACK
  const issues = o.issues.filter((x): x is string => typeof x === 'string')
  const suggestions = o.suggestions.filter((x): x is string => typeof x === 'string')
  return { issues, suggestions }
}

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()

  const parsed = missingScopeAiSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return badRequest(
      'Invalid request: type must be RFI, Submittal, or Change Order, and content must be a non-empty string.',
      parsed.error.flatten()
    )
  }

  const openai = getOpenAIClient()
  if (!openai) return serverError('Scope analysis temporarily unavailable.')

  const { type, content, initialDescription } = parsed.data
  const userMessage = initialDescription
    ? `Document Type: ${type}

Initial User Description (entered before AI generation):
${initialDescription}

Current Document Content (latest text to analyze):
${content}

Analysis instruction:
- Use the initial user description as baseline intent/context.
- Use the current document content as the primary source of what is currently written.
- Identify missing scope introduced by drift from the baseline or by incomplete current details.`
    : `Document Type: ${type}

Document Content:
${content}`

  const model = process.env.OPENAI_MODEL || 'gpt-4o'

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    })

    const rawText = completion.choices[0]?.message?.content
    if (typeof rawText !== 'string' || !rawText.trim()) {
      return ok(FALLBACK)
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawText) as unknown
    } catch {
      return ok(FALLBACK)
    }

    return ok(normalizeMissingScopeResult(parsedJson))
  } catch {
    return serverError('Scope analysis temporarily unavailable.')
  }
}
