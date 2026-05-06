import React from 'react'
import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import { stripHtmlToPlainParagraphs } from '@/lib/document-html'

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
  logoDataUri: string
  brand: string
  brandSub: string
  themePrimary: string
  contactAddress: string
  contactPhone: string
  contactEmail: string

  projectName: string
  projectAddress: string
  submittalNumber: string
  /** Shown in header / summary badges (workflow). */
  status: string
  dateIssued: string
  requiredReviewDate: string
  to: string
  from: string

  submittalTitle: string
  submittalType: string
  priority: string

  detailedDescription: string
  manufacturerVendor: string
  materialProductName: string
  modelNumber: string
  quantity: string

  specificationSections: string
  drawingSheetNumbers: string
  detailReferences: string
  relatedRfiNumbers: string

  attachments: SubmittalAttachmentRow[]

  reviewerComments: string
  reviewedBy: string
  reviewDate: string
  /** From latest reviewer row with a signature attachment or typed name, if any */
  reviewerSignatureUrl: string
  reviewerSignatureName: string | null

  footerNote: string
}

/* Summit-style reference: dark green accents, yellow pending pill, light grey card borders */
const PAGE_BORDER = '#1d4d3f'
const GREEN_DARK = '#1d4d3f'
const GREEN_LABEL = '#2d6a4f'
const BORDER = '#c5d1c9'
const CARD_BG = '#ffffff'
const TEXT_DARK = '#1a1a1a'
const TABLE_HEAD = '#e8f0ec'
const PAGE_BG = '#ffffff'
const STATUS_YELLOW = { backgroundColor: '#f2c94c', color: '#111827' }

/** Portrait page — width 1.2× nominal 6in; height 13in; one sheet (wrap=false); clamps avoid page 2 */
const PAGE_WIDTH_PT = 6 * 72 * 1.2
const PAGE_HEIGHT_PT = 13 * 72
const PAGE_MARGIN_PT = 11

const BASE_FONT = 7.65
const LABEL_FONT = 6.35
const VALUE_FONT = 7.65
const BODY_LINE_HEIGHT = 1.22
/** Vertical space between major bordered blocks */
const SECTION_GAP = 6
const FRAME_PAD = 10
const LEGEND_PAD_TOP = 11
const INNER_PAD = 8

/** Slightly reduced so added padding still fits one 6×13 page with wrap=false */
const MAX_DESCRIPTION_CHARS = 820
const MAX_REVIEWER_COMMENTS_CHARS = 250
const MAX_FIELD_CELL_CHARS = 68
const MAX_ATTACHMENTS_ROWS = 3
const MAX_SUMMARY_TITLE_CHARS = 72
const PARTY_LINES_MAX = 2

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
  if (s.includes('APPROVED') && !s.includes('NOTED')) return { backgroundColor: '#2e7d32', color: '#ffffff' }
  if (s.includes('APPROVED AS NOTED') || (s.includes('APPROVED') && s.includes('NOTED')))
    return { backgroundColor: '#2e7d32', color: '#ffffff' }
  if (s.includes('REJECT')) return { backgroundColor: '#c62828', color: '#ffffff' }
  if (s.includes('REVISE')) return { backgroundColor: '#e65100', color: '#ffffff' }
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

function ReviewerSignatureCell({
  signatureUrl,
  signatureName,
}: {
  signatureUrl: string
  signatureName: string | null
}) {
  const url = (signatureUrl || '').trim()
  const name = (signatureName || '').trim()
  return (
    <View style={{ flex: 1.05, paddingHorizontal: 8, paddingVertical: 6 }}>
      <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
        Reviewer Signature
      </Text>
      {url ? (
        <Image src={url} style={{ width: 70, height: 20, objectFit: 'contain' }} />
      ) : name ? (
        <Text style={{ fontSize: VALUE_FONT - 0.5, fontFamily: 'Helvetica-Oblique', color: TEXT_DARK }}>{name}</Text>
      ) : (
        <View style={{ borderBottomWidth: 0.9, borderBottomColor: BORDER, marginTop: 10, opacity: 0.9 }} />
      )}
    </View>
  )
}

function BorderedSectionWithLegend({
  legend,
  legendFontSize,
  children,
}: {
  legend: string
  legendFontSize?: number
  children: React.ReactNode
}) {
  const legendSize = legendFontSize ?? LABEL_FONT + 1.55
  return (
    <View style={{ marginBottom: SECTION_GAP }}>
      <View
        style={{
          position: 'relative',
          borderWidth: 1,
          borderColor: BORDER,
          borderRadius: 8,
          backgroundColor: CARD_BG,
          paddingTop: LEGEND_PAD_TOP,
          paddingHorizontal: INNER_PAD,
          paddingBottom: 9,
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: -6,
            left: 10,
            backgroundColor: CARD_BG,
            paddingHorizontal: 6,
          }}
        >
          <Text
            style={{
              fontSize: legendSize,
              fontWeight: 900,
              color: GREEN_DARK,
              textTransform: 'uppercase',
              letterSpacing: 0.35,
            }}
          >
            {legend}
          </Text>
        </View>
        {children}
      </View>
    </View>
  )
}

