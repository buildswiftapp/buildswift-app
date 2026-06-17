import { config } from '../config.js'
import { isUsableEmbeddedText } from './text-quality.js'

export type FileRole = 'plans' | 'specs' | 'addenda' | 'other'
export type PageKind = 'TEXT' | 'TEXT_SCAN' | 'DRAWING' | 'MIXED'

export function normalizeFileRole(role: string | null | undefined): FileRole {
  const r = (role ?? 'plans').toLowerCase()
  if (r === 'specs' || r === 'addenda' || r === 'plans') return r
  return 'other'
}

export function resolvePageKind(fileRole: FileRole, embeddedText: string): PageKind {
  const emb = embeddedText.trim()
  const embUsable = isUsableEmbeddedText(emb)

  if (fileRole === 'specs' || fileRole === 'addenda') {
    if (embUsable && emb.length >= config.ocrEmbeddedMinLen) return 'TEXT'
    return 'TEXT_SCAN'
  }

  if (embUsable && emb.length >= config.ocrPlanEmbeddedMinLen) return 'MIXED'
  return 'DRAWING'
}

export function minTextLengthForKind(kind: PageKind): number {
  switch (kind) {
    case 'TEXT':
      return config.ocrEmbeddedMinLen
    case 'TEXT_SCAN':
      return config.ocrSpecMinLen
    case 'DRAWING':
    case 'MIXED':
      return config.ocrPlanMinLen
  }
}

export function ocrDpiForKind(kind: PageKind): number {
  switch (kind) {
    case 'TEXT':
      return config.ocrSpecDpi
    case 'TEXT_SCAN':
      return config.ocrSpecDpi
    case 'DRAWING':
    case 'MIXED':
      return config.ocrPlanDpi
  }
}

export function shouldRunTiledEscalation(kind: PageKind): boolean {
  return kind === 'DRAWING' || kind === 'MIXED'
}

export function shouldUseRegionOcr(fileRole: FileRole, kind: PageKind): boolean {
  return fileRole === 'plans' && (kind === 'DRAWING' || kind === 'MIXED')
}
