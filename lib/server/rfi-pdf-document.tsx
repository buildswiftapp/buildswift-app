import React from 'react'
import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import { stripHtmlToPlainParagraphs } from '@/lib/document-html'

export type RfiApprovalRow = {
  name: string
  role: string
  /** Resolved signature image (typically data URI) when the reviewer signed digitally */
  signatureImageUri: string | null
  /** Shown in the Signature column when no image (typed name or status) */
  signatureTextFallback: string
  /** Review outcome — used for Response section fallback, not shown as its own column */
  reviewDecision: 'approved' | 'rejected' | 'pending'
  date: string
  notes: string
}

export type RfiAttachmentRow = { fileName: string; fileType: string; notes: string }

export type RfiPdfViewModel = {
  logoDataUri: string
  brand: string
  brandSub: string
  themePrimary: string
  contactAddress: string
  contactPhone: string
  contactEmail: string
  rfiNumber: string
  status: string
  projectName: string
  projectAddress: string
  issueDate: string
  requiredResponseDate: string
  recipient: string
  sender: string
  summaryTitle: string
  priority: string
  detailedQuestion: string
  reasonForRequest: string
  conflictIdentification: string
  missingInformation: string
  clarificationRequired: string
  drawingSheetNumber: string
  specificationSection: string
  specificReference: string
  location: string
  attachments: RfiAttachmentRow[]
  responseContent: string
  responder: string
  responseDate: string
  costImpact: string
  scheduleImpact: string
  impactDescription: string
  finalStatus: string
  reviewedBy: string
  approvalRows: RfiApprovalRow[]
  footerNote: string
}

/** Light dividers inside cards and tables */
const BORDER = '#e8edf2'
/** Soft outline for cards / section boxes (lighter than prior navy) */
const CARD_BORDER = '#c8d8e8'
/** Outer page frame — subtle, not full header navy */
const PAGE_FRAME = '#b8cce0'
const CARD_BG = '#ffffff'
const HEADER_BG = '#153f6f'
const TITLE_BLUE = '#1e4275'
const TEXT_DARK = '#1f2937'
const MUTED = '#5b6471'
const TABLE_HEAD = '#edf1f6'
/**
 * Custom page (portrait): width × height = 6 : 13 in points (e.g. 432×936).
 * Single sheet: wrap=false; tight typography + clamps; overflow truncates with …
 */
const PAGE_WIDTH_PT = 6 * 72 * 1.2 // 518.4pt — 1.2× nominal 6in width; height unchanged
const PAGE_HEIGHT_PT = 13 * 72 // 936
const BASE_FONT = 8.05
const LABEL_FONT = 6.5
const VALUE_FONT = 8.05
const BODY_LINE_HEIGHT = 1.24
const SECTION_GAP = 6
const PAGE_MARGIN_PT = 11
const FRAME_INNER_PADDING = 10
/** Narrative clamps — tuned for wrap=false after looser vertical rhythm. */
const MAX_QUESTION_CHARS = 1850
const MAX_RESPONSE_CHARS = 1320
const MAX_ATTACHMENTS_ROWS = 5
const MAX_APPROVAL_ROWS = 7
/** Max wrapped lines shown for sender/recipient columns in metadata grid */
const META_PARTY_MAX_LINES = 2

function statusBadgeStyle(status: string): { backgroundColor: string; color: string } {
  const s = (status || '').toUpperCase()
  if (s === 'ANSWERED') return { backgroundColor: '#16a34a', color: '#ffffff' }
  if (s === 'CLOSED') return { backgroundColor: '#dc2626', color: '#ffffff' }
  return { backgroundColor: '#f59e0b', color: '#111827' }
}

function splitLines(value: string): string[] {
  return (value || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function clampChars(text: string, maxChars: number) {
  const t = (text || '').trim()
  if (t.length <= maxChars) return t
  return t.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…'
}

function formatAddressLines(value: string): string[] {
  const raw = (value || '').trim()
  if (!raw) return []
  const nl = splitLines(raw)
  if (nl.length > 1) return nl

  // Common DB storage is "street, city, state zip" (comma-separated). Convert to 2 lines.
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    const first = parts[0]
    const rest = parts.slice(1).join(', ')
    return [first, rest].filter(Boolean)
  }

  // Fallback: try to split before a trailing country token.
  const m = raw.match(/^(.*?)(\s+(?:USA|United States|US)\b.*)$/i)
  if (m && m[1] && m[2]) return [m[1].trim(), m[2].trim()]

  return [raw]
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, paddingRight: 10 }}>
      <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', marginBottom: 4, fontWeight: 800 }}>
        {label}
      </Text>
      <Text style={{ fontSize: VALUE_FONT, color: TEXT_DARK, fontWeight: 600, lineHeight: BODY_LINE_HEIGHT }}>
        {value}
      </Text>
    </View>
  )
}

