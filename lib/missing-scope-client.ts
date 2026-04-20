import type { DocumentType } from '@/lib/types'

export type MissingScopeApiType = 'RFI' | 'Submittal' | 'Change Order'

export type MissingScopeApiResponse = {
  issues: string[]
  suggestions: string[]
}

function missingScopeSeedStorageKey(type: MissingScopeApiType): string {
  return `buildswift:missing-scope:seed:${type}`
}

export function getMissingScopeSeed(type: MissingScopeApiType): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(missingScopeSeedStorageKey(type))
    if (!raw) return null
    const trimmed = raw.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

export function setMissingScopeSeedIfMissing(type: MissingScopeApiType, seed: string): void {
  if (typeof window === 'undefined') return
  const trimmed = seed.trim()
  if (!trimmed) return
  try {
    const key = missingScopeSeedStorageKey(type)
    const existing = window.localStorage.getItem(key)
    if (existing && existing.trim().length > 0) return
    window.localStorage.setItem(key, trimmed)
  } catch {
    // Ignore localStorage access errors (private mode / browser policy).
  }
}

export function docTypeToMissingScopeType(docType: DocumentType): MissingScopeApiType {
  if (docType === 'rfi') return 'RFI'
  if (docType === 'submittal') return 'Submittal'
  return 'Change Order'
}
