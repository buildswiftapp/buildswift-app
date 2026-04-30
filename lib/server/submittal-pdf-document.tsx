import React from 'react'
import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import { stripHtmlToPlainParagraphs } from '@/lib/document-html'
import { PdfHeader } from '@/lib/server/pdf-header'

export type SubmittalAttachmentRow = {
  fileName: string
  fileType: string
  notes: string
}

export type SubmittalApprovalRow = {
  name: string
  role: string
  action: string
  date: string
  notes: string
  signatureName?: string | null
  signatureUrl?: string | null
}

export type SubmittalPdfViewModel = {
  // Branding / header
  logoDataUri: string
  brand: string
  brandSub: string
  themePrimary: string
  contactAddress: string
  contactPhone: string
  contactEmail: string

  // Header / project info
  projectName: string
  projectAddress: string
  submittalNumber: string
  status: string
  dateIssued: string
  requiredReviewDate: string
  to: string
  from: string

  // Summary
  submittalTitle: string
  submittalType: string
  priority: string

  // Details
  detailedDescription: string
  manufacturerVendor: string
  materialProductName: string
  modelNumber: string
  quantity: string

  // Reference
  specificationSections: string
  drawingSheetNumbers: string
  detailReferences: string
  relatedRfiNumbers: string

  // Attachments
  attachments: SubmittalAttachmentRow[]

  // Review / response
  reviewStatus: string
  reviewerComments: string
  reviewedBy: string
  reviewDate: string

  // Impact
  costImpact: string
  scheduleImpact: string
  impactDescription: string

  // Tracking
  finalStatus: string
  approvalRows: SubmittalApprovalRow[]

  // Footer
  footerNote: string
}

/* Summit-style submittal: dark green headers, yellow status pills, light grey dividers */
const PAGE_BORDER = '#1d4d3f'
const GREEN_DARK = '#1d4d3f'
const GREEN_LABEL = '#2d6a4f'
const BORDER = '#c5d1c9'
const TEXT_DARK = '#1a1a1a'
const TABLE_HEAD = '#e8f0ec'
const PAGE_BG = '#ffffff'
const STATUS_YELLOW = { backgroundColor: '#f2c94c', color: '#111827' }
const BASE_FONT = 9.0
const LABEL_FONT = 6.8
const SECTION_GAP = 7

function statusPillLabel(raw: string) {
  const s = (raw || '').toUpperCase()
  if (s.includes('APPROVED AS NOTED')) return 'APPROVED AS NOTED'
  if (s.includes('PENDING')) return 'PENDING REVIEW'
  if (s.includes('APPROVED')) return 'APPROVED'
  if (s.includes('REVISE')) return 'REVISE & RESUBMIT'
  if (s.includes('REJECT')) return 'REJECTED'
  return s || 'PENDING REVIEW'
}

function statusBadgeStyle(status: string): { backgroundColor: string; color: string; borderColor?: string } {
  const s = (status || '').toUpperCase()
  if (s.includes('APPROVED')) return { backgroundColor: '#2e7d32', color: '#ffffff' }
  if (s.includes('REJECT')) return { backgroundColor: '#c62828', color: '#ffffff' }
  return { ...(STATUS_YELLOW as any), borderColor: '#e7d49a' }
}

function priorityStyle(raw: string) {
  const p = (raw || '').toLowerCase()
  if (p.includes('high') || p.includes('urgent')) return { color: '#dc2626' }
  if (p.includes('low')) return { color: '#16a34a' }
  return { color: TEXT_DARK }
}

function splitLines(value: string): string[] {
  return (value || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function formatAddressLines(value: string): string[] {
  const raw = (value || '').trim()
  if (!raw) return []
  const nl = splitLines(raw)
  if (nl.length > 1) return nl
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length >= 2) return [parts[0], parts.slice(1).join(', ')]
  return [raw]
}

function clampText(value: string, maxChars: number) {
  const t = (value || '').trim()
  if (t.length <= maxChars) return t
  return t.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…'
}

function CardTitle({ title }: { title: string }) {
  return (
    <Text
      style={{
        fontSize: 9,
        fontWeight: 900,
        color: GREEN_DARK,
        textTransform: 'uppercase',
        letterSpacing: 0.35,
        marginBottom: 5,
      }}
    >
      {title}
    </Text>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 8, backgroundColor: '#ffffff', padding: 7, marginBottom: SECTION_GAP }}>
      <CardTitle title={title} />
      {children}
    </View>
  )
}

