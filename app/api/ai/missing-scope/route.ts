import { badRequest, unauthorized } from '@/lib/server/api-response'
import { getAuthContext } from '@/lib/server/auth'

export async function POST(req: Request) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()

  await req.text().catch(() => '')
  return badRequest(
    'This endpoint is deprecated. Use /api/ai/analyze-change-order for scope analysis.'
  )
}
