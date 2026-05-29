export type DocType = 'rfi' | 'submittal' | 'change_order'

export const RFI_STATUSES = ['pending', 'answered', 'closed'] as const
export const SUBMITTAL_STATUSES = [
  'pending_review',
  'approved',
  'approved_as_noted',
  'revise_and_resubmit',
  'rejected',
  'closed',
] as const
export const CHANGE_ORDER_STATUSES = [
  'draft',
  'under_review',
  'approved',
  'rejected',
  'closed',
] as const

export type RfiStatus = (typeof RFI_STATUSES)[number]
export type SubmittalStatus = (typeof SUBMITTAL_STATUSES)[number]
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number]
export type DocStatus = RfiStatus | SubmittalStatus | ChangeOrderStatus

export type ReviewerOutcome =
  | 'approved'
  | 'approved_as_noted'
  | 'revise_and_resubmit'
  | 'rejected'
  | 'answered'

export const REVIEWER_OUTCOMES_BY_DOC: Record<DocType, ReadonlyArray<ReviewerOutcome>> = {
  rfi: ['answered'],
  submittal: ['approved', 'approved_as_noted', 'revise_and_resubmit', 'rejected'],
  change_order: ['approved', 'rejected'],
}

export function normalizeReviewerOutcome(
  docType: DocType,
  raw: string | null | undefined
): ReviewerOutcome | null {
  if (typeof raw !== 'string' || !raw.length) return null
  const v = raw.toLowerCase()

  if (docType === 'rfi') {
    if (v === 'approve' || v === 'approved' || v === 'reject' || v === 'rejected' || v === 'answered') {
      return 'answered'
    }
    return null
  }

  if (docType === 'submittal') {
    if (v === 'approve' || v === 'approved') return 'approved'
    if (v === 'reject' || v === 'rejected') return 'rejected'
    if (v === 'approved_as_noted') return 'approved_as_noted'
    if (v === 'revise_and_resubmit') return 'revise_and_resubmit'
    return null
  }

  if (docType === 'change_order') {
    if (v === 'approve' || v === 'approved') return 'approved'
    if (v === 'reject' || v === 'rejected') return 'rejected'
    return null
  }

  return null
}

export function legacyDecisionForOutcome(outcome: ReviewerOutcome): 'approve' | 'reject' {
  if (outcome === 'rejected' || outcome === 'revise_and_resubmit') return 'reject'
  return 'approve'
}

export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

export type StatusBadge = {
  label: string
  tone: StatusTone
}