function FieldCell({
  label,
  value,
  flex = 1,
  borderRight,
}: {
  label: string
  value: string
  flex?: number
  borderRight?: boolean
}) {
  return (
    <View
      style={{
        flex,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRightWidth: borderRight ? 1 : 0,
        borderRightColor: BORDER,
      }}
    >
      <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
        {label}
      </Text>
      <Text style={{ fontSize: VALUE_FONT, fontWeight: 700, color: TEXT_DARK, lineHeight: BODY_LINE_HEIGHT }}>
        {clampText(value, MAX_FIELD_CELL_CHARS)}
      </Text>
    </View>
  )
}

export function SubmittalPdfDocument({ data }: { data: SubmittalPdfViewModel }) {
  const headerStatusStyle = statusBadgeStyle(data.status)
  const pStyle = priorityStyle(data.priority)
  const statusLabel = statusPillLabel(data.status)
  const attachmentsTruncated = data.attachments.length > MAX_ATTACHMENTS_ROWS
  const hasAttachments = data.attachments.some((a) => {
    const name = (a?.fileName ?? '').trim()
    return Boolean(name) && name !== 'N/A' && name !== '—' && name !== 'Not Provided'
  })
  const attachmentRows = data.attachments.slice(0, MAX_ATTACHMENTS_ROWS)

  const descPlain = stripHtmlToPlainParagraphs(data.detailedDescription)

  return (
    <Document>
      <Page
        size={[PAGE_WIDTH_PT, PAGE_HEIGHT_PT]}
        wrap={false}
        style={{
          fontFamily: 'Helvetica',
          fontSize: BASE_FONT,
          color: TEXT_DARK,
          backgroundColor: PAGE_BG,
          padding: PAGE_MARGIN_PT,
        }}
      >
        <View
          style={{
            borderWidth: 2,
            borderColor: PAGE_BORDER,
            borderRadius: 8,
            backgroundColor: CARD_BG,
            padding: FRAME_PAD,
          }}
        >
          {/* Top bar: SUBMITTAL strip + Submittal # */}
          <View style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: SECTION_GAP + 1 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: GREEN_DARK,
                borderRadius: 7,
                minHeight: 30,
                justifyContent: 'center',
                paddingVertical: 5,
                paddingHorizontal: 11,
                marginRight: 7,
              }}
            >
              <Text
                style={{
                  color: '#ffffff',
                  textAlign: 'center',
                  fontWeight: 900,
                  fontSize: 11.5,
                  letterSpacing: 0.85,
                  textTransform: 'uppercase',
                }}
              >
                SUBMITTAL
              </Text>
            </View>
            <View
              style={{
                width: 92,
                backgroundColor: GREEN_DARK,
                borderRadius: 7,
                minHeight: 30,
                paddingVertical: 5,
                paddingHorizontal: 7,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: '#ffffff',
                  fontSize: LABEL_FONT,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  fontWeight: 800,
                  letterSpacing: 0.4,
                }}
              >
                SUBMITTAL #
              </Text>
              <Text style={{ color: '#ffffff', fontWeight: 900, fontSize: 9.5, textAlign: 'center', marginTop: 0 }}>
                {data.submittalNumber}
              </Text>
            </View>
          </View>

          {/* Header / Project — bordered block (matches reference card) */}
          <View
            style={{
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 8,
              paddingHorizontal: INNER_PAD + 2,
              paddingVertical: 9,
              marginBottom: SECTION_GAP + 1,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
                {data.logoDataUri ? (
                  <Image src={data.logoDataUri} style={{ width: 40, height: 40, objectFit: 'contain' }} />
                ) : null}
                <View style={{ marginLeft: data.logoDataUri ? 8 : 0 }}>
                  <Text style={{ fontSize: 10, fontWeight: 900, color: GREEN_DARK, letterSpacing: 0.2 }}>
                    {(data.brand || '').toUpperCase()}
                  </Text>
                  {data.brandSub ? (
                    <Text style={{ fontSize: 6.2, color: GREEN_LABEL, letterSpacing: 0.8, marginTop: 1, fontWeight: 800 }}>
                      {data.brandSub.toUpperCase()}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View
                style={{
                  alignItems: 'flex-end',
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 10,
                  backgroundColor: '#f8fafc',
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  minWidth: 104,
                }}
              >
                <Text
                  style={{
                    fontSize: LABEL_FONT - 0.15,
                    fontWeight: 900,
                    color: GREEN_LABEL,
                    textTransform: 'uppercase',
                    letterSpacing: 0.35,
                  }}
                >
                  Status
                </Text>
                <View
                  style={{
                    marginTop: 4,
                    alignSelf: 'flex-end',
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: (headerStatusStyle as any).borderColor ?? 'transparent',
                    backgroundColor: (headerStatusStyle as any).backgroundColor,
                    paddingVertical: 4,
                    paddingHorizontal: 11,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 6.8,
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      letterSpacing: 0.2,
                      color: (headerStatusStyle as any).color,
                    }}
                  >
                    {statusLabel}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ marginTop: 10, flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ fontSize: VALUE_FONT, fontWeight: 900, color: TEXT_DARK, marginBottom: 3 }}>{data.brand}</Text>
                {formatAddressLines(data.contactAddress).map((line, idx) => (
                  <Text key={`c-${idx}`} style={{ fontSize: 7, color: TEXT_DARK, lineHeight: BODY_LINE_HEIGHT }}>
                    {line}
                  </Text>
                ))}
                <Text style={{ fontSize: 6.9, color: TEXT_DARK, marginTop: 5 }}>
                  {data.contactPhone} {' | '} {data.contactEmail}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: BORDER }} />
              <View style={{ flex: 1, paddingLeft: 10 }}>
                <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', marginBottom: 3, fontWeight: 800 }}>
                  PROJECT
                </Text>
                <Text style={{ fontSize: VALUE_FONT, fontWeight: 900, color: TEXT_DARK, marginBottom: 3 }}>{data.projectName}</Text>
                {formatAddressLines(data.projectAddress).map((line, idx) => (
                  <Text key={`p-${idx}`} style={{ fontSize: 7, color: TEXT_DARK, lineHeight: BODY_LINE_HEIGHT, marginTop: idx === 0 ? 1 : 0 }}>
                    {line}
                  </Text>
                ))}
              </View>
            </View>

            {/* 2×3 metadata grid: Sent From | Date Sent | Status / Sent To | Required Review Date | Priority */}
            <View style={{ marginTop: 10, borderWidth: 1, borderColor: BORDER, borderRadius: 7, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <View
                  style={{
                    flex: 1,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    borderRightWidth: 1,
                    borderRightColor: BORDER,
                  }}
                >
                  <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                    Sent From
                  </Text>
                  {(splitLines(data.from).length ? splitLines(data.from) : ['Not Provided']).slice(0, PARTY_LINES_MAX).map((line, idx) => (
                    <Text
                      key={`sf-${idx}`}
                      style={{ fontSize: 7.2, color: TEXT_DARK, fontWeight: idx === 0 ? 900 : 500, lineHeight: BODY_LINE_HEIGHT }}
                    >
                      {clampText(line, 58)}
                    </Text>
                  ))}
                </View>
                <FieldCell label="DATE SENT" value={data.dateIssued} flex={1} borderRight={false} />
              </View>
              <View style={{ flexDirection: 'row' }}>
                <View
                  style={{
                    flex: 1,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    borderRightWidth: 1,
                    borderRightColor: BORDER,
                  }}
                >
                  <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                    Sent To
                  </Text>
                  {(splitLines(data.to).length ? splitLines(data.to) : ['Not Provided']).slice(0, PARTY_LINES_MAX).map((line, idx) => (
                    <Text
                      key={`st-${idx}`}
                      style={{ fontSize: 7.2, color: TEXT_DARK, fontWeight: idx === 0 ? 900 : 500, lineHeight: BODY_LINE_HEIGHT }}
                    >
                      {clampText(line, 58)}
                    </Text>
                  ))}
                </View>
                <FieldCell label="REQUIRED REVIEW DATE" value={data.requiredReviewDate} flex={1} borderRight />
                <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6 }}>
                  <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                    Priority
                  </Text>
                  <Text style={{ fontSize: VALUE_FONT, fontWeight: 900, ...(pStyle as any) }}>{(data.priority || '—').toUpperCase()}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Submittal Summary — title & type only (status / priority live in grid above) */}
          <BorderedSectionWithLegend legend="Submittal Summary">
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1.35, borderRightWidth: 1, borderRightColor: BORDER, paddingRight: 10 }}>
                <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                  Submittal Title
                </Text>
                <Text style={{ fontSize: 7.4, fontWeight: 800, color: TEXT_DARK, lineHeight: BODY_LINE_HEIGHT }}>
                  {clampText(data.submittalTitle, MAX_SUMMARY_TITLE_CHARS)}
                </Text>
              </View>
              <View style={{ flex: 1, paddingLeft: 10 }}>
                <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                  Submittal Type
                </Text>
                <Text style={{ fontSize: VALUE_FONT, fontWeight: 800, color: TEXT_DARK }}>{data.submittalType}</Text>
              </View>
            </View>
          </BorderedSectionWithLegend>

          {/* Submittal Details */}
          <BorderedSectionWithLegend legend="Submittal Details">
            <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
              Detailed Description
            </Text>
            <Text style={{ fontSize: 7.35, lineHeight: BODY_LINE_HEIGHT, marginBottom: 8 }}>
              {clampText(descPlain, MAX_DESCRIPTION_CHARS)}
            </Text>
            {/* 2 cols × 4 rows: product + reference fields (merged per layout spec) */}
            <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 7, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <FieldCell label="MANUFACTURER / VENDOR NAME" value={data.manufacturerVendor} flex={1} borderRight />
                <FieldCell label="MATERIAL / PRODUCT NAME" value={data.materialProductName} flex={1} />
              </View>
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <FieldCell label="MODEL NUMBER(S)" value={data.modelNumber} flex={1} borderRight />
                <FieldCell label="QUANTITY" value={data.quantity} flex={1} />
              </View>
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <FieldCell label="SPECIFICATION SECTION(S)" value={data.specificationSections} flex={1} borderRight />
                <FieldCell label="DRAWING / SHEET NUMBER(S)" value={data.drawingSheetNumbers} flex={1} />
              </View>
              <View style={{ flexDirection: 'row' }}>
                <FieldCell label="DETAIL REFERENCE(S)" value={data.detailReferences} flex={1} borderRight />
                <FieldCell label="RELATED RFI NUMBER(S)" value={data.relatedRfiNumbers} flex={1} />
              </View>
            </View>
          </BorderedSectionWithLegend>

          {/* Attachments */}
          {hasAttachments ? (
            <BorderedSectionWithLegend legend="Attachments">
              <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', backgroundColor: TABLE_HEAD }}>
                  {(['FILE NAME', 'FILE TYPE'] as const).map((h, idx) => (
                    <Text
                      key={h}
                      style={{
                        width: idx === 0 ? '68%' : '32%',
                        fontSize: LABEL_FONT,
                        fontWeight: 900,
                        paddingHorizontal: 9,
                        paddingVertical: 7,
                        textTransform: 'uppercase',
                        color: TEXT_DARK,
                        borderRightWidth: idx === 1 ? 0 : 1,
                        borderRightColor: BORDER,
                      }}
                    >
                      {h}
                    </Text>
                  ))}
                </View>
                {attachmentRows.map((a, idx) => (
                  <View key={`a-${idx}`} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER }}>
                    <Text style={{ width: '68%', fontSize: 7.25, padding: 6, borderRightWidth: 1, borderRightColor: BORDER }}>
                      {clampText(a.fileName || 'N/A', 48)}
                    </Text>
                    <Text style={{ width: '32%', fontSize: 7.25, padding: 6 }}>{clampText(a.fileType || 'N/A', 14)}</Text>
                  </View>
                ))}
                {attachmentsTruncated ? (
                  <Text style={{ fontSize: 6, color: GREEN_LABEL, paddingHorizontal: 8, paddingVertical: 5 }}>
                    +{data.attachments.length - MAX_ATTACHMENTS_ROWS} more attachment(s) not shown
                  </Text>
                ) : null}
              </View>
            </BorderedSectionWithLegend>
          ) : null}

          {/* Review / Response — reviewed by row + full-width comments (spec layout) */}
          <BorderedSectionWithLegend legend="Review / Response">
            <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 7, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <FieldCell label="REVIEWED BY" value={data.reviewedBy} flex={1.35} borderRight />
                <FieldCell label="RESPONSE DATE" value={data.reviewDate} flex={0.95} borderRight />
                <ReviewerSignatureCell signatureUrl={data.reviewerSignatureUrl} signatureName={data.reviewerSignatureName} />
              </View>
              <View style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                <Text style={{ fontSize: LABEL_FONT, color: GREEN_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                  Reviewers Comments
                </Text>
                <Text style={{ fontSize: 7.35, lineHeight: BODY_LINE_HEIGHT, fontWeight: 700, color: TEXT_DARK }}>
                  {clampText(data.reviewerComments, MAX_REVIEWER_COMMENTS_CHARS)}
                </Text>
              </View>
            </View>
          </BorderedSectionWithLegend>

          <View style={{ marginTop: 3, backgroundColor: GREEN_DARK, borderRadius: 7, paddingVertical: 8, alignItems: 'center' }}>
            <Text style={{ color: '#ffffff', fontSize: 7.25, fontWeight: 900, letterSpacing: 0.22 }}>
              Construction Documentation.
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
