import { createHash } from 'crypto'
import {
  ensureRfiFullDescriptionHtml,
  ensureSubmittalFullDescriptionHtml,
} from '@/lib/document-html'
import { notFound, serverError } from '@/lib/server/api-response'
import { getAccountBranding, resolveBrandingLogoDataUriWithSupabase } from '@/lib/server/account-branding'
import { parseBrandingPrimaryColor } from '@/lib/branding-utils'
import { findDocumentById } from '@/lib/server/document-store'
import { generateChangeOrderPdfBuffer } from '@/lib/server/change-order-pdf'
import { generateRfiPdfBuffer } from '@/lib/server/rfi-pdf'
import { generateSubmittalPdfBuffer } from '@/lib/server/submittal-pdf'
import { generateReviewPdfBuffer } from '@/lib/server/review-pdf'
import { isDocumentReviewFinal, isReviewCycleTerminal } from '@/lib/server/review-token-policy'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { createSupabaseServerClient } from '@/lib/server/supabase-server'

type Params = { params: Promise<{ token: string }> }

export const runtime = 'nodejs'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

async function resolveSignatureImageDataUrl(params: {
  supabase: any
  raw: string | null | undefined
}): Promise<string | null> {
  const raw = (params.raw ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('data:image/')) return raw

  // If an absolute URL is stored, fetch and embed.
  if (/^https?:\/\//i.test(raw)) {
    try {
      const res = await fetch(raw, { cache: 'no-store' })
      if (!res.ok) return null
      const mime = res.headers.get('content-type') || 'image/png'
      const ab = await res.arrayBuffer()
      const b64 = Buffer.from(ab).toString('base64')
      return `data:${mime};base64,${b64}`
    } catch {
      return null
    }
  }

  // Otherwise treat it as a Supabase Storage path.
  const bucket = process.env.REVIEW_SIGNATURES_BUCKET || 'document-attachments'
  try {
    const dl = await params.supabase.storage.from(bucket).download(raw)
    if (dl?.error || !dl?.data) return null
    const mime = (dl.data as any).type || 'image/png'
    const ab = await (dl.data as any).arrayBuffer()
    const b64 = Buffer.from(ab).toString('base64')
    return `data:${mime};base64,${b64}`
  } catch {
    return null
  }
}

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params
  const supabase = await createSupabaseServerClient()
  if (!supabase) return serverError('Supabase is not configured')
  const privilegedDb = createSupabaseAdminClient() ?? supabase

  const hashed = hashToken(token)
  const { data: requestRow, error: requestError } = await privilegedDb
    .from('review_requests')
    .select('id,review_cycle_id,reviewer_email')
    .eq('secure_token_hash', hashed)
    .maybeSingle()
  if (requestError) return serverError(requestError.message)
  if (!requestRow) return notFound('Invalid review token')

  const { data: cycleRow, error: cycleError } = await privilegedDb
    .from('review_cycles')
    .select('id,document_id,status')
    .eq('id', requestRow.review_cycle_id)
    .maybeSingle()
  if (cycleError) return serverError(cycleError.message)
  if (!cycleRow) return notFound('Review cycle not found')

  const { data: document, error: documentError } = await findDocumentById({
    supabase: privilegedDb,
    id: cycleRow.document_id,
  })
  if (documentError) return serverError(documentError.message)
  if (!document) return notFound('Document not found')

  if (isDocumentReviewFinal(document) || isReviewCycleTerminal(cycleRow.status)) {
    return notFound('Invalid review token')
  }

  const { data: projectRow, error: projectError } = await privilegedDb
    .from('projects')
    .select('*')
    .eq('id', document.project_id)
    .maybeSingle()
  if (projectError) return serverError(projectError.message)

  const { data: versionRow } = await privilegedDb
    .from('document_versions')
    .select('metadata,created_at')
    .eq('document_id', document.id)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: attachmentRows } = await privilegedDb
    .from('attachments')
    .select('file_name')
    .eq('document_id', document.id)
    .order('created_at', { ascending: true })

  const { data: cycleRequests } = await privilegedDb
    .from('review_requests')
    .select('id,full_name,reviewer_email,decision,decided_at,decision_notes,signature_url,created_at')
    .eq('review_cycle_id', cycleRow.id)
    .order('created_at', { ascending: true })

  const metadata =
    versionRow?.metadata && typeof versionRow.metadata === 'object'
      ? (versionRow.metadata as Record<string, unknown>)
      : {}

  function mergeAttachmentNames(
    meta: Record<string, unknown>,
    dbNames: string[]
  ): string[] | undefined {
    const fromMeta: string[] = []
    const raw = meta.attachments
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (typeof entry === 'string') {
          const t = entry.trim()
          if (t) fromMeta.push(t)
          continue
        }
        if (entry && typeof entry === 'object') {
          const row = entry as Record<string, unknown>
          const name =
            (typeof row.name === 'string' && row.name) ||
            (typeof row.file_name === 'string' && row.file_name) ||
            ''
          const t = name.trim()
          if (t) fromMeta.push(t)
        }
      }
    }
    const fromDb = (dbNames ?? []).map((n) => n.trim()).filter(Boolean)
    const seen = new Set<string>()
    const out: string[] = []
    for (const n of [...fromMeta, ...fromDb]) {
      const key = n.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(n)
    }
    return out.length ? out : undefined
  }

  const linkedDocuments = Array.isArray(metadata.linkedDocuments)
    ? metadata.linkedDocuments
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return ''
          const row = entry as Record<string, unknown>
          const code = typeof row.code === 'string' ? row.code : ''
          const title = typeof row.title === 'string' ? row.title : ''
          return [code, title].filter(Boolean).join(' ')
        })
        .filter(Boolean)
    : []

  const attachmentNames = mergeAttachmentNames(
    metadata,
    (attachmentRows ?? []).map((a) => a.file_name).filter((n): n is string => Boolean(n))
  )

  const projectName = projectRow?.name ?? 'Untitled Project'
  const projectAddress = (projectRow as { address?: string | null } | null)?.address ?? null
  const docForHeader = {
    title: document.title,
    description: document.description ?? '',
    doc_number: document.doc_number,
  }
  let descriptionHtml = docForHeader.description
  if (document.doc_type === 'rfi') {
    descriptionHtml = ensureRfiFullDescriptionHtml(docForHeader, metadata, projectName)
  } else if (document.doc_type === 'submittal') {
    descriptionHtml = ensureSubmittalFullDescriptionHtml(docForHeader, metadata, projectName)
  }

  // Fetch account branding (same as the main documents PDF route)
  const accountId = (document as Record<string, unknown>).account_id as string | undefined
  const { data: brandingRow } = accountId
    ? await getAccountBranding(privilegedDb, accountId)
    : { data: null }
  const brandingCompanyName = brandingRow?.company_name?.trim() || null
  const brandingPrimaryColor = parseBrandingPrimaryColor(brandingRow?.primary_color ?? '')
  const brandingLogoDataUri = brandingRow?.logo_url
    ? await resolveBrandingLogoDataUriWithSupabase(privilegedDb, brandingRow.logo_url)
    : ''

  const { data: accountRow } = accountId
    ? await privilegedDb.from('accounts').select('address,phone').eq('id', accountId).maybeSingle()
    : { data: null }
  const accountContactAddress =
    typeof accountRow?.address === 'string' && accountRow.address.trim() ? accountRow.address.trim() : null
  const accountContactPhone =
    typeof accountRow?.phone === 'string' && accountRow.phone.trim() ? accountRow.phone.trim() : null

  const isApproved = cycleRow.status === 'approved'
  const isRejected = cycleRow.status === 'rejected'
  const reviewStatus = isApproved ? 'APPROVED' : isRejected ? 'REJECTED' : 'PENDING'

  const isChangeOrder = document.doc_type === 'change_order'
  const isRfi = document.doc_type === 'rfi'
  const isSubmittal = document.doc_type === 'submittal'

  const projectNo =
    (typeof metadata.projectNo === 'string' && metadata.projectNo) ||
    (typeof metadata.project_number === 'string' && metadata.project_number) ||
    null
  const contractDate =
    (typeof metadata.contractDate === 'string' && metadata.contractDate) ||
    (typeof metadata.contract_date === 'string' && metadata.contract_date) ||
    null
  const dueDate =
    (typeof metadata.actionNeededBy === 'string' && metadata.actionNeededBy) ||
    (typeof metadata.dueDate === 'string' && metadata.dueDate) ||
    null

  const { data: creatorRow } = document.created_by
    ? await privilegedDb.from('users').select('full_name, email').eq('id', document.created_by).maybeSingle()
    : { data: null }
  const documentAuthorDisplay =
    (creatorRow && typeof creatorRow.full_name === 'string' && creatorRow.full_name.trim()) ||
    (creatorRow && typeof creatorRow.email === 'string' && creatorRow.email.trim()) ||
    null
  const submittedByFromMeta =
    typeof metadata.submittedBy === 'string' && metadata.submittedBy.trim() ? metadata.submittedBy.trim() : null
  const submittedBy = submittedByFromMeta || documentAuthorDisplay || null

  // Reviewer-facing PDF should show ONLY this reviewer's activity (not submitter or other reviewers).
  const viewerRequestId = typeof requestRow.id === 'string' ? requestRow.id : String(requestRow.id ?? '')
  const viewerRequests = (cycleRequests ?? []).filter((r) => String((r as any).id ?? '') === viewerRequestId)
  const requestsForLog = viewerRequests.length ? viewerRequests : (cycleRequests ?? [])

  const reviewerRows = await Promise.all(
    requestsForLog.map(async (row) => ({
      reviewerEmail: typeof row.reviewer_email === 'string' && row.reviewer_email.trim() ? row.reviewer_email.trim() : null,
      title:
        (typeof row.full_name === 'string' && row.full_name.trim()) ||
        (typeof row.reviewer_email === 'string' && row.reviewer_email.trim()) ||
        'Reviewer',
      role: 'Reviewer',
      action:
        row.decision === 'approve'
          ? 'Approved'
          : row.decision === 'reject'
            ? 'Rejected'
            : 'Pending review',
      signature:
        row.decision === 'approve'
          ? ('approved' as const)
          : row.decision === 'reject'
            ? ('rejected' as const)
            : ('pending' as const),
      signatureName:
        row.decision === 'approve' &&
        typeof row.full_name === 'string' &&
        row.full_name.trim()
          ? row.full_name.trim()
          : null,
      signatureUrl: await resolveSignatureImageDataUrl({
        supabase: privilegedDb,
        raw:
          typeof row.signature_url === 'string' && row.signature_url.trim()
            ? row.signature_url.trim()
            : null,
      }),
      date:
        typeof row.decided_at === 'string' && row.decided_at
          ? new Date(row.decided_at).toLocaleDateString('en-US')
          : '—',
      notes:
        !row.decision &&
        !(typeof row.decision_notes === 'string' && row.decision_notes.trim())
          ? 'Awaiting review'
          : typeof row.decision_notes === 'string' && row.decision_notes.trim()
            ? row.decision_notes.trim()
            : row.decision
              ? '—'
              : 'Awaiting review',
    }))
  )

  let submissionDateRaw: string | null = null
  let submissionLogNotes = ''
  if (document.doc_type === 'rfi') {
    submissionDateRaw =
      (typeof metadata.rfiDate === 'string' && metadata.rfiDate.trim()) ||
      (typeof metadata.documentDate === 'string' && metadata.documentDate.trim()) ||
      (typeof metadata.date === 'string' && metadata.date.trim()) ||
      null
    submissionLogNotes = 'RFI submitted'
  } else if (document.doc_type === 'submittal') {
    submissionDateRaw =
      (typeof metadata.submittalDate === 'string' && metadata.submittalDate.trim()) ||
      (typeof metadata.documentDate === 'string' && metadata.documentDate.trim()) ||
      (typeof metadata.date === 'string' && metadata.date.trim()) ||
      null
    submissionLogNotes = 'Submittal created'
  }

  const formattedSubmissionIssued =
    typeof submissionDateRaw === 'string' && submissionDateRaw
      ? (() => {
          const trimmed = submissionDateRaw
          const t = Date.parse(trimmed.includes('T') ? trimmed : trimmed + 'T12:00:00')
          if (!Number.isNaN(t)) {
            return new Date(t).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })
          }
          return trimmed
        })()
      : '—'

  const submissionName =
    (typeof submittedBy === 'string' && submittedBy.trim()) ||
    (typeof documentAuthorDisplay === 'string' && documentAuthorDisplay.trim()) ||
    'Not Provided'

  const submissionRow =
    document.doc_type === 'rfi' || document.doc_type === 'submittal'
      ? [
          {
            title: submissionName,
            role: 'Submitter',
            action: 'Submitted',
            signature: 'pending' as const,
            signatureName: null,
            signatureUrl: null,
            date: formattedSubmissionIssued,
            notes: submissionLogNotes,
          },
        ]
      : []

  const approvalRows = reviewerRows

  const priority = typeof metadata.priority === 'string' ? metadata.priority : null
  const specSection =
    (typeof metadata.specSection === 'string' && metadata.specSection) ||
    (typeof metadata.spec_section === 'string' && metadata.spec_section) ||
    null

  const pdf = isSubmittal
    ? await generateSubmittalPdfBuffer({
        title: document.title,
        projectName,
        descriptionHtml,
        submittalNo:
          (typeof metadata.submittalNumber === 'string' && metadata.submittalNumber) ||
          document.doc_number ||
          null,
        projectAddress:
          (typeof projectAddress === 'string' && projectAddress.trim()) ||
          (typeof metadata.projectAddress === 'string' && metadata.projectAddress) ||
          (typeof metadata.project_address === 'string' && metadata.project_address) ||
          projectNo,
        dateIssued:
          (typeof metadata.submittalDate === 'string' && metadata.submittalDate) ||
          (typeof metadata.documentDate === 'string' && metadata.documentDate) ||
          (typeof metadata.date === 'string' && metadata.date) ||
          null,
        requiredReviewDate:
          (typeof metadata.actionNeededBy === 'string' && metadata.actionNeededBy) ||
          (typeof metadata.requiredReviewDate === 'string' && metadata.requiredReviewDate) ||
          (typeof metadata.dueDate === 'string' && metadata.dueDate) ||
          null,
        to:
          (typeof metadata.to === 'string' && metadata.to) ||
          (typeof metadata.recipient === 'string' && metadata.recipient) ||
          null,
        from:
          (typeof metadata.from === 'string' && metadata.from) ||
          (typeof metadata.sender === 'string' && metadata.sender) ||
          submittedBy,
        submittalType:
          (typeof metadata.submittalType === 'string' && metadata.submittalType) ||
          (typeof metadata.type === 'string' && metadata.type) ||
          null,
        priority,
        detailedDescription:
          (typeof metadata.detailedDescription === 'string' && metadata.detailedDescription) ||
          (typeof metadata.description === 'string' && metadata.description) ||
          null,
        manufacturerVendor:
          (typeof metadata.manufacturer === 'string' && metadata.manufacturer) ||
          (typeof metadata.vendor === 'string' && metadata.vendor) ||
          null,
        materialProductName:
          (typeof metadata.productName === 'string' && metadata.productName) ||
          (typeof metadata.material === 'string' && metadata.material) ||
          null,
        modelNumber:
          (typeof metadata.modelNumber === 'string' && metadata.modelNumber) ||
          (typeof metadata.model === 'string' && metadata.model) ||
          null,
        quantity:
          (typeof metadata.quantity === 'string' && metadata.quantity) ||
          (typeof metadata.qty === 'string' && metadata.qty) ||
          null,
        specificationSections: specSection,
        drawingSheetNumbers:
          (typeof metadata.drawingNumber === 'string' && metadata.drawingNumber) ||
          (typeof metadata.sheetNumber === 'string' && metadata.sheetNumber) ||
          null,
        detailReferences:
          (typeof metadata.detailReference === 'string' && metadata.detailReference) ||
          (typeof metadata.detailReferences === 'string' && metadata.detailReferences) ||
          null,
        relatedRfiNumbers:
          (typeof metadata.rfiNo === 'string' && metadata.rfiNo) ||
          (typeof metadata.relatedRfi === 'string' && metadata.relatedRfi) ||
          null,
        attachments: attachmentNames,
        reviewerComments:
          (typeof metadata.reviewerComments === 'string' && metadata.reviewerComments) ||
          (typeof metadata.comments === 'string' && metadata.comments) ||
          null,
        reviewedBy:
          (typeof metadata.reviewedBy === 'string' && metadata.reviewedBy) || null,
        reviewDate:
          (typeof metadata.reviewDate === 'string' && metadata.reviewDate) || null,
        costImpact:
          (typeof metadata.costImpact === 'string' && metadata.costImpact) || null,
        scheduleImpact:
          (typeof metadata.scheduleImpact === 'string' && metadata.scheduleImpact) || null,
        impactDescription:
          (typeof metadata.impactDescription === 'string' && metadata.impactDescription) || null,
        approvalRows: approvalRows.length ? approvalRows : undefined,
        brandingCompanyName,
        contactAddress: accountContactAddress || process.env.REVIEW_PDF_CONTACT_ADDRESS || null,
        contactPhone: accountContactPhone || process.env.REVIEW_PDF_CONTACT_PHONE || null,
        contactEmail: process.env.REVIEW_PDF_CONTACT_EMAIL || null,
        reviewStatus,
      })
    : isRfi
    ? await generateRfiPdfBuffer({
        title: document.title,
        projectName,
        descriptionHtml,
        rfiNo:
          (typeof metadata.rfiNo === 'string' && metadata.rfiNo) ||
          document.doc_number ||
          null,
        projectNo: (projectAddress && projectAddress.trim()) || projectNo,
        date:
          (typeof metadata.rfiDate === 'string' && metadata.rfiDate) ||
          (typeof metadata.documentDate === 'string' && metadata.documentDate) ||
          (typeof metadata.date === 'string' && metadata.date) ||
          null,
        contractDate:
          (typeof metadata.actionNeededBy === 'string' && metadata.actionNeededBy) ||
          (typeof metadata.dueDate === 'string' && metadata.dueDate) ||
          contractDate,
        submittedBy,
        recipient:
          (typeof metadata.recipient === 'string' && metadata.recipient) ||
          (typeof metadata.to === 'string' && metadata.to) ||
          null,
        sender:
          (typeof metadata.sender === 'string' && metadata.sender) ||
          (typeof metadata.from === 'string' && metadata.from) ||
          submittedBy,
        priority,
        scheduleImpact:
          (typeof metadata.scheduleImpact === 'string' && metadata.scheduleImpact) || null,
        costImpact:
          (typeof metadata.costImpact === 'string' && metadata.costImpact) || null,
        scopeImpact:
          (typeof metadata.scopeImpact === 'string' && metadata.scopeImpact) || null,
        impactDescription:
          (typeof metadata.impactDescription === 'string' && metadata.impactDescription) ||
          (typeof metadata.scopeImpact === 'string' && metadata.scopeImpact) ||
          null,
        reasonForRequest:
          (typeof metadata.reasonForRequest === 'string' && metadata.reasonForRequest) ||
          (typeof metadata.reason === 'string' && metadata.reason) ||
          null,
        conflictIdentification:
          (typeof metadata.conflictIdentification === 'string' && metadata.conflictIdentification) || null,
        missingInformation:
          (typeof metadata.missingInformation === 'string' && metadata.missingInformation) || null,
        clarificationRequired:
          (typeof metadata.clarificationRequired === 'string' && metadata.clarificationRequired) || null,
        drawingNumber:
          (typeof metadata.drawingNumber === 'string' && metadata.drawingNumber) ||
          (typeof metadata.sheetNumber === 'string' && metadata.sheetNumber) ||
          null,
        specificationSection:
          (typeof metadata.specSection === 'string' && metadata.specSection) ||
          (typeof metadata.specificationSection === 'string' && metadata.specificationSection) ||
          null,
        specificReference:
          (typeof metadata.specificReference === 'string' && metadata.specificReference) || null,
        location:
          (typeof metadata.location === 'string' && metadata.location) || null,
        responseContent:
          (typeof metadata.responseContent === 'string' && metadata.responseContent) ||
          (typeof metadata.response === 'string' && metadata.response) ||
          null,
        responder:
          (typeof metadata.responder === 'string' && metadata.responder) ||
          (typeof metadata.respondedBy === 'string' && metadata.respondedBy) ||
          null,
        responseDate:
          (typeof metadata.responseDate === 'string' && metadata.responseDate) || null,
        attachments: (attachmentNames ?? []).map((name) => ({
          fileName: name,
          fileType: name.includes('.') ? name.split('.').pop()?.toUpperCase() || 'FILE' : 'FILE',
          notes: 'Not Provided',
        })),
        brandingCompanyName,
        contactAddress: accountContactAddress || process.env.REVIEW_PDF_CONTACT_ADDRESS || null,
        contactPhone: accountContactPhone || process.env.REVIEW_PDF_CONTACT_PHONE || null,
        contactEmail: process.env.REVIEW_PDF_CONTACT_EMAIL || null,
        approvalRows: approvalRows.length ? approvalRows : undefined,
        reviewStatus,
      })
    : isChangeOrder
    ? await generateChangeOrderPdfBuffer({
        documentId: document.id,
        title: document.title,
        projectName,
        descriptionHtml,
        coNumber:
          (typeof metadata.changeOrderNumber === 'string' && metadata.changeOrderNumber) ||
          document.doc_number ||
          null,
        dateIssued:
          (typeof metadata.changeOrderDate === 'string' && metadata.changeOrderDate) ||
          (typeof metadata.date === 'string' && metadata.date) ||
          null,
        projectAddress:
          (typeof projectAddress === 'string' && projectAddress.trim()) ||
          (typeof metadata.projectAddress === 'string' && metadata.projectAddress) ||
          (typeof metadata.project_address === 'string' && metadata.project_address) ||
          projectNo,
        fromContractor:
          (typeof metadata.from === 'string' && metadata.from) ||
          (typeof metadata.contractor === 'string' && metadata.contractor) ||
          (typeof metadata.sender === 'string' && metadata.sender) ||
          null,
        submittedBy,
        requiredReviewDate:
          (typeof metadata.requiredReviewDate === 'string' && metadata.requiredReviewDate.trim()) ||
          (typeof metadata.actionNeededBy === 'string' && metadata.actionNeededBy.trim()) ||
          (typeof metadata.dueDate === 'string' && metadata.dueDate.trim()) ||
          null,
        quantity:
          typeof metadata.quantity === 'number'
            ? metadata.quantity
            : typeof metadata.quantity === 'string'
              ? metadata.quantity
              : typeof metadata.specQuantity === 'string'
                ? metadata.specQuantity
                : typeof metadata.changeOrderQty === 'string'
                  ? metadata.changeOrderQty
                  : null,
        primeContractValue:
          typeof metadata.contractAmount === 'number'
            ? metadata.contractAmount
            : typeof metadata.contractAmount === 'string'
              ? metadata.contractAmount
              : typeof metadata.primeContractValue === 'number'
                ? metadata.primeContractValue
                : typeof metadata.primeContractValue === 'string'
                  ? metadata.primeContractValue
                  : null,
        changeType: typeof metadata.changeType === 'string' ? metadata.changeType : null,
        priority,
        reason: (typeof metadata.reason === 'string' && metadata.reason) || null,
        reasonCategory: typeof metadata.reasonCategory === 'string' ? metadata.reasonCategory : null,
        status:
          reviewStatus === 'APPROVED' ? 'APPROVED' : reviewStatus === 'REJECTED' ? 'REJECTED' : 'PENDING',
        scheduleImpact:
          (typeof metadata.scheduleImpact === 'string' && metadata.scheduleImpact) || null,
        newCompletionDate:
          (typeof metadata.newCompletionDate === 'string' && metadata.newCompletionDate) || null,
        scheduleDays:
          typeof metadata.scheduleDays === 'number' || typeof metadata.scheduleDays === 'string'
            ? metadata.scheduleDays
            : null,
        totalCost:
          typeof metadata.proposedAmount === 'number'
            ? metadata.proposedAmount
            : typeof metadata.proposedAmount === 'string'
              ? Number.parseFloat(metadata.proposedAmount) || 0
              : 0,
        costBreakdownItems: Array.isArray(metadata.costBreakdownItems)
          ? (metadata.costBreakdownItems as Array<{
              description: string
              quantity: number
              unitPrice: number
              total: number
            }>)
          : null,
        laborCost:
          typeof metadata.laborCost === 'number'
            ? metadata.laborCost
            : typeof metadata.laborCost === 'string'
              ? metadata.laborCost
              : null,
        materialCost:
          typeof metadata.materialCost === 'number'
            ? metadata.materialCost
            : typeof metadata.materialCost === 'string'
              ? metadata.materialCost
              : null,
        equipmentCost:
          typeof metadata.equipmentCost === 'number'
            ? metadata.equipmentCost
            : typeof metadata.equipmentCost === 'string'
              ? metadata.equipmentCost
              : null,
        subcontractorCost:
          typeof metadata.subcontractorCost === 'number'
            ? metadata.subcontractorCost
            : typeof metadata.subcontractorCost === 'string'
              ? metadata.subcontractorCost
              : null,
        overheadProfit:
          typeof metadata.overheadProfit === 'number'
            ? metadata.overheadProfit
            : typeof metadata.overheadProfit === 'string'
              ? metadata.overheadProfit
              : null,
        updatedContractValue:
          typeof metadata.updatedContractValue === 'number'
            ? metadata.updatedContractValue
            : typeof metadata.updatedContractValue === 'string'
              ? metadata.updatedContractValue
              : null,
        drawingSheetNumbers:
          (typeof metadata.drawingNumber === 'string' && metadata.drawingNumber) ||
          (typeof metadata.sheetNumber === 'string' && metadata.sheetNumber) ||
          (typeof metadata.drawingSheetNumbers === 'string' && metadata.drawingSheetNumbers) ||
          null,
        specificationSections:
          (typeof metadata.specSection === 'string' && metadata.specSection) ||
          (typeof metadata.specificationSections === 'string' && metadata.specificationSections) ||
          null,
        detailReferences:
          (typeof metadata.detailReference === 'string' && metadata.detailReference) ||
          (typeof metadata.detailReferences === 'string' && metadata.detailReferences) ||
          null,
        relatedRfiNumbers:
          (typeof metadata.rfiNo === 'string' && metadata.rfiNo) ||
          (typeof metadata.relatedRfiNumbers === 'string' && metadata.relatedRfiNumbers) ||
          (typeof metadata.relatedRfi === 'string' && metadata.relatedRfi) ||
          null,
        relatedSubmittalNumbers:
          (typeof metadata.submittalNumber === 'string' && metadata.submittalNumber) ||
          (typeof metadata.relatedSubmittalNumbers === 'string' && metadata.relatedSubmittalNumbers) ||
          null,
        reviewerComments:
          (typeof metadata.reviewerComments === 'string' && metadata.reviewerComments) ||
          (typeof metadata.comments === 'string' && metadata.comments) ||
          null,
        reviewedBy: (typeof metadata.reviewedBy === 'string' && metadata.reviewedBy) || null,
        reviewDate: (typeof metadata.reviewDate === 'string' && metadata.reviewDate) || null,
        attachments:
          Array.isArray(metadata.attachments) && metadata.attachments.length > 0
            ? (metadata.attachments as Array<Record<string, unknown>>)
            : attachmentNames ?? [],
        approvalRows: approvalRows.length ? approvalRows : undefined,
        brandingCompanyName,
        brandingLogoDataUri: brandingLogoDataUri || null,
        contactAddress: accountContactAddress || process.env.REVIEW_PDF_CONTACT_ADDRESS || null,
        contactPhone: accountContactPhone || process.env.REVIEW_PDF_CONTACT_PHONE || null,
        contactEmail: process.env.REVIEW_PDF_CONTACT_EMAIL || null,
      })
    : await generateReviewPdfBuffer({
        title: document.title,
        projectName,
        docType: document.doc_type,
        descriptionHtml,
        applyAccountBranding: true,
        brandingCompanyName,
        brandingPrimaryColor,
        brandingLogoDataUri: brandingLogoDataUri || null,
        projectNo,
        reportDate:
          (typeof metadata.date === 'string' && metadata.date) ||
          (typeof metadata.changeOrderDate === 'string' && metadata.changeOrderDate) ||
          null,
        contractDate,
        actionNeededBy:
          (typeof metadata.actionNeededBy === 'string' && metadata.actionNeededBy) || null,
        submittedBy,
        rfiNo:
          (typeof metadata.rfiNo === 'string' && metadata.rfiNo) ||
          (typeof metadata.changeOrderNumber === 'string' && metadata.changeOrderNumber) ||
          null,
        specSection,
        priority,
        attachments: attachmentNames,
        linkedDocuments: linkedDocuments.length ? linkedDocuments : undefined,
        reviewStatus,
        metadata,
      })

  const body: Uint8Array = pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf)
  return new Response(body as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="review-${document.id}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}

