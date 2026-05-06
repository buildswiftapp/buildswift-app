import React from 'react'
import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import { stripHtmlToPlainParagraphs } from '@/lib/document-html'

export type ChangeOrderApprovalPdfRow = {
  name: string
  role: string
  action: string
  /** Resolved image URL (often a data URI) when the reviewer drew/uploaded a signature */
  signatureUrl?: string | null
  /** Typed / printed signer name fallback when no image */
  signatureName?: string | null
  date: string
  notes: string
}

export type ChangeOrderAttachmentRow = { fileName: string; fileType: string; notes: string }

/** Legacy row shape used only while assembling cost breakdown cards in `change-order-pdf.ts`. */
export type ChangeOrderCostLinePdfRow = {
  lineDescription: string
  qtyDisplay: string
  unitCostDisplay: string
  subtotalDisplay: string
  justificationText?: string | null
}

export type ChangeOrderCostBreakdownCardPdf = {
  title: string
  sublabel: string
  amountDisplay: string
}

export type ChangeOrderCostBreakdownPdf =
  | { kind: 'justification'; body: string; totalImpactDisplay: string }
  | {
      kind: 'cards'
      cards: ChangeOrderCostBreakdownCardPdf[]
      /** Shown beside “Total Cost Impact” (formatted dollars; credits may append “credit”). */
      totalImpactDisplay: string
    }

/** Layout aligned with RFI-style PDFs; primary accents use original BuildSwift CO purple */
export type ChangeOrderPdfViewModel = {
  logoDataUri: string
  brand: string
  brandSub: string
  themePrimary: string
  contactAddress: string
  contactPhone: string
  contactEmail: string

  /** Full legal name under logo / in contact block */
  companyLegalName: string

  projectName: string
  projectAddress: string
  changeOrderNumber: string
  dateIssuedDisplay: string
  /** Shown only when not N/A */
  requiredReviewDateDisplayOptional: string

  toOwner: string
  fromContractor: string

  changeTitle: string
  summaryStatus: string
  priorityDisplay: string

  /** Change Order Summary — title + reason only */
  reasonForChangeDisplay: string

  detailedDescription: string

  costBreakdown: ChangeOrderCostBreakdownPdf
  /** Cost strip: prime / signed CO delta / revised total */
  originalContractAmountDisplay: string
  changeOrderAmountDisplay: string
  revisedContractAmountDisplay: string

  /** Schedule impact — original / proposed (impact or explicit) / new total */
  originalDurationDisplay: string
  proposedDurationDisplay: string
  newDurationDisplay: string

  attachments: ChangeOrderAttachmentRow[]

  finalAuthorizationStatus: string
  /** Latest decided reviewer full name when available (else single assignee, else em dash). */
  reviewedByDisplay: string
  approvalRows: ChangeOrderApprovalPdfRow[]
}

const BORDER = '#d9e0ea'
/** Outer page frame — deep purple */
const PAGE_BORDER = '#3f234d'
/** Cards / sections — muted lavender outline */
const PURPLE_BORDER = '#b9a7c8'
const PURPLE_DARK = '#3f234d'
const PURPLE_LABEL = '#4b2b5b'
const CARD_BG = '#ffffff'
const TEXT_DARK = '#1f2937'
const MUTED = '#5b6471'
const TABLE_HEAD = '#edf1f6'
const COST_TOTAL_BG = '#fef0e8'
const COST_CARD_SURFACE = '#ffffff'
/** Total impact strip — muted gray-blue (matches printable card-style breakdown) */
const COST_IMPACT_TOTAL_BG = '#eef2f7'

/** Portrait — width 1.2× nominal 6in, height 13in; matches RFI/Submittal; one sheet (wrap=false) */
const PAGE_WIDTH_PT = 6 * 72 * 1.2
const PAGE_HEIGHT_PT = 13 * 72
const PAGE_MARGIN_PT = 11