const RFI_BADGES: Record<RfiStatus, StatusBadge> = {
  pending: { label: 'Pending', tone: 'info' },
  answered: { label: 'Answered', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
}

const SUBMITTAL_BADGES: Record<SubmittalStatus, StatusBadge> = {
  pending_review: { label: 'Pending Review', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  approved_as_noted: { label: 'Approved as Noted', tone: 'success' },
  revise_and_resubmit: { label: 'Revise & Resubmit', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
  closed: { label: 'Closed', tone: 'neutral' },
}

const CHANGE_ORDER_BADGES: Record<ChangeOrderStatus, StatusBadge> = {
  draft: { label: 'Draft', tone: 'neutral' },
  under_review: { label: 'Under Review', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  closed: { label: 'Closed', tone: 'neutral' },
}

const PDF_LABEL_OVERRIDES: Partial<Record<DocStatus, string>> = {
  pending: 'PENDING',
  pending_review: 'PENDING REVIEW',
  under_review: 'UNDER REVIEW',
  draft: 'DRAFT',
  answered: 'ANSWERED',
  approved: 'APPROVED',
  approved_as_noted: 'APPROVED AS NOTED',
  revise_and_resubmit: 'REVISE & RESUBMIT',
  rejected: 'REJECTED',
  closed: 'CLOSED',
}

const FINAL_STATUSES_BY_DOC: Record<DocType, ReadonlySet<string>> = {
  rfi: new Set<string>(['answered', 'closed']),
  submittal: new Set<string>([
    'approved',
    'approved_as_noted',
    'revise_and_resubmit',
    'rejected',
    'closed',
  ]),
  change_order: new Set<string>(['approved', 'rejected', 'closed']),
}

const ALL_STATUSES_BY_DOC: Record<DocType, ReadonlyArray<string>> = {
  rfi: RFI_STATUSES,
  submittal: SUBMITTAL_STATUSES,
  change_order: CHANGE_ORDER_STATUSES,
}
export function initialStatus(docType: DocType, saveAsDraft: boolean): DocStatus {
  if (docType === 'change_order') {
    return saveAsDraft ? 'draft' : 'under_review'
  }
  if (docType === 'rfi') return 'pending'
  return 'pending_review'
}

export function statusOnSendForReview(docType: DocType): DocStatus {
  if (docType === 'rfi') return 'pending'
  if (docType === 'submittal') return 'pending_review'
  return 'under_review'
}

export function statusOnReviewerOutcome(docType: DocType, outcome: ReviewerOutcome): DocStatus {
  if (docType === 'rfi') {
    return 'answered'
  }
  if (docType === 'submittal') {
    if (
      outcome === 'approved' ||
      outcome === 'approved_as_noted' ||
      outcome === 'revise_and_resubmit' ||
      outcome === 'rejected'
    ) {
      return outcome
    }
    return 'pending_review'
  }
  if (docType === 'change_order') {
    if (outcome === 'approved') return 'approved'
    if (outcome === 'rejected') return 'rejected'
    return 'under_review'
  }
  return 'pending_review'
}

export function statusOnClose(_docType: DocType): DocStatus {
  return 'closed'
}

export function isFinal(docType: DocType, status: string | null | undefined): boolean {
  return FINAL_STATUSES_BY_DOC[docType].has(String(status ?? ''))
}

export function isLocked(_docType: DocType, status: string | null | undefined): boolean {
  return String(status ?? '') === 'closed'
}

export function canClose(docType: DocType, status: string | null | undefined): boolean {
  if (!isKnownStatus(docType, status)) {
    return true
  }
  return !isLocked(docType, status)
}

export function isKnownStatus(docType: DocType, status: string | null | undefined): boolean {
  if (typeof status !== 'string' || status.length === 0) return false
  return ALL_STATUSES_BY_DOC[docType].includes(status)
}

export function statusBadge(docType: DocType, status: string | null | undefined): StatusBadge {
  const safe = typeof status === 'string' ? status : ''
  if (docType === 'rfi') {
    if ((RFI_STATUSES as ReadonlyArray<string>).includes(safe)) {
      return RFI_BADGES[safe as RfiStatus]
    }
  } else if (docType === 'submittal') {
    if ((SUBMITTAL_STATUSES as ReadonlyArray<string>).includes(safe)) {
      return SUBMITTAL_BADGES[safe as SubmittalStatus]
    }
  } else if (docType === 'change_order') {
    if ((CHANGE_ORDER_STATUSES as ReadonlyArray<string>).includes(safe)) {
      return CHANGE_ORDER_BADGES[safe as ChangeOrderStatus]
    }
  }
  return { label: humanizeFallback(safe || 'Draft'), tone: 'neutral' }
}

export function pdfStatusLabel(docType: DocType, status: string | null | undefined): string {
  const safe = typeof status === 'string' ? status : ''
  const override = PDF_LABEL_OVERRIDES[safe as DocStatus]
  if (override) return override
  return statusBadge(docType, safe).label.toUpperCase()
}

export function statusBadgeClasses(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'danger':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-800'
    case 'info':
      return 'border-sky-200 bg-sky-50 text-sky-800'
    case 'neutral':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700'
  }
}

export function backfillFromLegacy(
  docType: DocType,
  internalStatus: string | null | undefined,
  externalStatus: string | null | undefined,
  latestCycleStatus: string | null | undefined
): DocStatus {
  const i = (internalStatus ?? '').toLowerCase()
  const e = (externalStatus ?? '').toLowerCase()
  const c = (latestCycleStatus ?? '').toLowerCase()

  const approved = i === 'approved' || e === 'approved' || c === 'approved'
  const rejected = i === 'rejected' || e === 'rejected' || c === 'rejected'
  const isReviewing =
    i === 'in_review' ||
    i === 'pending_reviewer' ||
    i === 'revising' ||
    e === 'sent' ||
    e === 'pending_reviewer'
  const isDraft = i === 'draft' || (!i && !e && !c)

  if (docType === 'rfi') {
    if (approved || rejected) return 'answered'
    return 'pending'
  }
  if (docType === 'submittal') {
    if (approved) return 'approved'
    if (rejected) return 'rejected'
    return 'pending_review'
  }
  if (approved) return 'approved'
  if (rejected) return 'rejected'
  if (isDraft) return 'draft'
  if (isReviewing) return 'under_review'
  return 'draft'
}

export function asDocStatus(docType: DocType, raw: string | null | undefined): DocStatus | null {
  return isKnownStatus(docType, raw) ? (raw as DocStatus) : null
}

function humanizeFallback(s: string): string {
  return s
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase())
}
