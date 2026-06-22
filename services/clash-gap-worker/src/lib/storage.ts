import { config } from '../config.js'

export function clashGapImagePath(params: {
  accountId: string
  analysisId: string
  fileId: string
  pageIndex: number
  ext?: string
}): string {
  const page = String(params.pageIndex + 1).padStart(4, '0')
  const ext = (params.ext || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg'
  return `${params.accountId}/clash-gap/${params.analysisId}/images/${params.fileId}-page-${page}.${ext}`
}

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await fetchPage(offset, offset + config.supabasePageSize - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    out.push(...page)
    if (page.length < config.supabasePageSize) break
    offset += config.supabasePageSize
  }
  return out
}
