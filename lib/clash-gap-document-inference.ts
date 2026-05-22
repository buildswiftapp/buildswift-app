import type { DocumentLabelType, DocumentUploadRow } from '@/lib/clash-gap-types'

export function fileRoleFromDocType(type: DocumentLabelType): 'plans' | 'specs' | 'addenda' {
  if (type === 'specs') return 'specs'
  if (type === 'addenda') return 'addenda'
  return 'plans'
}

/** Infer document type from filename for construction uploads. */
export function inferDocumentLabelType(filename: string): DocumentLabelType {
  const name = filename.toLowerCase().replace(/[_-]+/g, ' ')

  if (/\baddend(a|um)|bulletin|\basi\b|modification\b/.test(name)) return 'addenda'
  if (
    /\bspec(ification)?s?\b/.test(name) ||
    /\bproject\s+manual\b/.test(name) ||
    /\btechnical\s+spec/.test(name) ||
    /\bmaster\s+spec/.test(name)
  ) {
    return 'specs'
  }
  if (
    /\bplans?\b/.test(name) ||
    /\bdrawing/.test(name) ||
    /\bsheet\b/.test(name) ||
    /\barchitectural\b/.test(name) ||
    /\bstructural\b/.test(name) ||
    /\bmechanical\b/.test(name) ||
    /\belectrical\b/.test(name) ||
    /\bplumbing\b/.test(name) ||
    /\bcivil\b/.test(name) ||
    /\b(m|e|a|s|p)[\s.-]?\d{1,3}\b/.test(name)
  ) {
    return 'plans'
  }

  return 'plans'
}

export function hasPlansDocument(rows: DocumentUploadRow[]): boolean {
  return rows.some((r) => fileRoleFromDocType(r.type) === 'plans')
}

export function hasSpecsDocument(rows: DocumentUploadRow[]): boolean {
  return rows.some((r) => {
    const role = fileRoleFromDocType(r.type)
    return role === 'specs' || role === 'addenda'
  })
}

export function canRunClashGapDetection(rows: DocumentUploadRow[]): boolean {
  return hasPlansDocument(rows) && hasSpecsDocument(rows)
}

export function missingDocumentRolesMessage(rows: DocumentUploadRow[]): string | null {
  const missing: string[] = []
  if (!hasPlansDocument(rows)) missing.push('Plans')
  if (!hasSpecsDocument(rows)) missing.push('Specifications')
  if (!missing.length) return null
  return `Upload at least one ${missing.join(' and ')} document (set Document type in the table).`
}

/**
 * Assign document types for newly ingested files using filename inference and
 * ensuring a two-file upload can satisfy plans + specs when names are ambiguous.
 */
export function assignDocumentTypesForIngest(
  newRows: DocumentUploadRow[],
  existingRows: DocumentUploadRow[],
): DocumentUploadRow[] {
  const assigned = newRows.map((row) => ({
    ...row,
    type: inferDocumentLabelType(row.filename),
  }))

  const combined = [...existingRows, ...assigned]
  if (hasPlansDocument(combined) && hasSpecsDocument(combined)) {
    return assigned
  }

  // Two new files, empty session: common case — one plans, one specs.
  if (existingRows.length === 0 && assigned.length === 2) {
    const [first, second] = assigned
    if (first.type !== 'specs' && second.type !== 'specs') {
      second.type = 'specs'
    } else if (first.type === 'specs' && second.type !== 'plans') {
      second.type = 'plans'
    }
    return assigned
  }

  // Already have plans but no specs — bias ambiguous new uploads toward specs.
  if (hasPlansDocument(existingRows) && !hasSpecsDocument(existingRows)) {
    for (const row of assigned) {
      if (row.type === 'plans' && inferDocumentLabelType(row.filename) !== 'plans') {
        row.type = 'specs'
      }
    }
    if (!hasSpecsDocument([...existingRows, ...assigned]) && assigned.length === 1) {
      assigned[0].type = 'specs'
    }
  }

  // Already have specs but no plans — bias ambiguous new uploads toward plans.
  if (hasSpecsDocument(existingRows) && !hasPlansDocument(existingRows)) {
    for (const row of assigned) {
      if (row.type === 'specs' && inferDocumentLabelType(row.filename) === 'plans') {
        row.type = 'plans'
      }
    }
    if (!hasPlansDocument([...existingRows, ...assigned]) && assigned.length === 1) {
      assigned[0].type = 'plans'
    }
  }

  return assigned
}

/** Re-apply filename inference to existing rows (e.g. before run). */
export function reconcileDocumentTypes(rows: DocumentUploadRow[]): DocumentUploadRow[] {
  const inferred = rows.map((row) => ({
    ...row,
    type: inferDocumentLabelType(row.filename),
  }))
  if (canRunClashGapDetection(inferred)) return inferred

  if (rows.length === 2) {
    const [first, second] = inferred.map((r) => ({ ...r }))
    if (!hasSpecsDocument([first, second])) {
      if (second.type !== 'specs') second.type = 'specs'
      else if (first.type === 'specs') first.type = 'plans'
    }
    if (!hasPlansDocument([first, second]) && first.type === 'specs') {
      first.type = 'plans'
    }
    return [first, second]
  }

  return inferred
}
