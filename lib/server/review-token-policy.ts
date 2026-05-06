/** Default link lifetime when sending for review (days). */
export const DEFAULT_REVIEW_LINK_EXPIRY_DAYS = 7

/** Allowed custom values for `expires_in_days` on send-for-review. */
export const REVIEW_LINK_EXPIRY_DAYS_CHOICES = [3, 7, 14] as const
export type ReviewLinkExpiryDays = (typeof REVIEW_LINK_EXPIRY_DAYS_CHOICES)[number]

export function reviewLinkExpiresAtMs(days: ReviewLinkExpiryDays, fromMs: number = Date.now()) {
  return fromMs + days * 86_400_000
}

/** When `token_expires_at` is null (legacy rows), infer expiry from created_at + fallback days. */
export function resolveReviewTokenExpiresAtMs(params: {
  tokenExpiresAt?: string | null
  createdAt?: string | null
  fallbackDays?: number
}) {
  const fallback = params.fallbackDays ?? DEFAULT_REVIEW_LINK_EXPIRY_DAYS
  if (params.tokenExpiresAt) return Date.parse(params.tokenExpiresAt)
  if (params.createdAt) return Date.parse(params.createdAt) + fallback * 86_400_000
  return Number.NaN
}

import { isFinal, type DocType } from '@/lib/status'

const FINAL_INTERNAL = new Set(['approved', 'rejected'])
const FINAL_EXTERNAL = new Set(['approved', 'rejected'])

/**
 * The reviewer page treats a document as "no longer accepting responses" when:
 *
 *   1. The canonical `status` column says so (any decision-state or `closed`),
 *      or
 *   2. (Legacy fallback during Phase 1) the old `internal_status` /
 *      `external_status` columns indicate approved/rejected.
 *
 * Once Phase 2 retires the legacy columns we can drop the second clause.
 */
export function isDocumentReviewFinal(doc: {
  doc_type?: string | null
  status?: string | null
  internal_status?: string | null
  external_status?: string | null
}) {
  const docType = (doc.doc_type ?? '') as DocType
  if (docType === 'rfi' || docType === 'submittal' || docType === 'change_order') {
    if (isFinal(docType, doc.status ?? null)) return true
  }
  return (
    FINAL_INTERNAL.has(doc.internal_status ?? '') || FINAL_EXTERNAL.has(doc.external_status ?? '')
  )
}

export function isReviewCycleTerminal(status: string | null | undefined) {
  return status === 'approved' || status === 'rejected'
}
