import React from 'react'
import { Document, Image, Page, Text, View } from '@react-pdf/renderer'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CoApprovalRow = {
  title: string
  name: string
  signature: 'approved' | 'rejected' | 'pending'
  signatureName: string | null
  signatureUrl: string | null
  date: string
  notes: string
}

export type CoCostItem = {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export type ChangeOrderPdfViewModel = {
  // Branding / header
  logoDataUri: string
  brand: string
  brandSub: string
  themePrimary: string
  // Company contact (raw multi-line address for right block)
  contactAddress: string
  companyName: string
  companyPhone: string
  companyEmail: string
  // CO metadata
  coNumber: string
  status: string
  projectName: string
  projectNo: string
  date: string
  contractDate: string
  submittedBy: string
  priority: string
  title: string
  reasonForChange: string
  descriptionOfChanges: string
  timeAdded: string
  newCompletionDate: string
  costBreakdownItems: CoCostItem[]
  totalCost: number
  approvalRows: CoApprovalRow[]
  distribution: string
  footerNote: string
  debugInfo?: string
}

// ── Palette ───────────────────────────────────────────────────────────────────

const DARK = '#1a1a1a'
const AMBER = '#e6a800'
const TOTAL_BG = '#eef2f7'
const SECTION_BORDER = '#e0e0e0'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function coStatusStyle(status: string): { backgroundColor: string; color: string } {
  const s = status.toUpperCase()
  if (s === 'APPROVED') return { backgroundColor: '#2e7d32', color: '#ffffff' }
  if (s === 'REJECTED') return { backgroundColor: '#c62828', color: '#ffffff' }
  return { backgroundColor: AMBER, color: '#000000' }
}

function priorityTagStyle(priority: string): { backgroundColor: string; color: string } | null {
  const p = (priority ?? '').trim().toLowerCase()
  if (!p || p === '—') return null
  if (p === 'urgent' || p === 'high') return { backgroundColor: '#d32f2f', color: '#ffffff' }
  if (p === 'medium') return { backgroundColor: '#f59e0b', color: '#111111' }
  if (p === 'low') return { backgroundColor: '#388e3c', color: '#ffffff' }
  return { backgroundColor: '#64748b', color: '#ffffff' }
}

function contactLines(addr: string): string[] {
  return addr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function formatQtyRate(qty: number, unitPrice: number): string {
  if (!qty && !unitPrice) return '\u2014'
  if (!unitPrice) return `${qty} unit${qty !== 1 ? 's' : ''}`
  if (qty === 1) return '1 unit'
  // U+00D7 is the multiplication sign \xD7, supported in Helvetica Latin-1
  return `${qty} \u00D7 ${fmtUsd(unitPrice)}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ title, underline = true }: { title: string; underline?: boolean }) {
  return (
    <View style={{ alignSelf: 'flex-start', marginBottom: 10 }}>
      <Text
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: '#111111',
          paddingBottom: 3,
        }}
      >
        {title}
      </Text>
      {underline ? <View style={{ height: 2, backgroundColor: DARK }} /> : null}
    </View>
  )
}

function InfoCell({
  label,
  children,
  flex = 1,
}: {
  label: string
  children: React.ReactNode
  flex?: number
}) {
  return (
    <View style={{ flex, paddingHorizontal: 28, paddingVertical: 12 }}>
      <Text
        style={{
          fontSize: 8,
          fontWeight: 700,
          textTransform: 'uppercase',
          color: '#666666',
          letterSpacing: 0.4,
          marginBottom: 3,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ChangeOrderPdfDocument({ data }: { data: ChangeOrderPdfViewModel }) {
  const statusStyle = coStatusStyle(data.status)
  const pTagStyle = priorityTagStyle(data.priority)

  // Resolve cost rows — use breakdown items when present, else single-line total
  const costRows: CoCostItem[] =
    data.costBreakdownItems.length > 0
      ? data.costBreakdownItems
      : data.totalCost > 0
        ? [{ description: 'Total change order cost', quantity: 1, unitPrice: data.totalCost, total: data.totalCost }]
        : []

  const grandTotal =
    data.costBreakdownItems.length > 0
      ? data.costBreakdownItems.reduce((sum, r) => sum + r.total, 0)
      : data.totalCost

  const statusLabel =
    data.status.charAt(0).toUpperCase() + data.status.slice(1).toLowerCase()

  const showTimeBox =
    data.timeAdded &&
    data.timeAdded !== 'No Impact' &&
    data.timeAdded !== 'none' &&
    data.timeAdded !== '\u2014'

  const pageWidth = 595.28
  const pageHeight = (() => {
    const base = 820
    const costRows = Math.max(0, data.costBreakdownItems?.length ?? 0)
    const approvalRows = Math.max(0, data.approvalRows?.length ?? 0)
    const hasReason = Boolean((data.reasonForChange ?? '').trim() && data.reasonForChange !== '—')
    const narrativeLen = (data.descriptionOfChanges ?? '').trim().length
    const extra =
      costRows * 22 +
      approvalRows * 20 +
      (showTimeBox ? 26 : 0) +
      (hasReason ? 20 : 0) +
      Math.min(420, Math.ceil(narrativeLen / 180) * 16)
    return Math.min(4200, Math.max(740, base + extra))
  })()

  return (
    <Document>
      <Page
        size={[pageWidth, pageHeight]}
        style={{ fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a', backgroundColor: '#ffffff' }}
      >
        {/* ── HEADER ── */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingTop: 22,
            paddingBottom: 12,
            paddingHorizontal: 28,
          }}
        >
          {/* Left: logo + brand */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {data.logoDataUri ? (
              <Image src={data.logoDataUri} style={{ width: 48, height: 48 }} />
            ) : null}
            <View style={{ marginLeft: data.logoDataUri ? 9 : 0 }}>
              <Text style={{ fontSize: 18, fontWeight: 800, color: data.themePrimary, letterSpacing: 0.5 }}>
                {(data.brand || data.companyName || 'BUILDSWIFT').toUpperCase()}
              </Text>
              {data.brandSub ? (
                <Text style={{ fontSize: 10, color: '#475569', letterSpacing: 1.4, marginTop: 1 }}>
                  {data.brandSub.toUpperCase()}
                </Text>
              ) : null}
              <View
                style={{
                  height: 1.2,
                  backgroundColor: data.themePrimary,
                  marginTop: data.brandSub ? 3 : 4,
                  width: '100%',
                }}
              />
            </View>
          </View>
          {/* Right: contact block */}
          <View style={{ alignItems: 'flex-end' }}>
            {contactLines(data.contactAddress).map((line, i) => (
              <Text key={`cl-${i}`} style={{ fontSize: 9.5, color: '#475569', lineHeight: 1.4 }}>
                {line}
              </Text>
            ))}
            {data.companyPhone ? (
              <Text style={{ fontSize: 9.5, color: '#475569', lineHeight: 1.4 }}>{data.companyPhone}</Text>
            ) : null}
            {data.companyEmail ? (
              <Text style={{ fontSize: 9.5, color: '#2563eb', lineHeight: 1.4 }}>{data.companyEmail}</Text>
            ) : null}
          </View>
        </View>

        {/* ── CHANGE ORDER BAR ── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: DARK,
            paddingHorizontal: 28,
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#ffffff',
              textTransform: 'uppercase',
              letterSpacing: 1.5,
            }}
          >
            Change Order
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#ffcc00',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 4,
              }}
            >
              {data.coNumber}
            </Text>
            <Text
              style={{
                ...statusStyle,
                fontWeight: 700,
                fontSize: 9,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 10,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              {statusLabel}
            </Text>
          </View>
        </View>

        {/* ── PROJECT INFO TABLE ── */}
        {/* Row 1 */}
        <View
          style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#dddddd' }}
        >
          <InfoCell label="Project">
            <Text style={{ fontSize: 10, fontWeight: 600, color: '#111111' }}>{data.projectName}</Text>
          </InfoCell>
          <InfoCell label="Project Address">
            <Text style={{ fontSize: 10, fontWeight: 600, color: '#111111' }}>{data.projectNo}</Text>
          </InfoCell>
        </View>
        {/* Row 2 */}
        <View
          style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#dddddd' }}
        >
          <InfoCell label="Date">
            <Text style={{ fontSize: 10, fontWeight: 600, color: '#111111' }}>{data.date}</Text>
          </InfoCell>
          <InfoCell label="Due Date">
            <Text style={{ fontSize: 10, fontWeight: 600, color: '#111111' }}>{data.contractDate}</Text>
          </InfoCell>
        </View>
        {/* Row 3 */}
        <View
          style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#dddddd' }}
        >
          <InfoCell label="Submitted By">
            <Text style={{ fontSize: 10, fontWeight: 600, color: '#111111' }}>{data.submittedBy}</Text>
          </InfoCell>
          <InfoCell label="Priority">
            {pTagStyle ? (
              <Text
                style={{
                  ...pTagStyle,
                  fontSize: 8,
                  fontWeight: 700,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 3,
                  textTransform: 'uppercase',
                  alignSelf: 'flex-start',
                }}
              >
                {data.priority}
              </Text>
            ) : (
              <Text style={{ fontSize: 10, fontWeight: 600, color: '#111111' }}>{data.priority}</Text>
            )}
          </InfoCell>
        </View>

        {/* ── TITLE ── */}
        {data.title && data.title !== '—' ? (
          <View
            style={{
              paddingHorizontal: 28,
              paddingTop: 16,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: SECTION_BORDER,
            }}
          >
            <Text
              style={{
                fontSize: 8,
                fontWeight: 700,
                textTransform: 'uppercase',
                color: AMBER,
                letterSpacing: 0.6,
                marginBottom: 5,
              }}
            >
              Title
            </Text>
            <Text style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
              {data.title}
            </Text>
          </View>
        ) : null}

        {/* ── REASON FOR CHANGE ── */}
        <View
          style={{
            paddingHorizontal: 28,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: SECTION_BORDER,
          }}
        >
          <SectionTitle title="Reason for Change Order" />
          <Text style={{ fontSize: 10, color: '#2a2a2a', lineHeight: 1.5 }}>
            {data.reasonForChange}
          </Text>
        </View>

        {/* ── DESCRIPTION OF CHANGES ── */}
        <View
          style={{
            paddingHorizontal: 28,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: SECTION_BORDER,
          }}
        >
          <SectionTitle title="Description of Changes" />
          <Text style={{ fontSize: 10, color: '#2a2a2a', lineHeight: 1.5 }}>
            {data.descriptionOfChanges}
          </Text>
        </View>

        {/* ── CONTRACT ADJUSTMENTS ── */}
        <View
          style={{
            paddingHorizontal: 28,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: SECTION_BORDER,
          }}
        >
          <SectionTitle title="Contract Adjustments" underline={false} />

          {/* Schedule Impact block */}
          {showTimeBox ? (
            <View style={{ marginBottom: 14 }}>
              <SectionTitle title="Schedule Impact" />
              {/* Cream content box */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#fdf8f0',
                  borderWidth: 1,
                  borderColor: '#e5d5a8',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 3,
                  gap: 28,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: 700, color: '#555555' }}>TIME EXTENSION:</Text>
                  <Text style={{ fontSize: 10, fontWeight: 700, color: '#1a1a1a' }}>{data.timeAdded}</Text>
                </View>
                {data.newCompletionDate ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: 700, color: '#555555' }}>NEW COMPLETION DATE:</Text>
                    <Text style={{ fontSize: 10, fontWeight: 700, color: '#1a1a1a' }}>{data.newCompletionDate}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Cost breakdown */}
          {costRows.length > 0 ? (
            <View wrap={false}>
              <Text style={{ fontSize: 10, fontWeight: 700, marginBottom: 8, color: '#111111' }}>
                BREAKDOWN OF COSTS
              </Text>
              {/* Table header */}
              <View style={{ flexDirection: 'row', backgroundColor: DARK }}>
                <Text
                  style={{
                    width: '50%',
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#ffffff',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                >
                  Description
                </Text>
                <Text
                  style={{
                    width: '30%',
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#ffffff',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                >
                  Qty / Rate
                </Text>
                <Text
                  style={{
                    width: '20%',
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#ffffff',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    textAlign: 'right',
                  }}
                >
                  Amount
                </Text>
              </View>

              {/* Data rows */}
              {costRows.map((row, idx) => (
                <View
                  key={`cr-${idx}`}
                  style={{
                    flexDirection: 'row',
                    borderBottomWidth: 1,
                    borderBottomColor: '#dddddd',
                    backgroundColor: idx % 2 === 1 ? '#fafafa' : '#ffffff',
                    minHeight: 28,
                  }}
                >
                  <Text
                    style={{ width: '50%', fontSize: 10, paddingHorizontal: 10, paddingVertical: 8 }}
                  >
                    {row.description}
                  </Text>
                  <Text
                    style={{ width: '30%', fontSize: 10, paddingHorizontal: 10, paddingVertical: 8 }}
                  >
                    {formatQtyRate(row.quantity, row.unitPrice)}
                  </Text>
                  <Text
                    style={{
                      width: '20%',
                      fontSize: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      textAlign: 'right',
                      fontFamily: 'Courier',
                    }}
                  >
                    {fmtUsd(row.total)}
                  </Text>
                </View>
              ))}

              {/* Total row */}
              <View
                style={{
                  flexDirection: 'row',
                  borderTopWidth: 2,
                  borderTopColor: DARK,
                  borderBottomWidth: 2,
                  borderBottomColor: DARK,
                  backgroundColor: TOTAL_BG,
                }}
              >
                <Text
                  style={{
                    width: '80%',
                    fontSize: 10,
                    fontWeight: 700,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                  }}
                >
                  TOTAL CHANGE ORDER SUM
                </Text>
                <Text
                  style={{
                    width: '20%',
                    fontSize: 10,
                    fontWeight: 700,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                    textAlign: 'right',
                    fontFamily: 'Courier',
                  }}
                >
                  {fmtUsd(grandTotal)}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* ── APPROVAL SECTION ── */}
        {data.approvalRows.length > 0 ? (
          <View
            wrap={false}
            style={{
              paddingHorizontal: 28,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: SECTION_BORDER,
            }}
          >
            <SectionTitle title="Approval Section" />

            {/* Table header */}
            <View style={{ flexDirection: 'row', backgroundColor: DARK }}>
              {(['Name', 'Signature', 'Date', 'Notes'] as const).map((h, i) => (
                <Text
                  key={h}
                  style={{
                    width: i === 0 ? '30%' : i === 1 ? '35%' : i === 2 ? '18%' : '17%',
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#ffffff',
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                >
                  {h}
                </Text>
              ))}
            </View>

            {/* Data rows */}
            {data.approvalRows.map((row, idx) => (
              <View
                key={`ar-${idx}`}
                style={{
                  flexDirection: 'row',
                  borderBottomWidth: idx === data.approvalRows.length - 1 ? 2 : 1,
                  borderBottomColor: idx === data.approvalRows.length - 1 ? DARK : '#cccccc',
                  backgroundColor: '#ffffff',
                  minHeight: 28,
                }}
              >
                <Text
                  style={{ width: '30%', fontSize: 9, paddingHorizontal: 10, paddingVertical: 8 }}
                >
                  {row.name}
                </Text>
                <View style={{ width: '35%', paddingHorizontal: 10, paddingVertical: 8 }}>
                  {row.signatureUrl ? (
                    <Image
                      src={row.signatureUrl}
                      style={{ width: 68, height: 15, objectFit: 'contain' }}
                    />
                  ) : row.signatureName ? (
                    <Text
                      style={{
                        fontSize: 9,
                        fontFamily: 'Helvetica-Oblique',
                        color: '#444444',
                      }}
                    >
                      {row.signatureName}
                    </Text>
                  ) : (
                    <View
                      style={{
                        width: 60,
                        height: 0.7,
                        backgroundColor: '#94a3b8',
                        marginTop: 9,
                      }}
                    />
                  )}
                </View>
                <Text
                  style={{ width: '18%', fontSize: 9, paddingHorizontal: 10, paddingVertical: 8 }}
                >
                  {row.date}
                </Text>
                <Text
                  style={{ width: '17%', fontSize: 9, paddingHorizontal: 10, paddingVertical: 8 }}
                >
                  {row.notes}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── DISTRIBUTION ── */}
        {data.distribution ? (
          <View
            style={{
              paddingHorizontal: 28,
              paddingVertical: 12,
              backgroundColor: '#fafafa',
              borderTopWidth: 1,
              borderTopColor: '#bbbbbb',
            }}
          >
            <Text style={{ fontSize: 9, color: '#2c2c2c' }}>
              <Text style={{ fontWeight: 700 }}>{'DISTRIBUTION: '}</Text>
              {data.distribution}
            </Text>
          </View>
        ) : null}

      </Page>
    </Document>
  )
}
