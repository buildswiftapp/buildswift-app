import type { DocumentType } from '@/lib/types'

export type MissingScopeApiType = 'RFI' | 'Submittal' | 'Change Order'

export function docTypeToMissingScopeType(docType: DocumentType): MissingScopeApiType {
  if (docType === 'rfi') return 'RFI'
  if (docType === 'submittal') return 'Submittal'
  return 'Change Order'
}