export function SubmittalPdfDocument({ data }: { data: SubmittalPdfViewModel }) {
  const headerStatusStyle = statusBadgeStyle(data.status)
  const summaryStatusStyle = statusBadgeStyle(data.status)
  const pStyle = priorityStyle(data.priority)
  const statusLabel = statusPillLabel(data.status)

  return (
    <Document>
      <Page
        size="LETTER"
        style={{
          fontFamily: 'Helvetica',
          fontSize: BASE_FONT,
          color: TEXT_DARK,
          backgroundColor: PAGE_BG,
          padding: 10,
        }}
      >
        <View
          style={{
            flex: 1,
            borderWidth: 2,
            borderColor: PAGE_BORDER,
            borderRadius: 4,
            backgroundColor: '#ffffff',
            padding: 8,
          }}
        >
          <PdfHeader
            themeColor={GREEN_DARK}
            titleLeft="SUBMITTAL"
            numberLabel="SUBMITTAL #"
            numberValue={data.submittalNumber}
            logoDataUri={data.logoDataUri}
            brand={data.brand || 'BuildSwift'}
            brandSub={data.brandSub || null}
            statusText={statusLabel}
            statusStyle={headerStatusStyle as any}
            contactAddress={data.contactAddress}
            contactPhone={data.contactPhone}
            contactEmail={data.contactEmail}
            projectName={data.projectName}
            projectAddress={data.projectAddress}
            mutedColor={GREEN_LABEL}
            titleAccentColor={GREEN_DARK}
            borderColor={BORDER}
          />

          {/* 2x2 grid: dates + to/from */}
          <View style={{ marginTop: 0, borderWidth: 1, borderColor: BORDER, borderRadius: 7, overflow: 'hidden', marginBottom: SECTION_GAP }}>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER }}>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, borderRightWidth: 1, borderRightColor: BORDER }}>
                <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
                  DATE ISSUED
                </Text>
                <Text style={{ fontSize: 9.6, fontWeight: 900, color: TEXT_DARK }}>{data.dateIssued}</Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
                  REQUIRED REVIEW DATE
                </Text>
                <Text style={{ fontSize: 9.6, fontWeight: 900, color: TEXT_DARK }}>{data.requiredReviewDate}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
                  FROM
                </Text>
                {(splitLines(data.from).length ? splitLines(data.from) : ['Not Provided']).slice(0, 4).map((line, idx) => (
                  <Text key={`from-${idx}`} style={{ fontSize: 8.8, color: TEXT_DARK, fontWeight: idx === 0 ? 900 : 500, lineHeight: 1.25 }}>
                    {line}
                  </Text>
                ))}
              </View>
            </View>
          </View>

        {/* Submittal Summary — four columns in one row (Summit reference) */}
        <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 8, backgroundColor: '#ffffff', marginBottom: SECTION_GAP }}>
          <View style={{ paddingHorizontal: 8, paddingTop: 6, paddingBottom: 7 }}>
            <Text style={{ fontSize: 9, fontWeight: 900, color: GREEN_DARK, textTransform: 'uppercase', letterSpacing: 0.35, marginBottom: 6 }}>
              Submittal Summary
            </Text>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1.35, borderRightWidth: 1, borderRightColor: BORDER, paddingRight: 8 }}>
                <Text style={{ fontSize: 6.2, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
                  Submittal Title
                </Text>
                <Text style={{ fontSize: 8.2, fontWeight: 800, color: TEXT_DARK, lineHeight: 1.2 }}>
                  {clampText(data.submittalTitle, 64)}
                </Text>
              </View>
              <View style={{ flex: 0.85, borderRightWidth: 1, borderRightColor: BORDER, paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 6.2, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
                  Priority
                </Text>
                <Text style={{ fontSize: 8.5, fontWeight: 900, ...(pStyle as any) }}>
                  {(data.priority || '—').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, paddingLeft: 8 }}>
                <Text style={{ fontSize: 6.2, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                  Status
                </Text>
                <Text
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: 12,
                    paddingVertical: 3.5,
                    borderRadius: 10,
                    fontSize: 7.4,
                    fontWeight: 900,
                    ...(summaryStatusStyle as any),
                  }}
                >
                  {statusLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Card title="Submittal Details">
          <Text style={{ fontSize: 6.2, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
            Detailed Description
          </Text>
          <Text style={{ fontSize: 8.5, lineHeight: 1.28, marginBottom: 6 }}>
            {stripHtmlToPlainParagraphs(data.detailedDescription)}
          </Text>
          <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 6, overflow: 'hidden', backgroundColor: '#fafcfb' }}>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER }}>
              <View style={{ flex: 1, padding: 7, borderRightWidth: 1, borderRightColor: BORDER }}>
                <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
                  Manufacturer / Vendor
                </Text>
                <Text style={{ fontSize: 8.3, fontWeight: 700, color: TEXT_DARK, lineHeight: 1.22 }}>{data.manufacturerVendor}</Text>
              </View>
              <View style={{ flex: 1, padding: 7 }}>
                <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
                  Material / Product
                </Text>
                <Text style={{ fontSize: 8.3, fontWeight: 700, color: TEXT_DARK, lineHeight: 1.22 }}>{data.materialProductName}</Text>
              </View>
            </View>
            <View style={{ padding: 7 }}>
              <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
                Specification Section(s)
              </Text>
              <Text style={{ fontSize: 8.3, fontWeight: 700, color: TEXT_DARK }}>
                {data.specificationSections}
              </Text>
            </View>
          </View>
        </Card>

        {/* Approval / Tracking (kept near bottom; log table limited for single page) */}
        <Card title="Approval / Tracking">
          <View
            style={{
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 7,
              overflow: 'hidden',
              backgroundColor: '#ffffff',
            }}
          >
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 7, borderRightWidth: 1, borderRightColor: BORDER }}>
                <Text style={{ fontSize: 6.2, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                  FINAL STATUS
                </Text>
                <Text
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: 14,
                    paddingVertical: 3.5,
                    borderRadius: 10,
                    fontSize: 7.8,
                    fontWeight: 900,
                    ...(statusBadgeStyle(data.finalStatus || data.status) as any),
                  }}
                >
                  {statusPillLabel(data.finalStatus || data.status)}
                </Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 7 }}>
                <Text style={{ fontSize: 6.2, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                  REVIEWED BY
                </Text>
                <Text style={{ fontSize: 8.2, fontWeight: 800, color: TEXT_DARK }}>{data.reviewedBy}</Text>
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: BORDER }} />
            <View style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 6.2, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800 }}>
                APPROVAL / REVIEW LOG
              </Text>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: BORDER }}>
              <View style={{ flexDirection: 'row', backgroundColor: TABLE_HEAD }}>
                {['Reviewer Email', 'Signature', 'Action', 'Date'].map((h, idx) => (
                  <Text
                    key={h}
                    style={{
                      width:
                        idx === 0
                          ? '26%'
                          : idx === 1
                            ? '26%'
                            : idx === 2
                              ? '28%'
                              : '20%',
                      fontSize: 6.6,
                      fontWeight: 900,
                      paddingHorizontal: 6,
                      paddingVertical: 4,
                      textTransform: 'uppercase',
                      color: TEXT_DARK,
                      borderRightWidth: idx === 3 ? 0 : 1,
                      borderRightColor: BORDER,
                    }}
                  >
                    {h}
                  </Text>
                ))}
              </View>
              {(data.approvalRows.length ? data.approvalRows : []).map((r, idx) => (
                <View key={`row-${idx}`} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#ffffff' }}>
                  <Text style={{ width: '26%', fontSize: 7.4, paddingHorizontal: 6, paddingVertical: 4, borderRightWidth: 1, borderRightColor: BORDER }}>
                    {r.name}
                  </Text>
                  <View style={{ width: '26%', paddingHorizontal: 6, paddingVertical: 4, borderRightWidth: 1, borderRightColor: BORDER }}>
                    {r.signatureUrl ? (
                      <Image src={r.signatureUrl} style={{ width: 64, height: 14, objectFit: 'contain' }} />
                    ) : r.signatureName ? (
                      <Text style={{ fontSize: 7.4, fontFamily: 'Helvetica-Oblique', color: TEXT_DARK }}>
                        {r.signatureName}
                      </Text>
                    ) : (
                      <View style={{ height: 0.8, backgroundColor: '#94a3b8', marginTop: 8 }} />
                    )}
                  </View>
                  <Text style={{ width: '28%', fontSize: 7.4, paddingHorizontal: 6, paddingVertical: 4, borderRightWidth: 1, borderRightColor: BORDER }}>
                    {r.action}
                  </Text>
                  <Text style={{ width: '20%', fontSize: 7.4, paddingHorizontal: 6, paddingVertical: 4 }}>
                    {r.date}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Card>

        {/* Flexible spacer so footer sits at bottom on short content */}
        <View style={{ flexGrow: 1 }} />

        <View style={{ backgroundColor: GREEN_DARK, borderRadius: 6, marginTop: 2, paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ color: '#ffffff', fontSize: 8.2, fontWeight: 900, letterSpacing: 0.2 }}>
            Construction Documentation.
          </Text>
        </View>
        </View>
      </Page>
    </Document>
  )
}
