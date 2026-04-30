import React from 'react'
import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import { stripHtmlToPlainParagraphs } from '@/lib/document-html'
import { PdfHeader } from '@/lib/server/pdf-header'

export type RfiApprovalRow = {
  name: string
  role: string
  action: string
  reference: string
  signatureName: string | null
  signatureUrl?: string | null
  date: string
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

const BORDER = '#d9e0ea'
const CARD_BG = '#ffffff'
const HEADER_BG = '#153f6f'
const TITLE_BLUE = '#1e4275'
const TEXT_DARK = '#1f2937'
const MUTED = '#5b6471'
const TABLE_HEAD = '#edf1f6'
const STATUS_YELLOW = { backgroundColor: '#f2c94c', color: '#111827' }
const BASE_FONT = 9.2
const LABEL_FONT = 7
const VALUE_FONT = 9.2
const SECTION_GAP = 10

function statusBadgeStyle(status: string): { backgroundColor: string; color: string } {
  const s = (status || '').toUpperCase()
  if (s === 'ANSWERED') return { backgroundColor: '#16a34a', color: '#ffffff' }
  if (s === 'CLOSED') return { backgroundColor: '#dc2626', color: '#ffffff' }
  return { backgroundColor: '#f59e0b', color: '#111827' }
}

function impactMark(value: string, expected: 'None' | 'Potential' | 'Yes') {
  return (value || '').toLowerCase() === expected.toLowerCase() ? '☑' : '☐'
}

function blankIfPlaceholder(value: string | null | undefined) {
  const v = (value || '').trim()
  if (!v) return ''
  const upper = v.toUpperCase()
  if (upper === 'N/A' || upper === 'NA' || upper === 'NOT PROVIDED') return ''
  if (v === '—' || v === '-') return ''
  return v
}

function clampText(value: string, maxChars: number) {
  const t = (value || '').trim()
  if (t.length <= maxChars) return t
  return t.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…'
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
    <View style={{ flex: 1, paddingRight: 8 }}>
      <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </Text>
      <Text style={{ fontSize: VALUE_FONT, color: TEXT_DARK, fontWeight: 600, lineHeight: 1.25 }}>
        {value}
      </Text>
    </View>
  )
}

