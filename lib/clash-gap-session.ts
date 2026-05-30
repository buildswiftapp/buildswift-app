import type { StagesMap } from '@/lib/clash-gap-stages'
import type {
  ClashGapIssue,
  DetectionSettings,
  DetectionWizardStep,
  DocumentUploadRow,
} from '@/lib/clash-gap-types'

export const CLASH_GAP_SESSION_STORAGE_KEY = 'buildswift:clashGapSession'

export type ClashGapSessionRow = Omit<DocumentUploadRow, 'file'> & {
  restored?: boolean
}

export type ClashGapSessionV1 = {
  version: 1
  analysisId?: string | null
  projectId: string
  settings: DetectionSettings
  rows: ClashGapSessionRow[]
  issues: ClashGapIssue[]
  ignoredIds: string[]
  selectedIssueId: string | null
  bookmarkedIds: string[]
  phase?: 'prepare' | 'results'
  activeStep?: DetectionWizardStep
  stages?: StagesMap
}
