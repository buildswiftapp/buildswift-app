import React from 'react'
import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import { stripHtmlToPlainParagraphs } from '@/lib/document-html'
import { PdfHeader } from '@/lib/server/pdf-header'

export type ChangeOrderAttachmentRow = { fileName: string; fileType: string; notes: string }

export type ChangeOrderApprovalPdfRow = {
  name: string
  reviewerEmail: string
  action: string
  date: string
  signatureName: string | null
  signatureUrl?: string | null
}

export type ChangeOrderCostBreakdownPdfRow = {
  description: string
  qty: string
  unitPrice: string
  calculation: string
  /** Line total (typically extension). */
  amount: string
}

/** Spec: Change Order PDF — all display strings should be defaulted upstream (N/A, Not Provided). */
export type ChangeOrderPdfViewModel = {
  logoDataUri: string
  brand: string
  brandSub: string
  themePrimary: string
  contactAddress: string
  contactPhone: string
  contactEmail: string

  projectName: string
  projectAddress: string
  changeOrderNumber: string
  dateIssuedDisplay: string
  requiredReviewDateDisplay: string
  /** Primary contact / signer line(s) shown under FROM — may include newlines */
  fromContractor: string

  changeTitle: string
  summaryStatus: string
  priorityDisplay: string

  detailedDescription: string
  reasonForChangeDisplay: string
  reasonCategoryDisplay: string

  drawingSheetNumbers: string
  specificationSections: string
  detailReferences: string
  relatedRfiNumbers: string
  relatedSubmittalNumbers: string

  costBreakdownRows: ChangeOrderCostBreakdownPdfRow[]
  totalChangeAmount: string

  /** Consolidated schedule impact sentence for PDF (days + optional completion). */
  scheduleImpactDisplay: string

  attachments: ChangeOrderAttachmentRow[]

  reviewerComments: string
  reviewedBy: string
  reviewDate: string

  finalAuthorizationStatus: string
  approvalRows: ChangeOrderApprovalPdfRow[]
}

const BORDER = '#d9e0ea'
const CARD_BG = '#ffffff'
const PURPLE = '#4b2b5b'
const PURPLE_DARK = '#3f234d'
const PURPLE_BORDER = '#b9a7c8'
const TEXT_DARK = '#1f2937'
const MUTED = '#5b6471'
const TABLE_HEAD = '#edf1f6'
const COST_SECTION_HEADER_BG = '#dfe8f9'
const COST_SECTION_TOTAL_BG = '#fef0e8'
const BASE_FONT = 7.6
const LABEL_FONT = 6.2
/** Tight spacing so letter-size + wrap=false fits typical CO content on one sheet. */
const SECTION_GAP = 4

function statusBadgeStyle(status: string): { backgroundColor: string; color: string } {
  const s = (status || '').toUpperCase()
  if (s === 'APPROVED') return { backgroundColor: '#16a34a', color: '#ffffff' }
  if (s === 'REJECTED') return { backgroundColor: '#dc2626', color: '#ffffff' }
  return { backgroundColor: '#f2c94c', color: '#111827' }
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

function CardTitle({ title }: { title: string }) {
  return (
    <Text
      style={{
        fontSize: 7.4,
        fontWeight: 800,
        color: PURPLE_DARK,
        textTransform: 'uppercase',
        letterSpacing: 0.35,
        marginBottom: 3,
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
        borderColor: PURPLE_BORDER,
        borderRadius: 8,
        backgroundColor: CARD_BG,
        marginBottom: SECTION_GAP,
      }}
    >
      <View style={{ paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6 }}>
        <CardTitle title={title} />
        {children}
      </View>
    </View>
  )
}

function FieldCol({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, paddingRight: 6 }}>
      <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 7.8, color: TEXT_DARK, fontWeight: 600, lineHeight: 1.2 }}>{value}</Text>
    </View>
  )
}