function CardTitle({ title }: { title: string }) {
  return (
    <Text
      style={{
        fontSize: 9.2,
        fontWeight: 800,
        color: TITLE_BLUE,
        textTransform: 'uppercase',
        letterSpacing: 0.2,
        marginBottom: 6,
      }}
    >
      {title}
    </Text>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 7,
        backgroundColor: CARD_BG,
        marginBottom: SECTION_GAP,
      }}
    >
      <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 9 }}>
        <CardTitle title={title} />
        {children}
      </View>
    </View>
  )
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
  const isPending = (data.status || '').toUpperCase() === 'PENDING'
  const approvalTopStatusLabel = isPending ? 'PENDING' : (data.finalStatus || data.status || 'PENDING')
  const reviewedByDisplay = data.reviewedBy && data.reviewedBy.trim() ? data.reviewedBy : '—'

  return (
    <Document>
      <Page
        size="LETTER"
        style={{
          fontFamily: 'Helvetica',
          fontSize: BASE_FONT,
          color: TEXT_DARK,
          backgroundColor: '#ffffff',
          padding: 10,
        }}
      >
        <View
          style={{
            flex: 1,
            borderWidth: 2,
            borderColor: HEADER_BG,
            borderRadius: 4,
            backgroundColor: '#ffffff',
            padding: 8,
          }}
        >
          <PdfHeader
            themeColor={HEADER_BG}
            titleLeft="RFI"
            titleRight="REQUEST FOR INFORMATION"
            numberLabel="RFI #"
            numberValue={data.rfiNumber}
            logoDataUri={data.logoDataUri}
            brand={data.brand || 'BuildSwift'}
            brandSub={data.brandSub || null}
            statusText={data.status}
            statusStyle={statusStyle as any}
            contactAddress={data.contactAddress}
            contactPhone={data.contactPhone}
            contactEmail={data.contactEmail}
            projectName={data.projectName}
            projectAddress={data.projectAddress}
            mutedColor={MUTED}
            titleAccentColor={TITLE_BLUE}
            borderColor={BORDER}
          />

          {/* Summit layout: boxed 2x2 grid for dates + to/from */}
          <View
            style={{
              marginTop: 0,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 7,
              overflow: 'hidden',
            }}
          >
            {/* Row 1: Date Issued | Required Response Date */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER }}>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, borderRightWidth: 1, borderRightColor: BORDER }}>
                <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
                  DATE ISSUED
                </Text>
                <Text style={{ fontSize: 9.6, fontWeight: 800, color: TEXT_DARK }}>{data.issueDate}</Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
                  REQUIRED RESPONSE DATE
                </Text>
                <Text style={{ fontSize: 9.6, fontWeight: 800, color: TEXT_DARK }}>{data.requiredResponseDate}</Text>
              </View>
            </View>

            {/* Row 2: From */}
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
                  FROM
                </Text>
                {(splitLines(data.sender).length ? splitLines(data.sender) : ['Not Provided']).slice(0, 5).map((line, idx) => (
                  <Text
                    key={`from3-${idx}`}
                    style={{ fontSize: 8.8, color: TEXT_DARK, fontWeight: idx === 0 ? 800 : 500, lineHeight: 1.25 }}
                  >
                    {line}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* RFI SUMMARY (match reference: tighter padding + yellow status pill) */}
        <View style={{ borderWidth: 1.4, borderColor: BORDER, borderRadius: 7, backgroundColor: '#ffffff', marginBottom: 7 }}>
          <View style={{ paddingHorizontal: 8, paddingTop: 6, paddingBottom: 7 }}>
            <Text style={{ fontSize: 9.2, fontWeight: 900, color: TEXT_DARK, textTransform: 'uppercase', letterSpacing: 0.2, marginBottom: 5 }}>
              RFI SUMMARY
            </Text>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 2, borderRightWidth: 1, borderRightColor: BORDER, paddingRight: 10 }}>
                <Text style={{ fontSize: 6.2, color: MUTED, textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>
                  RFI TITLE
                </Text>
                <Text style={{ fontSize: 8.4, fontWeight: 700, color: TEXT_DARK }}>
                  {clampText(data.summaryTitle, 80)}
                </Text>
              </View>
              <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: BORDER, paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 6.2, color: MUTED, textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>
                  PRIORITY
                </Text>
                <Text style={{ fontSize: 8.6, fontWeight: 800, ...(priorityStyle as any) }}>{priorityUpper || '—'}</Text>
              </View>
              <View style={{ flex: 1, paddingLeft: 10 }}>
                <Text style={{ fontSize: 6.2, color: MUTED, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                  STATUS
                </Text>
                <Text
                  style={{
                    alignSelf: 'flex-start',
                    fontSize: 7.8,
                    fontWeight: 800,
                    paddingVertical: 4,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    ...(STATUS_YELLOW as any),
                  }}
                >
                  {data.status}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Card title="Detailed Question / Description">
          <Text style={{ fontSize: 8, lineHeight: 1.35, marginBottom: 5 }}>
            {stripHtmlToPlainParagraphs(data.detailedQuestion)}
          </Text>
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
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 7, borderRightWidth: 1, borderRightColor: BORDER }}>
                <Text style={{ fontSize: 6.2, color: MUTED, textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>
                  FINAL STATUS
                </Text>
                <Text
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: 14,
                    paddingVertical: 3.5,
                    borderRadius: 10,
                    fontSize: 7.8,
                    fontWeight: 800,
                    borderWidth: 0.8,
                    borderColor: '#e7d49a',
                    ...(STATUS_YELLOW as any),
                  }}
                >
                  {approvalTopStatusLabel}
                </Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 7 }}>
                <Text style={{ fontSize: 6.2, color: MUTED, textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>
                  REVIEWED BY
                </Text>
                <Text style={{ fontSize: 8.2, fontWeight: 700, color: TEXT_DARK }}>{reviewedByDisplay}</Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: BORDER }} />

            <View style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 6.2, color: MUTED, textTransform: 'uppercase', fontWeight: 700 }}>
                APPROVAL / RESPONSE LOG
              </Text>
            </View>

            {/* Dense table like reference */}
            <View style={{ borderTopWidth: 1, borderTopColor: BORDER }}>
              <View style={{ flexDirection: 'row', backgroundColor: TABLE_HEAD }}>
                {['Reviewer Email', 'Signature', 'Action', 'Date'].map((h, idx) => (
                  <Text
                    key={h}
                    style={{
                      width:
                        idx === 0 ? '28%' : idx === 1 ? '24%' : idx === 2 ? '28%' : '20%',
                      fontSize: 6.6,
                      fontWeight: 700,
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
              {(
                data.approvalRows.length
                  ? data.approvalRows
                  : [
                      {
                        name: (splitLines(data.sender).length ? splitLines(data.sender)[0] : data.sender) || 'Not Provided',
                        role: 'Submitter',
                        action: 'Submitted',
                        date: data.issueDate || '—',
                        reference: 'RFI submitted',
                        signatureName: null,
                        signatureUrl: null,
                      },
                    ]
              ).map((r, idx) => (
                  <View
                    key={`r-${idx}`}
                    style={{
                      flexDirection: 'row',
                      borderTopWidth: 1,
                      borderTopColor: BORDER,
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <Text style={{ width: '28%', fontSize: 7.4, paddingHorizontal: 6, paddingVertical: 4, borderRightWidth: 1, borderRightColor: BORDER }}>
                      {r.name}
                    </Text>
                    <View style={{ width: '24%', paddingHorizontal: 6, paddingVertical: 4, borderRightWidth: 1, borderRightColor: BORDER }}>
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

        {/* Flexible spacer so content fills the page when short */}
        <View style={{ flexGrow: 1 }} />

        <View
          style={{
            backgroundColor: HEADER_BG,
            borderRadius: 7,
            marginTop: 2,
            paddingVertical: 8,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 8, fontWeight: 700 }}>
            Construction Documentation.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