/** Clamps tuned so a full CO layout fits one page without overflow */
const MAX_DESCRIPTION_CHARS = 455
const MAX_FIELD_CELL_CHARS = 52
const MAX_ATTACHMENTS_ROWS = 3
const MAX_APPROVAL_ROWS = 3
const MAX_LINE_DESC_CHARS = 36
const MAX_SUMMARY_TITLE_CHARS = 58
const MAX_REASON_IN_SUMMARY_CHARS = 92
const PARTY_LINES_MAX = 2

const BASE_FONT = 7.35
const LABEL_FONT = 6.05
const BODY_LINE_HEIGHT = 1.25
/** Looser line height for multi-line description body copy */
const DESC_LINE_HEIGHT = 1.34
const SECTION_GAP = 6.25
const FRAME_INNER_PADDING = 10

function statusBadgeStyle(status: string): { backgroundColor: string; color: string } {
  const s = (status || '').toUpperCase()
  if (s === 'APPROVED') return { backgroundColor: '#16a34a', color: '#ffffff' }
  if (s === 'REJECTED') return { backgroundColor: '#dc2626', color: '#ffffff' }
  return { backgroundColor: '#f2c94c', color: '#111827' }
}

function priorityStyle(raw: string): { color: string } {
  const t = (raw || '').trim()
  const u = t.toUpperCase()
  if (u === 'HIGH' || /\bhigh\b/i.test(t) || /\burgent\b/i.test(t)) return { color: '#dc2626' }
  if (u === 'LOW' || /\blow\b/i.test(t)) return { color: '#16a34a' }
  return { color: TEXT_DARK }
}

/** Compact reviewer signature slot inside the APPROVAL / RESPONSE LOG grid */
function CoApprovalLogSignatureCell({
  signatureUrl,
  signatureName,
}: {
  signatureUrl?: string | null
  signatureName?: string | null
}) {
  const url = (signatureUrl || '').trim()
  const name = (signatureName || '').trim()
  return (
    <View
      style={{
        width: '22%',
        paddingHorizontal: 6,
        paddingVertical: 5,
        borderRightWidth: 1,
        borderRightColor: PURPLE_BORDER,
        justifyContent: 'center',
      }}
    >
      {url ? (
        <Image src={url} style={{ width: 64, height: 18, objectFit: 'contain' }} />
      ) : name ? (
        <Text
          style={{
            fontSize: BASE_FONT - 0.55,
            fontFamily: 'Arial',
            fontStyle: 'italic',
            color: TEXT_DARK,
            lineHeight: BODY_LINE_HEIGHT,
          }}
        >
          {clampText(name, 26)}
        </Text>
      ) : (
        <View style={{ borderBottomWidth: 0.75, borderBottomColor: BORDER, marginTop: 9, opacity: 0.88 }} />
      )}
    </View>
  )
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
  const nl = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (nl.length > 1) return nl
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return [parts[0], parts.slice(1).join(', ')]
  return [raw]
}

