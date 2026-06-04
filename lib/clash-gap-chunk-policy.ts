/** PDFs above this page count are chunked on the server (resumable, no browser memory limit). */
export function clientChunkMaxPages(): number {
  const n = Number(process.env.NEXT_PUBLIC_CLASH_GAP_CLIENT_CHUNK_MAX_PAGES ?? 400)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 400
}

export type ClientChunkSkipReason = 'large_pdf' | 'no_local_file'

export function shouldClientRasterize(params: {
  pageCount: number | null | undefined
  hasLocalFile: boolean
}): boolean {
  const max = clientChunkMaxPages()
  const pages = params.pageCount
  if (pages != null && pages > max) return false
  if (!params.hasLocalFile) return false
  return true
}

export function clientChunkSkipDetail(params: {
  fileName: string
  reason: ClientChunkSkipReason
  pageCount?: number | null
}): string {
  const max = clientChunkMaxPages()
  if (params.reason === 'large_pdf') {
    const pages =
      params.pageCount != null && params.pageCount > 0
        ? `${params.pageCount} pages`
        : 'many pages'
    return `${params.fileName} (${pages}) — server processing (over ${max}-page browser limit)`
  }
  return `${params.fileName} — server processing (file not in this browser session)`
}