/** Section box with title overlapping the top border (fieldset / legend style). */
function BorderedSectionWithLegend({
  legend,
  legendFontSize,
  children,
}: {
  legend: string
  legendFontSize?: number
  children: React.ReactNode
}) {
  const legendSize = legendFontSize ?? LABEL_FONT + 1.75
  return (
    <View style={{ marginBottom: SECTION_GAP }}>
      <View
        style={{
          position: 'relative',
          borderWidth: 1,
          borderColor: CARD_BORDER,
          borderRadius: 8,
          backgroundColor: CARD_BG,
          paddingTop: 14,
          paddingHorizontal: FRAME_INNER_PADDING,
          paddingBottom: 10,
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
                fontWeight: 800,
                color: TITLE_BLUE,
                textTransform: 'uppercase',
                letterSpacing: 0.3,
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <BorderedSectionWithLegend legend={title}>{children}</BorderedSectionWithLegend>
}

export function RfiPdfDocument({ data }: { data: RfiPdfViewModel }) {
  const statusStyle = statusBadgeStyle(data.status)
  const priorityUpper = (data.priority || '').toUpperCase()
  const priorityStyle =
    priorityUpper === 'HIGH'
      ? { color: '#dc2626' }
      : priorityUpper === 'LOW'
        ? { color: '#16a34a' }
        : { color: TEXT_DARK }
  const reviewedByDisplay = data.reviewedBy && data.reviewedBy.trim() && data.reviewedBy !== 'Not Provided' ? data.reviewedBy : '—'
  const approvalRowsForTable =
    data.approvalRows.length > 0
      ? data.approvalRows.slice(0, MAX_APPROVAL_ROWS)
      : [
          {
            name: '—',
            role: '—',
            signatureImageUri: null,
            signatureTextFallback: '—',
            reviewDecision: 'pending',
            date: '—',
            notes: '—',
          },
        ]
  const approvalTruncated = data.approvalRows.length > MAX_APPROVAL_ROWS
  const hasAttachments = data.attachments.some((a) => {
    const name = (a?.fileName ?? '').trim()
    return Boolean(name) && name !== 'N/A' && name !== '—' && name !== 'Not Provided'
  })
  const attachmentRows = data.attachments.slice(0, MAX_ATTACHMENTS_ROWS)
  const attachmentsTruncated = data.attachments.length > MAX_ATTACHMENTS_ROWS

  const questionPlain = stripHtmlToPlainParagraphs(data.detailedQuestion)

  return (
    <Document>
      <Page
        size={[PAGE_WIDTH_PT, PAGE_HEIGHT_PT]}
        wrap={false}
        style={{
          fontFamily: 'Helvetica',
          fontSize: BASE_FONT,
          color: TEXT_DARK,
          backgroundColor: '#ffffff',
          padding: PAGE_MARGIN_PT,
        }}
      >
        <View
          style={{
            borderWidth: 2,
            borderColor: PAGE_FRAME,
            borderRadius: 8,
            backgroundColor: '#ffffff',
            padding: FRAME_INNER_PADDING,
          }}
        >
          <View style={{ flexDirection: 'row', marginBottom: SECTION_GAP + 1 }}>
          {/* Title bar (match reference: emphasized RFI) */}
          <View
            style={{
              flex: 1,
              backgroundColor: HEADER_BG,
              borderRadius: 7,
              minHeight: 28,
              justifyContent: 'center',
              paddingVertical: 5,
              paddingHorizontal: 11,
              marginRight: 7,
            }}
          >
            <Text style={{ color: '#ffffff', textAlign: 'center' }}>
              <Text style={{ fontWeight: 800, fontSize: 11, letterSpacing: 0.22 }}>RFI </Text>
              <Text style={{ fontWeight: 700, fontSize: 9.5, letterSpacing: 0.22 }}>REQUEST FOR INFORMATION</Text>
            </Text>
          </View>

          {/* RFI # block only (status moved to company header) */}
          <View
            style={{
              width: 86,
              backgroundColor: HEADER_BG,
              borderRadius: 7,
              minHeight: 28,
              paddingVertical: 5,
              paddingHorizontal: 7,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: LABEL_FONT + 0.2, textAlign: 'center', textTransform: 'uppercase', fontWeight: 700 }}>
              RFI #
            </Text>
            <Text style={{ color: '#ffffff', fontWeight: 800, fontSize: 9.8, textAlign: 'center', marginTop: 0 }}>
              {data.rfiNumber}
            </Text>
          </View>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: CARD_BORDER,
            borderRadius: 8,
            paddingHorizontal: FRAME_INNER_PADDING - 1,
            paddingVertical: 9,
            marginBottom: SECTION_GAP + 1,
          }}
        >
          {/* Row 1: Company lockup + Status */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
              {data.logoDataUri ? <Image src={data.logoDataUri} style={{ width: 40, height: 40 }} /> : null}
              <View style={{ marginLeft: data.logoDataUri ? 8 : 0, flex: 1 }}>
                <Text style={{ fontSize: BASE_FONT + 3.2, fontWeight: 800, color: TITLE_BLUE, letterSpacing: 0.25 }}>
                  {(data.brand || 'BUILDSWIFT').toUpperCase()}
                </Text>
                <Text style={{ fontSize: LABEL_FONT + 0.2, color: MUTED, letterSpacing: 1.4, marginTop: 2 }}>
                  {(data.brandSub || '').toUpperCase()}
                </Text>
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
                  color: MUTED,
                  textTransform: 'uppercase',
                  letterSpacing: 0.35,
                }}
              >
                Status
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  alignSelf: 'flex-end',
                  fontSize: BASE_FONT - 0.1,
                  fontWeight: 900,
                  paddingVertical: 4,
                  paddingHorizontal: 11,
                  borderRadius: 999,
                  textTransform: 'uppercase',
                  letterSpacing: 0.2,
                  ...(statusStyle as any),
                }}
              >
                {data.status}
              </Text>
            </View>
          </View>

          {/* Row 2: Contact (left) + Project (right) */}
          <View style={{ marginTop: 10, flexDirection: 'row' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontSize: VALUE_FONT, fontWeight: 800, color: TEXT_DARK, marginBottom: 3 }}>
                {data.brand}
              </Text>
              {formatAddressLines(data.contactAddress).map((line, idx) => (
                <Text
                  key={`caddr-${idx}`}
                  style={{ fontSize: BASE_FONT, color: TEXT_DARK, lineHeight: BODY_LINE_HEIGHT }}
                >
                  {line}
                </Text>
              ))}
              <Text style={{ fontSize: BASE_FONT - 0.35, color: TEXT_DARK, marginTop: 5 }}>
                {data.contactPhone} {' | '} {data.contactEmail}
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: BORDER }} />
            <View style={{ flex: 1, paddingLeft: 10 }}>
              <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', marginBottom: 3, fontWeight: 800 }}>
                PROJECT
              </Text>
              <Text style={{ fontSize: VALUE_FONT + 0.35, fontWeight: 900, color: TEXT_DARK, marginBottom: 3 }}>
                {data.projectName}
              </Text>
              {formatAddressLines(data.projectAddress).map((line, idx) => (
                <Text
                  key={`paddr-${idx}`}
                  style={{ fontSize: BASE_FONT, color: TEXT_DARK, lineHeight: BODY_LINE_HEIGHT, marginTop: idx === 0 ? 1 : 0 }}
                >
                  {line}
                </Text>
              ))}
            </View>
          </View>
          {/* Metadata: 2×3 grid — Sent From | Date Issued | Status / Sent To | Required Response Date | Priority */}
          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: CARD_BORDER,
              borderRadius: 7,
              overflow: 'hidden',
              backgroundColor: CARD_BG,
            }}
          >
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER }}>
              <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6, borderRightWidth: 1, borderRightColor: BORDER }}>
                <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                  Sent From
                </Text>
                {(splitLines(data.sender).length ? splitLines(data.sender) : ['Not Provided']).slice(0, META_PARTY_MAX_LINES).map((line, idx) => (
                  <Text
                    key={`sf-${idx}`}
                    style={{ fontSize: BASE_FONT, color: TEXT_DARK, fontWeight: idx === 0 ? 800 : 500, lineHeight: BODY_LINE_HEIGHT }}
                  >
                    {clampChars(line, 62)}
                  </Text>
                ))}
              </View>
              <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6 }}>
                <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                  Date Issued
                </Text>
                <Text style={{ fontSize: VALUE_FONT + 0.2, fontWeight: 800, color: TEXT_DARK }}>{data.issueDate}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6, borderRightWidth: 1, borderRightColor: BORDER }}>
                <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                  Sent To
                </Text>
                {(splitLines(data.recipient).length ? splitLines(data.recipient) : ['Not Provided']).slice(0, META_PARTY_MAX_LINES).map((line, idx) => (
                  <Text
                    key={`st-${idx}`}
                    style={{ fontSize: BASE_FONT, color: TEXT_DARK, fontWeight: idx === 0 ? 800 : 500, lineHeight: BODY_LINE_HEIGHT }}
                  >
                    {clampChars(line, 62)}
                  </Text>
                ))}
              </View>
              <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6, borderRightWidth: 1, borderRightColor: BORDER }}>
                <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                  Required Response Date
                </Text>
                <Text style={{ fontSize: VALUE_FONT + 0.2, fontWeight: 800, color: TEXT_DARK }}>{data.requiredResponseDate}</Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6 }}>
                <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                  Priority
                </Text>
                <Text style={{ fontSize: VALUE_FONT + 0.2, fontWeight: 800, ...(priorityStyle as any) }}>{priorityUpper || '—'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* RFI SUMMARY — legend overlaps top border; title + reason on one row */}
        <BorderedSectionWithLegend legend="RFI SUMMARY">
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1.12, paddingRight: 10, borderRightWidth: 1, borderRightColor: BORDER }}>
              <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                RFI TITLE
              </Text>
              <Text style={{ fontSize: VALUE_FONT, fontWeight: 700, color: TEXT_DARK, lineHeight: BODY_LINE_HEIGHT }}>
                {clampChars(data.summaryTitle, 110)}
              </Text>
            </View>
            <View style={{ flex: 0.88, paddingLeft: 10 }}>
              <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                Reason for Request
              </Text>
              <Text style={{ fontSize: VALUE_FONT, lineHeight: BODY_LINE_HEIGHT, color: TEXT_DARK }}>{clampChars(data.reasonForRequest, 110)}</Text>
            </View>
          </View>
        </BorderedSectionWithLegend>

        <Card title="Question / Request Details">
          <Text style={{ fontSize: BASE_FONT, lineHeight: BODY_LINE_HEIGHT }}>
            {clampChars(questionPlain, MAX_QUESTION_CHARS)}
          </Text>
        </Card>

        {hasAttachments ? (
          <Card title="Attachments">
            <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 7, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', backgroundColor: TABLE_HEAD }}>
                {(['FILE NAME', 'FILE TYPE'] as const).map((h, idx) => (
                  <Text
                    key={h}
                    style={{
                      width: idx === 0 ? '68%' : '32%',
                      fontSize: LABEL_FONT,
                      fontWeight: 700,
                      paddingHorizontal: 8,
                      paddingVertical: 6,
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
                <View
                  key={`att-${idx}`}
                  style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#ffffff' }}
                >
                  <Text style={{ width: '68%', fontSize: BASE_FONT, paddingHorizontal: 7, paddingVertical: 6, borderRightWidth: 1, borderRightColor: BORDER, lineHeight: BODY_LINE_HEIGHT }}>
                    {clampChars(a.fileName, 48)}
                  </Text>
                  <Text style={{ width: '32%', fontSize: BASE_FONT, paddingHorizontal: 7, paddingVertical: 6, lineHeight: BODY_LINE_HEIGHT }}>{a.fileType}</Text>
                </View>
              ))}
              {attachmentsTruncated ? (
                <Text style={{ fontSize: LABEL_FONT - 0.4, color: MUTED, paddingHorizontal: 8, paddingVertical: 5 }}>
                  +{data.attachments.length - MAX_ATTACHMENTS_ROWS} additional attachment(s) not listed
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        <Card title="Response">
          <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 7, overflow: 'hidden', backgroundColor: '#ffffff' }}>
            <View style={{ flexDirection: 'row', backgroundColor: '#f8fafc' }}>
              <View style={{ flex: 1, paddingHorizontal: 9, paddingVertical: 8, borderRightWidth: 1, borderRightColor: BORDER }}>
                <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', marginBottom: 4, fontWeight: 800 }}>
                  Name of responder
                </Text>
                <Text style={{ fontSize: VALUE_FONT, color: TEXT_DARK, fontWeight: 700, lineHeight: BODY_LINE_HEIGHT }}>
                  {data.responder}
                </Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 9, paddingVertical: 8 }}>
                <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', marginBottom: 4, fontWeight: 800 }}>
                  Response date
                </Text>
                <Text style={{ fontSize: VALUE_FONT, color: TEXT_DARK, fontWeight: 700, lineHeight: BODY_LINE_HEIGHT }}>
                  {data.responseDate}
                </Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: BORDER }} />

            <View style={{ paddingHorizontal: 9, paddingTop: 8, paddingBottom: 9 }}>
              <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 5 }}>
                RFI answer
              </Text>
              <Text style={{ fontSize: BASE_FONT, lineHeight: BODY_LINE_HEIGHT, color: TEXT_DARK }}>
                {clampChars(data.responseContent, MAX_RESPONSE_CHARS) || '—'}
              </Text>
            </View>
          </View>
        </Card>

        <Card title="Approval / Tracking">
          {/* Match reference: header row split into two columns */}
          <View
            style={{
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 7,
              overflow: 'hidden',
              backgroundColor: '#ffffff',
            }}
          >
            {/*
              Status badge intentionally omitted here — per the canonical
              status rule, the document badge appears only in the top summary
              card (the metadata grid above). This section is a chronological
              record of reviewer activity only.
            */}
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6 }}>
                <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                  REVIEWED BY
                </Text>
                <Text style={{ fontSize: VALUE_FONT, fontWeight: 700, color: TEXT_DARK }}>{reviewedByDisplay}</Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: BORDER }} />

            <View style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
              <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800 }}>
                APPROVAL / RESPONSE LOG
              </Text>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: BORDER }}>
              <View style={{ flexDirection: 'row', backgroundColor: TABLE_HEAD }}>
                {(['Response By', 'Role', 'Signature', 'Response Date'] as const).map((h, idx) => (
                  <Text
                    key={h}
                    style={{
                      width: idx === 0 ? '24%' : idx === 1 ? '18%' : idx === 2 ? '22%' : '36%',
                      fontSize: LABEL_FONT - 0.12,
                      fontWeight: 700,
                      paddingHorizontal: 6,
                      paddingVertical: 5,
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
              {approvalTruncated ? (
                <Text style={{ fontSize: LABEL_FONT - 0.4, color: MUTED, paddingHorizontal: 8, paddingVertical: 5 }}>
                  Showing first {MAX_APPROVAL_ROWS} reviewer row(s)
                </Text>
              ) : null}
              {approvalRowsForTable.map((r, idx) => (
                <View
                  key={`r-${idx}`}
                  style={{
                    flexDirection: 'row',
                    borderTopWidth: 1,
                    borderTopColor: BORDER,
                    backgroundColor: '#ffffff',
                  }}
                >
                  <Text
                    style={{
                      width: '24%',
                      fontSize: BASE_FONT,
                      paddingHorizontal: 6,
                      paddingVertical: 5,
                      borderRightWidth: 1,
                      borderRightColor: BORDER,
                      lineHeight: BODY_LINE_HEIGHT,
                    }}
                  >
                    {clampChars(r.name, 28)}
                  </Text>
                  <Text
                    style={{
                      width: '18%',
                      fontSize: BASE_FONT,
                      paddingHorizontal: 6,
                      paddingVertical: 5,
                      borderRightWidth: 1,
                      borderRightColor: BORDER,
                      lineHeight: BODY_LINE_HEIGHT,
                    }}
                  >
                    {clampChars(r.role, 14)}
                  </Text>
                  <View
                    style={{
                      width: '22%',
                      paddingHorizontal: 4,
                      paddingVertical: 4,
                      borderRightWidth: 1,
                      borderRightColor: BORDER,
                      justifyContent: 'center',
                      minHeight: 32,
                    }}
                  >
                    {r.signatureImageUri ? (
                      <Image
                        src={r.signatureImageUri}
                        style={{
                          maxHeight: 26,
                          width: '100%',
                          objectFit: 'contain',
                          objectPosition: 'left center',
                        }}
                      />
                    ) : (
                      <Text style={{ fontSize: BASE_FONT, lineHeight: BODY_LINE_HEIGHT }}>
                        {clampChars(r.signatureTextFallback, 18)}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      width: '36%',
                      fontSize: BASE_FONT,
                      paddingHorizontal: 6,
                      paddingVertical: 5,
                      lineHeight: BODY_LINE_HEIGHT,
                    }}
                  >
                    {r.date}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Card>

        <View
          style={{
            backgroundColor: HEADER_BG,
            borderRadius: 7,
            marginTop: 4,
            paddingVertical: 8,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: BASE_FONT, fontWeight: 700 }}>
            Construction Documentation.
          </Text>
        </View>
        </View>
      </Page>
    </Document>
  )
}