/** Section title overlaps top border (fieldset / legend), matching RFI PDF pattern */
function SectionWithLegend({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: SECTION_GAP }}>
      <View
        style={{
          position: 'relative',
          borderWidth: 1,
          borderColor: PURPLE_BORDER,
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
              fontSize: LABEL_FONT + 1.75,
              fontWeight: 800,
              color: PURPLE_LABEL,
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
  return <SectionWithLegend legend={title}>{children}</SectionWithLegend>
}

function ChangeOrderCostBreakdownSection({
  breakdown,
  originalContractAmountDisplay,
  changeOrderAmountDisplay,
  revisedContractAmountDisplay,
}: {
  breakdown: ChangeOrderCostBreakdownPdf
  originalContractAmountDisplay: string
  changeOrderAmountDisplay: string
  revisedContractAmountDisplay: string
}) {
  const totalImpactDisplay = breakdown.totalImpactDisplay

  return (
    <View style={{ borderWidth: 1, borderColor: PURPLE_BORDER, borderRadius: 7, overflow: 'hidden', backgroundColor: COST_CARD_SURFACE }}>
      {breakdown.kind === 'justification' ? (
        <View style={{ padding: 9, backgroundColor: '#faf8fc', borderBottomWidth: 1, borderBottomColor: BORDER }}>
          <Text style={{ fontSize: BASE_FONT, lineHeight: DESC_LINE_HEIGHT, color: TEXT_DARK, fontWeight: 700 }}>
            {clampText(breakdown.body, 520)}
          </Text>
        </View>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            paddingHorizontal: 4,
            paddingTop: 6,
            paddingBottom: 2,
            backgroundColor: '#faf8fc',
            borderBottomWidth: 1,
            borderBottomColor: BORDER,
          }}
        >
          {breakdown.cards.map((card, idx) => {
            const basis = breakdown.cards.length <= 5 ? '20%' : '25%'
            return (
              <View key={`co-cost-card-${idx}`} style={{ width: basis, paddingHorizontal: 3, paddingBottom: 5 }}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: BORDER,
                    borderRadius: 5,
                    backgroundColor: COST_CARD_SURFACE,
                    paddingHorizontal: 5,
                    paddingVertical: 6,
                    minHeight: 54,
                  }}
                >
                  <Text style={{ fontSize: BASE_FONT - 0.85, fontWeight: 900, color: TEXT_DARK }}>
                    {clampText(card.title, 24)}
                  </Text>
                  <Text
                    style={{
                      fontSize: LABEL_FONT - 0.55,
                      fontWeight: 700,
                      color: MUTED,
                      marginTop: 3,
                      lineHeight: 1.25,
                    }}
                  >
                    {clampText(card.sublabel, 36)}
                  </Text>
                  <Text
                    style={{
                      fontSize: BASE_FONT + 2.2,
                      fontWeight: 900,
                      color: TEXT_DARK,
                      marginTop: 6,
                      letterSpacing: 0.15,
                    }}
                  >
                    {card.amountDisplay}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      )}

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: COST_IMPACT_TOTAL_BG,
          paddingVertical: 7,
          paddingHorizontal: 10,
          borderBottomWidth: 1,
          borderBottomColor: BORDER,
        }}
      >
        <Text style={{ fontSize: BASE_FONT - 0.3, fontWeight: 900, color: TEXT_DARK }}>Total Cost Impact</Text>
        <Text style={{ fontSize: BASE_FONT + 2, fontWeight: 900, color: TEXT_DARK }}>{totalImpactDisplay}</Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          backgroundColor: COST_TOTAL_BG,
          borderTopWidth: 0,
          paddingVertical: 8,
          paddingHorizontal: 6,
        }}
      >
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: LABEL_FONT, color: PURPLE_LABEL, textTransform: 'uppercase', fontWeight: 800 }}>
            ORIGINAL CONTRACT AMOUNT
          </Text>
          <Text style={{ fontSize: BASE_FONT - 0.2, fontWeight: 900, marginTop: 4, color: TEXT_DARK }}>
            {originalContractAmountDisplay}
          </Text>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: LABEL_FONT, color: PURPLE_LABEL, textTransform: 'uppercase', fontWeight: 800 }}>
            CHANGE ORDER AMOUNT
          </Text>
          <Text style={{ fontSize: BASE_FONT - 0.2, fontWeight: 900, marginTop: 4, color: TEXT_DARK }}>
            {changeOrderAmountDisplay}
          </Text>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: LABEL_FONT, color: PURPLE_LABEL, textTransform: 'uppercase', fontWeight: 800 }}>
            REVISED CONTRACT AMOUNT
          </Text>
          <Text style={{ fontSize: BASE_FONT - 0.2, fontWeight: 900, marginTop: 4, color: TEXT_DARK }}>
            {revisedContractAmountDisplay}
          </Text>
        </View>
      </View>
    </View>
  )
}

function PartyBlock({ lines }: { lines: string[] }) {
  const show = lines.length ? lines.slice(0, PARTY_LINES_MAX) : ['Not Provided']
  return (
    <>
      {show.map((line, idx) => (
        <Text
          key={`p-${idx}`}
          style={{
            fontSize: 7.2,
            color: TEXT_DARK,
            fontWeight: idx === 0 ? 800 : 500,
            lineHeight: BODY_LINE_HEIGHT,
          }}
        >
          {clampText(line, MAX_FIELD_CELL_CHARS + 10)}
        </Text>
      ))}
    </>
  )
}

