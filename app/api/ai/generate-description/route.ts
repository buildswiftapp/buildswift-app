import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { title?: string; projectId?: string }
  const title = body.title?.trim() || 'Untitled'
  return NextResponse.json({
    description: `Generated description for "${title}": clarify scope, affected trades, and required response date.`,
  })
}

