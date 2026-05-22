import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { getAccountBranding, resolveBrandingLogoDataUriWithSupabase } from '@/lib/server/account-branding'
import {
  ClashGapReportDocument,
  type ClashGapReportIssue,
  type ClashGapReportViewModel,
} from '@/lib/server/clash-gap/clash-gap-report-document'

export async function generateClashGapReportPdf(params: {
  supabase: any
  accountId: string
  project: { name: string; address?: string | null; job_number?: string | null }
  summary: { total: number; by_type: { clash: number; gap: number; mismatch: number } }
  issues: Array<{
    type: string
    title: string
    description: string
    severity: string
    sheet_reference: string | null
    suggested_action: string | null
    location: string | null
  }>
  files: Array<{ file_name: string }>
}): Promise<Buffer> {
  const branding = await getAccountBranding(params.supabase, params.accountId)
  const companyName = branding.data?.company_name || 'BuildSwift'

  const reportIssues: ClashGapReportIssue[] = params.issues.map((row) => ({
    type: row.type,
    title: row.title,
    description: row.description,
    severity: row.severity,
    sheetReference: row.sheet_reference || '—',
    suggestedAction: row.suggested_action || '',
    location: row.location || '',
  }))

  const viewModel: ClashGapReportViewModel = {
    projectName: params.project.name,
    projectAddress: params.project.address || '',
    jobNumber: params.project.job_number || '',
    generatedAt: new Date().toLocaleString(),
    companyName,
    summary: {
      total: params.summary.total,
      clash: params.summary.by_type.clash,
      gap: params.summary.by_type.gap,
      mismatch: params.summary.by_type.mismatch,
    },
    issues: reportIssues,
    attachments: params.files.map((f) => f.file_name),
  }

  if (branding.data?.logo_url) {
    await resolveBrandingLogoDataUriWithSupabase(params.supabase, branding.data.logo_url)
  }

  return await renderToBuffer(
    React.createElement(ClashGapReportDocument, { data: viewModel }) as React.ReactElement
  )
}