export function ChangeOrderPdfDocument({ data }: { data: ChangeOrderPdfViewModel }) {
  const statusStyle = statusBadgeStyle(data.summaryStatus)
  const authStyle = statusBadgeStyle(data.finalAuthorizationStatus)
  const appr = (
    data.approvalRows.length
      ? data.approvalRows
      : [{ name: '', reviewerEmail: '', action: '', date: '', signatureName: null, signatureUrl: null }]
  ).slice(0, 3)

  const fromSplit = splitLines(data.fromContractor)
  const fromDisplayLines = fromSplit.length ? fromSplit.slice(0, 4) : ['Not Provided']

  return (
    <Document>
      <Page
        size="LETTER"
        wrap={false}
        style={{
          fontFamily: 'Helvetica',
          fontSize: BASE_FONT,
          color: TEXT_DARK,
          backgroundColor: '#ffffff',
          padding: 8,
        }}
      >
        <View
          style={{
            borderWidth: 2,
            borderColor: PURPLE_DARK,
            borderRadius: 4,
            backgroundColor: '#ffffff',
            padding: 7,
          }}
        >
            <PdfHeader
              themeColor={PURPLE_DARK}
              titleLeft="CHANGE ORDER"
              numberLabel="CHANGE ORDER #"
              numberValue={data.changeOrderNumber}
              logoDataUri={data.logoDataUri}
              brand={data.brand || 'BuildSwift'}
              brandSub={data.brandSub || null}
              statusText={data.summaryStatus}
              statusStyle={statusStyle as any}
              contactAddress={data.contactAddress}
              contactPhone={data.contactPhone}
              contactEmail={data.contactEmail}
              projectName={data.projectName}
              projectAddress={data.projectAddress}
              mutedColor={MUTED}
              titleAccentColor={PURPLE_DARK}
              borderColor={PURPLE_BORDER}
            />

          {/* Date issued / due / from — aligns with Submittal PDF */}
          <View
            style={{
              marginTop: 0,
              marginBottom: SECTION_GAP,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 7,
              overflow: 'hidden',
              backgroundColor: '#fafbfb',
            }}
          >
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER }}>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, borderRightWidth: 1, borderRightColor: BORDER }}>
                <Text
                  style={{ fontSize: LABEL_FONT, color: PURPLE_DARK, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}
                >
                  DATE ISSUED
                </Text>
                <Text style={{ fontSize: 9.6, fontWeight: 900, color: TEXT_DARK }}>{data.dateIssuedDisplay}</Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text
                  style={{ fontSize: LABEL_FONT, color: PURPLE_DARK, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}
                >
                  REQUIRED REVIEW DATE
                </Text>
                <Text style={{ fontSize: 9.6, fontWeight: 900, color: TEXT_DARK }}>{data.requiredReviewDateDisplay}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text
                  style={{ fontSize: LABEL_FONT, color: PURPLE_DARK, textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}
                >
                  FROM
                </Text>
                {fromDisplayLines.map((line, idx) => (
                  <Text
                    key={`from-${idx}`}
                    style={{
                      fontSize: 8.8,
                      color: TEXT_DARK,
                      fontWeight: idx === 0 ? 900 : 500,
                      lineHeight: 1.25,
                    }}
                  >
                    {line}
                  </Text>
                ))}
              </View>
            </View>
          </View>

        <Card title="Change Order Summary">
          <View style={{ borderWidth: 1, borderColor: PURPLE_BORDER, borderRadius: 8, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row' }}>
              {[
                { label: 'Change title', value: clampText(data.changeTitle, 72), flex: 1.6 },
                { label: 'Priority', value: data.priorityDisplay, flex: 0.55 },
                { label: 'Status', value: data.summaryStatus, flex: 0.55 },
              ].map((c, idx) => (
                <View
                  key={`sum-${idx}`}
                  style={{
                    flex: c.flex as any,
                    paddingHorizontal: 6,
                    paddingVertical: 6,
                    borderRightWidth: idx === 2 ? 0 : 1,
                    borderRightColor: PURPLE_BORDER,
                  }}
                >
                  <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 900, marginBottom: 2 }}>
                    {c.label}
                  </Text>
                  {c.label === 'Status' ? (
                    <Text
                      style={{
                        alignSelf: 'flex-start',
                        fontSize: 7.1,
                        fontWeight: 900,
                        paddingVertical: 3,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        textTransform: 'uppercase',
                        ...statusStyle,
                      }}
                    >
                      {c.value}
                    </Text>
                  ) : c.label === 'Priority' ? (
                    <Text style={{ fontSize: 7.6, fontWeight: 900, color: '#b45309', textTransform: 'uppercase' }}>{c.value}</Text>
                  ) : (
                    <Text style={{ fontSize: 7.4, fontWeight: 800 }}>{c.value}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        </Card>

        <Card title="Change Description">
          <View style={{ borderWidth: 1, borderColor: PURPLE_BORDER, borderRadius: 8, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: PURPLE_BORDER }}>
              <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 900, marginBottom: 2 }}>
                Detailed description of change
              </Text>
              <Text style={{ fontSize: 7.3, lineHeight: 1.25 }}>
                {stripHtmlToPlainParagraphs(data.detailedDescription)}
              </Text>
            </View>
            <View style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
              <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 900, marginBottom: 2 }}>
                Reason for change
              </Text>
              <Text style={{ fontSize: 7.2, fontWeight: 800, marginBottom: 2, color: TEXT_DARK }}>
                {data.reasonCategoryDisplay}
              </Text>
            </View>
          </View>
        </Card>

        <Card title="Breakdown of costs">
          <View style={{ borderWidth: 1, borderColor: PURPLE_BORDER, borderRadius: 8, overflow: 'hidden', marginTop: 2 }}>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: COST_SECTION_HEADER_BG,
                borderBottomWidth: 1,
                borderBottomColor: PURPLE_BORDER,
              }}
            >
              {(
                [
                  ['DESCRIPTION', { flex: 2.08 }, {}],
                  ['QTY', { flex: 0.74 }, {}],
                  ['UNIT PRICE', { flex: 1.06 }, {}],
                  ['CALCULATION', { flex: 1.32 }, {}],
                  ['AMOUNT', { flex: 1.86 }, { textAlign: 'right' as const }],
                ] as const
              ).map(([label, wrap, extra], idx) => (
                <View
                  key={`co-cost-h-${idx}`}
                  style={{
                    ...wrap,
                    paddingHorizontal: 5,
                    paddingVertical: 5,
                    borderRightWidth: idx === 4 ? 0 : 1,
                    borderRightColor: PURPLE_BORDER,
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 5.85,
                      fontWeight: 900,
                      color: PURPLE_DARK,
                      textTransform: 'uppercase',
                      letterSpacing: 0.2,
                      ...extra,
                    }}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>
            {data.costBreakdownRows.map((row, ri) => (
              <View
                key={`co-cost-${ri}`}
                style={{
                  flexDirection: 'row',
                  backgroundColor: CARD_BG,
                  borderBottomWidth: 1,
                  borderBottomColor: PURPLE_BORDER,
                }}
              >
                {[
                  [row.description, { flex: 2.08 }, { fontWeight: 600 }],
                  [row.qty, { flex: 0.74 }, {}],
                  [row.unitPrice, { flex: 1.06 }, {}],
                  [row.calculation, { flex: 1.32 }, {}],
                  [row.amount, { flex: 1.86 }, { fontWeight: 900, textAlign: 'right' as const }],
                ].map(([cellText, wrap, sx], ci) => {
                  const ws = wrap as { flex?: number }
                  const textSx = sx as { fontWeight?: number; textAlign?: 'left' | 'right' | 'center' }
                  return (
                    <View
                      key={`co-cost-cell-${ri}-${ci}`}
                      style={{
                        ...ws,
                        paddingHorizontal: 5,
                        paddingVertical: 5,
                        borderRightWidth: ci === 4 ? 0 : 1,
                        borderRightColor: PURPLE_BORDER,
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 7.05, color: TEXT_DARK, ...textSx }}>{String(cellText)}</Text>
                    </View>
                  )
                })}
              </View>
            ))}
            <View style={{ flexDirection: 'row', backgroundColor: COST_SECTION_TOTAL_BG }}>
              <View
                style={{
                  flex: 2.08 + 0.74 + 1.06 + 1.32,
                  paddingHorizontal: 5,
                  paddingVertical: 6,
                  borderRightWidth: 1,
                  borderRightColor: PURPLE_BORDER,
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 6,
                    fontWeight: 900,
                    color: PURPLE_DARK,
                    textTransform: 'uppercase',
                    letterSpacing: 0.25,
                  }}
                >
                  Total change order sum
                </Text>
              </View>
              <View
                style={{
                  flex: 1.86,
                  paddingHorizontal: 5,
                  paddingVertical: 6,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 7.2, fontWeight: 900, color: TEXT_DARK, textAlign: 'right' }}>{data.totalChangeAmount}</Text>
              </View>
            </View>
          </View>
        </Card>

        <Card title="Schedule Impact">
          <View
            style={{
              borderWidth: 1,
              borderColor: PURPLE_BORDER,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 9,
              backgroundColor: CARD_BG,
            }}
          >
            <Text style={{ fontSize: 9.5, fontWeight: 900, color: TEXT_DARK, lineHeight: 1.35 }}>{data.scheduleImpactDisplay}</Text>
          </View>
        </Card>

        <Card title="Approval / Authorization">
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: LABEL_FONT, color: MUTED, textTransform: 'uppercase', fontWeight: 800, marginRight: 8 }}>
              Final status
            </Text>
            <Text
              style={{
                fontSize: 7.2,
                fontWeight: 800,
                paddingVertical: 3,
                paddingHorizontal: 10,
                borderRadius: 8,
                textTransform: 'uppercase',
                ...authStyle,
              }}
            >
              {data.finalAuthorizationStatus}
            </Text>
          </View>
          <View style={{ borderWidth: 1, borderColor: PURPLE_BORDER, borderRadius: 8, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', backgroundColor: TABLE_HEAD }}>
              {['Reviewer Email', 'Signature', 'Action', 'Date'].map((h, i) => (
                <Text
                  key={h}
                  style={{
                    width: i === 0 ? '28%' : i === 1 ? '24%' : i === 2 ? '28%' : '20%',
                    fontSize: 6.2,
                    fontWeight: 800,
                    paddingHorizontal: 4,
                    paddingVertical: 3,
                    textTransform: 'uppercase',
                  }}
                >
                  {h}
                </Text>
              ))}
            </View>
            {appr.map((r, idx) => (
              <View key={`ap-${idx}`} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: PURPLE_BORDER }}>
                <Text style={{ width: '28%', fontSize: 6.8, paddingHorizontal: 4, paddingVertical: 3 }}>{r.reviewerEmail}</Text>
                <View style={{ width: '24%', paddingHorizontal: 4, paddingVertical: 3 }}>
                  {r.signatureUrl ? (
                    <Image src={r.signatureUrl} style={{ width: 64, height: 14, objectFit: 'contain' }} />
                  ) : r.signatureName ? (
                    <Text style={{ fontSize: 6.9, fontFamily: 'Helvetica-Oblique', color: TEXT_DARK }}>{r.signatureName}</Text>
                  ) : (
                    <View style={{ height: 0.8, backgroundColor: '#94a3b8', marginTop: 8 }} />
                  )}
                </View>
                <Text style={{ width: '28%', fontSize: 6.8, paddingHorizontal: 4, paddingVertical: 3 }}>{r.action}</Text>
                <Text style={{ width: '20%', fontSize: 6.8, paddingHorizontal: 4, paddingVertical: 3 }}>{r.date}</Text>
              </View>
            ))}
          </View>
        </Card>

          <View style={{ backgroundColor: PURPLE_DARK, borderRadius: 10, marginTop: 4, paddingVertical: 6, alignItems: 'center' }}>
            <Text style={{ color: '#ffffff', fontSize: 8, fontWeight: 900, letterSpacing: 0.2 }}>
              Construction Documentation.
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
