import {
  CLASH_GAP_UPLOAD_TYPES,
  type DocumentLabelType,
  type DocumentUploadRow,
} from '@/lib/clash-gap-types'

export function fileRoleFromDocType(type: DocumentLabelType | null): 'plans' | 'specs' | 'addenda' {
  if (type === 'specs') return 'specs'
  if (type === 'addenda') return 'addenda'
  return 'plans'
}

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

export function getEligibleUploadRows(rows: DocumentUploadRow[]): DocumentUploadRow[] {
  return rows.filter((r) => r.status === 'ready' && Boolean(r.serverFileId))
}

function activeUploadRows(rows: DocumentUploadRow[]): DocumentUploadRow[] {
  return rows.filter((r) => r.status !== 'error')
}

export function isImageUploadFilename(filename: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(filename.trim())
}

export function isPdfUploadFilename(filename: string): boolean {
  return /\.pdf$/i.test(filename.trim())
}

export function hasPlansDocument(rows: DocumentUploadRow[]): boolean {
  return getEligibleUploadRows(rows).some((r) => r.type === 'plans' || r.type === 'plans_specs')
}

export function hasSpecsDocument(rows: DocumentUploadRow[]): boolean {
  return getEligibleUploadRows(rows).some(
    (r) => r.type === 'specs' || r.type === 'addenda' || r.type === 'plans_specs',
  )
}

function hasPlansRoleAssigned(rows: DocumentUploadRow[]): boolean {
  return activeUploadRows(rows).some((r) => fileRoleFromDocType(r.type) === 'plans')
}

function hasSpecsRoleAssigned(rows: DocumentUploadRow[]): boolean {
  return activeUploadRows(rows).some((r) => {
    const role = fileRoleFromDocType(r.type)
    return role === 'specs' || role === 'addenda'
  })
}

export function canRunClashGapDetection(rows: DocumentUploadRow[]): boolean {
  return hasPlansDocument(rows) && hasSpecsDocument(rows)
}

export function sanitizeClashGapDocumentType(
  type: DocumentLabelType | null,
): DocumentLabelType | null {
  if (type === null) return null
  if ((CLASH_GAP_UPLOAD_TYPES as readonly string[]).includes(type)) return type
  return 'plans'
}

export function hasReadyUploads(rows: DocumentUploadRow[]): boolean {
  return rows.some((r) => r.status === 'ready' && Boolean(r.serverFileId))
}

export function uploadsStillPending(rows: DocumentUploadRow[]): boolean {
  return rows.some((r) => r.status === 'pending' || (r.file && !r.serverFileId))
}

export function describeRunDetectionGate(
  rows: DocumentUploadRow[],
  options?: { projectSelected?: boolean },
): string | null {
  if (options?.projectSelected === false) {
    return 'Select a project before running detection.'
  }
  if (uploadsStillPending(rows)) {
    return 'Wait for uploads to finish (status must show ready).'
  }
  if (!hasReadyUploads(rows)) {
    return 'Upload at least one file and wait until it finishes uploading.'
  }
  return missingDocumentRolesMessage(rows)
}

export function missingDocumentRolesMessage(rows: DocumentUploadRow[]): string | null {
  const missing: string[] = []
  if (!hasPlansDocument(rows)) missing.push('Plans')
  if (!hasSpecsDocument(rows)) missing.push('Specifications (or Addenda)')
  if (!missing.length) return null
  return `Set Document type to ${missing.join(' and ')} for at least one uploaded file in the table (Upload step).`
}

export function applyInferredTypesWhereNeeded(rows: DocumentUploadRow[]): DocumentUploadRow[] {
  return rows.map((row) => {
    if (row.status !== 'ready' || !row.serverFileId) return row
    const inferred = inferDocumentLabelType(row.filename)
    if (row.type === 'plans' && (inferred === 'specs' || inferred === 'addenda')) {
      return { ...row, type: inferred }
    }
    return row
  })
}

export function assignDocumentTypesForIngest(
  newRows: DocumentUploadRow[],
  existingRows: DocumentUploadRow[],
): DocumentUploadRow[] {
  const assigned = newRows.map((row) => ({
    ...row,
    type: inferDocumentLabelType(row.filename),
  }))

  const combined = [...existingRows, ...assigned]
  if (hasPlansRoleAssigned(combined) && hasSpecsRoleAssigned(combined)) {
    return assigned
  }

  const imageCount = combined.filter((r) => isImageUploadFilename(r.filename)).length

  if (existingRows.length === 0 && assigned.length >= 2 && imageCount >= 2) {
    assigned[0]!.type = 'plans'
    assigned[1]!.type = 'specs'
    return assigned
  }

  if (existingRows.length === 0 && assigned.length === 2) {
    const [first, second] = assigned
    if (first.type !== 'specs' && second.type !== 'specs') {
      second.type = 'specs'
    } else if (first.type === 'specs' && second.type !== 'plans') {
      second.type = 'plans'
    }
    return assigned
  }

  if (hasPlansRoleAssigned(existingRows) && !hasSpecsRoleAssigned(existingRows)) {
    for (const row of assigned) {
      if (row.type === 'plans' && inferDocumentLabelType(row.filename) !== 'plans') {
        row.type = 'specs'
      }
    }
    if (!hasSpecsRoleAssigned([...existingRows, ...assigned]) && assigned.length >= 1) {
      assigned[0]!.type = 'specs'
    }
  }

  if (hasSpecsRoleAssigned(existingRows) && !hasPlansRoleAssigned(existingRows)) {
    for (const row of assigned) {
      if (row.type === 'specs' && inferDocumentLabelType(row.filename) === 'plans') {
        row.type = 'plans'
      }
    }
    if (!hasPlansRoleAssigned([...existingRows, ...assigned]) && assigned.length >= 1) {
      assigned[0]!.type = 'plans'
    }
  }

  return assigned
}

export function reconcileDocumentTypes(rows: DocumentUploadRow[]): DocumentUploadRow[] {
  return rows.map((row) => ({ ...row, type: sanitizeClashGapDocumentType(row.type) }))
}