export function ChangeOrderPdfDocument({ data }: { data: ChangeOrderPdfViewModel }) {
  const statusStyle = statusBadgeStyle(data.summaryStatus)
  const priorityUpper = (data.priorityDisplay || '').toUpperCase()
  const pStyle = priorityStyle(data.priorityDisplay)

  const fromLines = splitLines(data.fromContractor)
  const toLines = splitLines(data.toOwner)

  const approvalRowsDisplayed: ChangeOrderApprovalPdfRow[] = (() => {
    const trimmed = data.approvalRows.slice(0, MAX_APPROVAL_ROWS)
    if (trimmed.length > 0) return trimmed
    return [
      {
        name: '—',
        role: '—',
        action: '—',
        date: '—',
        notes: 'No reviewer responses recorded yet.',
      },
    ]
  })()

  const attachmentRowsTruncated =
    data.attachments.length > MAX_ATTACHMENTS_ROWS
      ? data.attachments.slice(0, MAX_ATTACHMENTS_ROWS)
      : data.attachments

  const hasAttachments = data.attachments.some((a) => {
    const name = (a?.fileName ?? '').trim()
    return Boolean(name) && name !== 'N/A' && name !== '—' && name !== 'Not Provided'
  })

  const descPlainClamped = clampText(stripHtmlToPlainParagraphs(data.detailedDescription), MAX_DESCRIPTION_CHARS)

  const requiredResponseDateDisplay =
    (data.requiredReviewDateDisplayOptional || '').trim() && data.requiredReviewDateDisplayOptional !== 'N/A'
      ? data.requiredReviewDateDisplayOptional
      : 'N/A'

  return (
    <Document>
      <Page
        size={[PAGE_WIDTH_PT, PAGE_HEIGHT_PT]}
        wrap={false}
        style={{
          fontFamily: 'Arial',
          fontSize: BASE_FONT,
          color: TEXT_DARK,
          backgroundColor: '#ffffff',
          padding: PAGE_MARGIN_PT,
        }}
      >
        <View
          style={{
            borderWidth: 2,
            borderColor: PAGE_BORDER,
            borderRadius: 8,
            backgroundColor: '#ffffff',
            padding: FRAME_INNER_PADDING,
          }}
        >
          <View style={{ flexDirection: 'row', marginBottom: SECTION_GAP + 1 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: PURPLE_DARK,
                borderRadius: 7,
                minHeight: 28,
                justifyContent: 'center',
                paddingVertical: 5,
                paddingHorizontal: 11,
                marginRight: 7,
              }}
            >
              <Text style={{ color: '#ffffff', textAlign: 'center' }}>
                <Text style={{ fontWeight: 800, fontSize: 11, letterSpacing: 0.22 }}>CHANGE ORDER </Text>
                <Text style={{ fontWeight: 700, fontSize: 9.5, letterSpacing: 0.22 }}>CONTRACT MODIFICATION</Text>
              </Text>
            </View>
            <View
              style={{
                width: 94,
                backgroundColor: PURPLE_DARK,
                borderRadius: 7,
                minHeight: 28,
                paddingVertical: 5,
                paddingHorizontal: 7,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: '#ffffff',
                  fontSize: LABEL_FONT + 0.2,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                CHANGE ORDER #
              </Text>
              <Text style={{ color: '#ffffff', fontWeight: 800, fontSize: 9.8, textAlign: 'center', marginTop: 0 }}>
                {clampText(data.changeOrderNumber, 22)}
              </Text>
            </View>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: PURPLE_BORDER,
              borderRadius: 8,
              paddingHorizontal: FRAME_INNER_PADDING - 1,
              paddingVertical: 9,
              marginBottom: SECTION_GAP + 1,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, paddingRight: 10 }}>
                {data.logoDataUri ? (
                  <Image src={data.logoDataUri} style={{ width: 40, height: 40, objectFit: 'contain' }} />
                ) : null}
                <View style={{ marginLeft: data.logoDataUri ? 8 : 0, flexShrink: 1 }}>
                  <Text style={{ fontSize: BASE_FONT + 3.2, fontWeight: 800, color: PURPLE_DARK, letterSpacing: 0.25 }}>
                    {(data.brand || 'BUILDSWIFT').toUpperCase()}
                  </Text>
                  {data.brandSub ? (
                    <Text style={{ fontSize: LABEL_FONT + 0.2, color: MUTED, letterSpacing: 1.4, marginTop: 2 }}>
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
                    ...statusStyle,
                  }}
                >
                  {data.summaryStatus}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 10, flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ fontSize: BASE_FONT + 0.5, fontWeight: 800, color: TEXT_DARK, marginBottom: 3 }}>
                  {clampText(data.companyLegalName, 48)}
                </Text>
                {formatAddressLines(data.contactAddress)
                  .slice(0, 2)
                  .map((line, idx) => (
                    <Text key={`c-${idx}`} style={{ fontSize: BASE_FONT, color: TEXT_DARK, lineHeight: BODY_LINE_HEIGHT }}>
                      {clampText(line, MAX_FIELD_CELL_CHARS + 8)}
                    </Text>
                  ))}
                <Text style={{ fontSize: BASE_FONT - 0.35, color: TEXT_DARK, marginTop: 5 }}>
                  {clampText(`${data.contactPhone} | ${data.contactEmail}`, 72)}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: BORDER }} />
              <View style={{ flex: 1, paddingLeft: 10 }}>
                <Text
                  style={{
                    fontSize: LABEL_FONT,
                    color: PURPLE_LABEL,
                    textTransform: 'uppercase',
                    marginBottom: 3,
                    fontWeight: 800,
                  }}
                >
                  PROJECT
                </Text>
                <Text style={{ fontSize: BASE_FONT + 0.35, fontWeight: 900, color: PURPLE_DARK, marginBottom: 3 }}>
                  {clampText(data.projectName, 56)}
                </Text>
                {formatAddressLines(data.projectAddress)
                  .slice(0, 2)
                  .map((line, idx) => (
                    <Text
                      key={`pr-${idx}`}
                      style={{ fontSize: BASE_FONT, color: TEXT_DARK, lineHeight: BODY_LINE_HEIGHT, marginTop: idx === 0 ? 1 : 0 }}
                    >
                      {clampText(line, MAX_FIELD_CELL_CHARS + 8)}
                    </Text>
                  ))}
              </View>
            </View>

            <View
              style={{
                marginTop: 10,
                borderWidth: 1,
                borderColor: PURPLE_BORDER,
                borderRadius: 7,
                overflow: 'hidden',
                backgroundColor: CARD_BG,
              }}
            >
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6, borderRightWidth: 1, borderRightColor: BORDER }}>
                  <Text style={{ fontSize: LABEL_FONT, color: PURPLE_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                    Sent From
                  </Text>
                  <PartyBlock lines={fromLines.length ? fromLines : ['Not Provided']} />
                </View>
                <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6 }}>
                  <Text style={{ fontSize: LABEL_FONT, color: PURPLE_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                    Date Issued
                  </Text>
                  <Text style={{ fontSize: BASE_FONT + 0.2, fontWeight: 800, color: TEXT_DARK }}>{data.dateIssuedDisplay}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6, borderRightWidth: 1, borderRightColor: BORDER }}>
                  <Text style={{ fontSize: LABEL_FONT, color: PURPLE_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                    Sent To
                  </Text>
                  <PartyBlock lines={toLines.length ? toLines : ['Not Provided']} />
                </View>
                <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6, borderRightWidth: 1, borderRightColor: BORDER }}>
                  <Text style={{ fontSize: LABEL_FONT, color: PURPLE_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                    Required Response Date
                  </Text>
                  <Text style={{ fontSize: BASE_FONT + 0.2, fontWeight: 800, color: TEXT_DARK }}>{requiredResponseDateDisplay}</Text>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6 }}>
                  <Text style={{ fontSize: LABEL_FONT, color: PURPLE_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
                    Priority
                  </Text>
                  <Text style={{ fontSize: BASE_FONT + 0.2, fontWeight: 800, textTransform: 'uppercase', ...pStyle }}>
                    {priorityUpper || data.priorityDisplay || '—'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <Card title="CHANGE ORDER SUMMARY">
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1.12, paddingRight: 10, borderRightWidth: 1, borderRightColor: BORDER }}>
                <Text style={{ fontSize: LABEL_FONT, color: PURPLE_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                  CHANGE TITLE
                </Text>
                <Text style={{ fontSize: BASE_FONT + 0.5, fontWeight: 700, color: TEXT_DARK, lineHeight: BODY_LINE_HEIGHT }}>
                  {clampText(data.changeTitle, MAX_SUMMARY_TITLE_CHARS)}
                </Text>
              </View>
              <View style={{ flex: 0.88, paddingLeft: 10 }}>
                <Text style={{ fontSize: LABEL_FONT, color: PURPLE_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                  REASON FOR CHANGE
                </Text>
                <Text style={{ fontSize: BASE_FONT + 0.5, fontWeight: 700, color: TEXT_DARK, lineHeight: BODY_LINE_HEIGHT }}>
                  {clampText(data.reasonForChangeDisplay, MAX_REASON_IN_SUMMARY_CHARS)}
                </Text>
              </View>
            </View>
          </Card>

          <Card title="CHANGE DESCRIPTION">
            <Text style={{ fontSize: BASE_FONT, lineHeight: DESC_LINE_HEIGHT }}>{descPlainClamped}</Text>
          </Card>

          <Card title="COST BREAKDOWN">
            <ChangeOrderCostBreakdownSection
              breakdown={data.costBreakdown}
              originalContractAmountDisplay={data.originalContractAmountDisplay}
              changeOrderAmountDisplay={data.changeOrderAmountDisplay}
              revisedContractAmountDisplay={data.revisedContractAmountDisplay}
            />
          </Card>

          <Card title="SCHEDULE IMPACT">
            <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
              {(
                [
                  { label: 'ORIGINAL DURATION', value: data.originalDurationDisplay },
                  { label: 'PROPOSED DURATION', value: data.proposedDurationDisplay },
                  { label: 'NEW DURATION', value: data.newDurationDisplay },
                ] as const
              ).map((col) => (
                <View key={col.label} style={{ flex: 1, paddingHorizontal: 6, paddingVertical: 4 }}>
                  <Text
                    style={{
                      fontSize: LABEL_FONT,
                      color: PURPLE_LABEL,
                      textTransform: 'uppercase',
                      fontWeight: 800,
                    }}
                  >
                    {col.label}
                  </Text>
                  <Text style={{ fontSize: BASE_FONT - 0.2, fontWeight: 800, marginTop: 5, color: TEXT_DARK }}>{col.value}</Text>
                </View>
              ))}
            </View>
          </Card>

          {hasAttachments ? (
            <Card title="ATTACHMENTS">
              <View style={{ borderWidth: 1, borderColor: PURPLE_BORDER, borderRadius: 7, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', backgroundColor: TABLE_HEAD, borderBottomWidth: 1, borderBottomColor: PURPLE_BORDER }}>
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
                        color: PURPLE_DARK,
                        borderRightWidth: idx === 1 ? 0 : 1,
                        borderRightColor: BORDER,
                      }}
                    >
                      {h}
                    </Text>
                  ))}
                </View>
                {attachmentRowsTruncated.map((row, ri) => (
                  <View
                    key={`att-${ri}`}
                    style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: PURPLE_BORDER, backgroundColor: '#ffffff' }}
                  >
                    <Text
                      style={{
                        width: '68%',
                        fontSize: BASE_FONT - 0.5,
                        paddingHorizontal: 7,
                        paddingVertical: 6,
                        borderRightWidth: 1,
                        borderRightColor: BORDER,
                        lineHeight: BODY_LINE_HEIGHT,
                      }}
                    >
                      {clampText(row.fileName, 44)}
                    </Text>
                    <Text
                      style={{
                        width: '32%',
                        fontSize: BASE_FONT - 0.5,
                        paddingHorizontal: 7,
                        paddingVertical: 6,
                        lineHeight: BODY_LINE_HEIGHT,
                      }}
                    >
                      {row.fileType}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          <Card title="APPROVAL / AUTHORIZATION">
            <View style={{ borderWidth: 1, borderColor: PURPLE_BORDER, borderRadius: 7, overflow: 'hidden', backgroundColor: '#ffffff' }}>
              {/*
                Status badge intentionally omitted here — per the canonical
                status rule, the document badge appears only in the top
                summary card (the metadata grid above). This section is a
                chronological record of reviewer activity only.
              */}
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6 }}>
                  <Text style={{ fontSize: LABEL_FONT, color: PURPLE_LABEL, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                    REVIEWED BY
                  </Text>
                  <Text style={{ fontSize: BASE_FONT + 0.2, fontWeight: 700, color: TEXT_DARK }}>{clampText(data.reviewedByDisplay, 72)}</Text>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: BORDER }} />

              <View style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                <Text style={{ fontSize: LABEL_FONT, color: PURPLE_LABEL, textTransform: 'uppercase', fontWeight: 800 }}>
                  APPROVAL / RESPONSE LOG
                </Text>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: BORDER }}>
                <View style={{ flexDirection: 'row', backgroundColor: TABLE_HEAD }}>
                  {([
                    { h: 'Name', w: '20%' },
                    { h: 'Role', w: '16%' },
                    { h: 'Action', w: '24%' },
                    { h: 'Signature', w: '22%' },
                    { h: 'Date', w: '18%' },
                  ] as const).map(({ h, w }, idx, arr) => (
                    <Text
                      key={h}
                      style={{
                        width: w,
                        fontSize: LABEL_FONT - 0.12,
                        fontWeight: 700,
                        paddingHorizontal: 6,
                        paddingVertical: 5,
                        textTransform: 'uppercase',
                        color: PURPLE_DARK,
                        borderRightWidth: idx === arr.length - 1 ? 0 : 1,
                        borderRightColor: BORDER,
                      }}
                    >
                      {h}
                    </Text>
                  ))}
                </View>
                {approvalRowsDisplayed.map((r, idx) => (
                  <View
                    key={`ap-${idx}`}
                    style={{
                      flexDirection: 'row',
                      borderTopWidth: 1,
                      borderTopColor: PURPLE_BORDER,
                      backgroundColor: '#ffffff',
                      alignItems: 'stretch',
                    }}
                  >
                    <Text
                      style={{
                        width: '20%',
                        fontSize: BASE_FONT - 0.5,
                        paddingHorizontal: 6,
                        paddingVertical: 5,
                        borderRightWidth: 1,
                        borderRightColor: PURPLE_BORDER,
                        lineHeight: BODY_LINE_HEIGHT,
                      }}
                    >
                      {clampText(r.name, 26)}
                    </Text>
                    <Text
                      style={{
                        width: '16%',
                        fontSize: BASE_FONT - 0.5,
                        paddingHorizontal: 6,
                        paddingVertical: 5,
                        borderRightWidth: 1,
                        borderRightColor: PURPLE_BORDER,
                        lineHeight: BODY_LINE_HEIGHT,
                      }}
                    >
                      {clampText(r.role, 20)}
                    </Text>
                    <Text
                      style={{
                        width: '24%',
                        fontSize: BASE_FONT - 0.5,
                        paddingHorizontal: 6,
                        paddingVertical: 5,
                        borderRightWidth: 1,
                        borderRightColor: PURPLE_BORDER,
                        lineHeight: BODY_LINE_HEIGHT,
                      }}
                    >
                      {r.action}
                    </Text>
                    <CoApprovalLogSignatureCell signatureUrl={r.signatureUrl} signatureName={r.signatureName} />
                    <Text
                      style={{
                        width: '18%',
                        fontSize: BASE_FONT - 0.5,
                        paddingHorizontal: 6,
                        paddingVertical: 5,
                        lineHeight: BODY_LINE_HEIGHT,
                      }}
                    >
                      {clampText(r.date, 16)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </Card>

          <View
            style={{
              backgroundColor: PURPLE_DARK,
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
