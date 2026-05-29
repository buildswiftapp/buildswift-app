import type { ApiClashGapFile } from '@/lib/clash-gap-api'
import { sanitizeClashGapDocumentType } from '@/lib/clash-gap-document-inference'
import type { DocumentLabelType, DocumentUploadRow } from '@/lib/clash-gap-types'

export function displayPageCount(pageCount: number | null | undefined): number | '—' {
  if (typeof pageCount !== 'number' || !Number.isFinite(pageCount) || pageCount < 1) {
    return '—'
  }
  return Math.floor(pageCount)
}

function docTypeFromFileRole(role: string): DocumentLabelType {
  if (role === 'specs') return 'specs'
  if (role === 'addenda') return 'addenda'
  return 'plans'
}

export function mapApiFilesToUploadRows(files: ApiClashGapFile[]): DocumentUploadRow[] {
  return files.map((f) => ({
    id: f.id,
    serverFileId: f.id,
    filename: f.file_name,
    type: sanitizeClashGapDocumentType(docTypeFromFileRole(f.file_role)),
    pages: displayPageCount(f.page_count),
    status: 'ready' as const,
  }))
}
