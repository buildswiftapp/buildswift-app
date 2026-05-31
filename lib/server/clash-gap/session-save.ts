export type ClashGapSessionMeta = {
  bookmarkedIds?: string[]
  selectedIssueId?: string | null
}

export function readSavedSession(summary: unknown): {
  savedAt: string | null
  sessionMeta: ClashGapSessionMeta
} {
  if (!summary || typeof summary !== 'object') {
    return { savedAt: null, sessionMeta: {} }
  }
  const row = summary as Record<string, unknown>
  const sessionMeta =
    row.session_meta && typeof row.session_meta === 'object'
      ? (row.session_meta as ClashGapSessionMeta)
      : {}
  return {
    savedAt: typeof row.saved_at === 'string' ? row.saved_at : null,
    sessionMeta,
  }
}

export function mergeSavedSession(
  summary: Record<string, unknown> | null | undefined,
  savedAt: string,
  sessionMeta: ClashGapSessionMeta,
): Record<string, unknown> {
  return {
    ...(summary && typeof summary === 'object' ? summary : {}),
    saved_at: savedAt,
    session_meta: sessionMeta,
  }
}

export function withSavedSessionFields<T extends { summary?: unknown }>(
  row: T,
): T & { saved_at: string | null; session_meta: ClashGapSessionMeta } {
  const { savedAt, sessionMeta } = readSavedSession(row.summary)
  return {
    ...row,
    saved_at: savedAt,
    session_meta: sessionMeta,
  }
}
