import React from 'react'
import { Document, Image, Page, Text, View } from '@react-pdf/renderer'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubmittalApprovalRow = {
  title: string
  role: string
  signature: 'approved' | 'rejected' | 'pending'
  signatureName?: string | null
  signatureUrl?: string | null
  date: string
  notes: string
}

export type SubmittalLinkedDoc = {
  id: string
  title: string
}

export type SubmittalPdfViewModel = {
  // Company header
  logoDataUri: string
  brand: string
  brandSub: string
  themePrimary: string
  contactAddress: string
  contactPhone: string
  contactEmail: string
  // Submittal metadata
  submittalNumber: string
  status: string
  projectName: string
  projectNo: string
  date: string
  contractDate: string
  submittedBy: string
  priority: string
  rfiNo: string
  actionNeededBy: string
  specSection: string
  manufacturer: string
  submittalTitle: string
  // Content sections
  questionIssue: string
  attachments: string[]
  linkedDocuments: SubmittalLinkedDoc[]
  // Approval
  approvalRows: SubmittalApprovalRow[]
  // Footer
  footerNote: string
}

// ── Palette ───────────────────────────────────────────────────────────────────

const DARK = '#1a1a1a'
const AMBER = '#e6a800'
const SECTION_BORDER = '#dddddd'

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadgeStyle(status: string): { backgroundColor: string; color: string } {
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

// Signature cell text + colour matching HTML .sig-approved / .sig-pending
function sigStyle(sig: SubmittalApprovalRow['signature']): { text: string; color: string } {
  if (sig === 'approved') return { text: 'APPROVED', color: '#0a6b0a' }
  if (sig === 'rejected') return { text: 'REJECTED', color: '#c62828' }
  return { text: 'Pending', color: '#c95d00' }
}

function contactLines(address: string) {
  return address.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={{ alignSelf: 'flex-start', marginBottom: 10 }}>
      <Text
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: '#111111',
          paddingBottom: 3,
        }}
      >
        {title}
      </Text>
      <View style={{ height: 2, backgroundColor: DARK }} />
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
    <View style={{ flex, paddingHorizontal: 18, paddingVertical: 12 }}>
      <Text
        style={{
          fontSize: 7,
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

export function SubmittalPdfDocument({ data }: { data: SubmittalPdfViewModel }) {
  const statusStyle = statusBadgeStyle(data.status)
  const pTagStyle = priorityTagStyle(data.priority)
  const statusLabel =
    data.status.charAt(0).toUpperCase() + data.status.slice(1).toLowerCase()

  const pageWidth = 595.28
  const pageHeight = (() => {
    const base = 820
    const approvalRows = Math.max(0, data.approvalRows?.length ?? 0)
    const attachments = Math.max(0, data.attachments?.length ?? 0)
    const linked = Math.max(0, data.linkedDocuments?.length ?? 0)
    const questionLen = (data.questionIssue ?? '').trim().length
    const extra =
      approvalRows * 18 +
      attachments * 14 +
      linked * 14 +
      Math.min(360, Math.ceil(questionLen / 180) * 16)
    return Math.min(4200, Math.max(720, base + extra))
  })()

  return (
    <Document>
      <Page
        size={[pageWidth, pageHeight]}
        style={{ fontFamily: 'Helvetica', fontSize: 10, color: DARK, backgroundColor: '#ffffff' }}
      >
        {/* ── HEADER (logo + contact block) ── */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingTop: 22,
            paddingBottom: 12,
            paddingHorizontal: 26,
            borderBottomWidth: 2,
            borderBottomColor: DARK,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {data.logoDataUri ? (
              <Image src={data.logoDataUri} style={{ width: 54, height: 54 }} />
            ) : null}
            <View style={{ marginLeft: data.logoDataUri ? 10 : 0 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: data.themePrimary || '#1f3768',
                  letterSpacing: 0.6,
                }}
              >
                {(data.brand || 'BUILDSWIFT').toUpperCase()}
              </Text>
              {data.brandSub ? (
                <Text style={{ fontSize: 9, color: '#475569', letterSpacing: 1.4, marginTop: 1 }}>
                  {data.brandSub.toUpperCase()}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ alignItems: 'flex-end', maxWidth: 240 }}>
            {contactLines(data.contactAddress || '').map((line, idx) => (
              <Text key={`addr-${idx}`} style={{ fontSize: 8.6, color: '#334155' }}>
                {line}
              </Text>
            ))}
            {data.contactPhone ? (
              <Text style={{ fontSize: 8.6, color: '#334155', marginTop: 2 }}>{data.contactPhone}</Text>
            ) : null}
            {data.contactEmail ? (
              <Text style={{ fontSize: 8.6, color: '#334155' }}>{data.contactEmail}</Text>
            ) : null}
          </View>
        </View>

        {/* ── SUBMITTAL HEADLINE ── */}
        <View
          style={{
            backgroundColor: DARK,
            paddingHorizontal: 26,
            paddingVertical: 14,
          }}
        >
          <Text
            style={{
              fontSize: 19,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              color: '#ffffff',
              marginBottom: 6,
            }}
          >
            Submittal
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={{ fontSize: 15, fontWeight: 700, color: '#ffcc00' }}>
              {data.submittalNumber}
            </Text>
            <Text
              style={{
                ...statusStyle,
                fontSize: 7.5,
                fontWeight: 700,
                paddingHorizontal: 18,
                paddingVertical: 5,
                borderRadius: 20,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
              }}
            >
              {statusLabel}
            </Text>
          </View>
        </View>

        {/* ── PROJECT GRID ── */}
        <View style={{ borderBottomWidth: 2, borderBottomColor: DARK }}>
          {/* Row 1: Project / Project Address */}
          <View
            style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#c0c0c0' }}
          >
            <InfoCell label="Project">
              <Text style={{ fontSize: 9, fontWeight: 500, color: '#111111' }}>
                {data.projectName}
              </Text>
            </InfoCell>
            <InfoCell label="Project Address">
              <Text style={{ fontSize: 9, fontWeight: 500, color: '#111111' }}>
                {data.projectNo}
              </Text>
            </InfoCell>
          </View>
          {/* Row 2: Date / Due Date */}
          <View
            style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#c0c0c0' }}
          >
            <InfoCell label="Date">
              <Text style={{ fontSize: 9, fontWeight: 500, color: '#111111' }}>{data.date}</Text>
            </InfoCell>
            <InfoCell label="Due Date">
              <Text style={{ fontSize: 9, fontWeight: 500, color: '#111111' }}>
                {data.actionNeededBy}
              </Text>
            </InfoCell>
          </View>
          {/* Row 3: Submitted By / Priority */}
          <View
            style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#c0c0c0' }}
          >
            <InfoCell label="Submitted By">
              <Text style={{ fontSize: 9, fontWeight: 500, color: '#111111' }}>
                {data.submittedBy}
              </Text>
            </InfoCell>
            <InfoCell label="Priority">
              {pTagStyle ? (
                <Text
                  style={{
                    ...pTagStyle,
                    fontSize: 7,
                    fontWeight: 700,
                    paddingHorizontal: 14,
                    paddingVertical: 2,
                    borderRadius: 3,
                    textTransform: 'uppercase',
                    alignSelf: 'flex-start',
                  }}
                >
                  {data.priority}
                </Text>
              ) : (
                <Text style={{ fontSize: 9, fontWeight: 500, color: '#111111' }}>
                  {data.priority}
                </Text>
              )}
            </InfoCell>
          </View>
        </View>

        {/* ── SPEC SECTION ── */}
        {data.specSection && data.specSection !== '—' ? (
          <View
            style={{
              paddingHorizontal: 26,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: SECTION_BORDER,
            }}
          >
            <SectionTitle title="Spec Section" />
            <Text style={{ fontSize: 9.2, lineHeight: 1.5 }}>{data.specSection}</Text>
          </View>
        ) : null}

        {/* ── SUBMITTAL ── */}
        {data.submittalTitle && data.submittalTitle !== '—' ? (
          <View
            style={{
              paddingHorizontal: 26,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: SECTION_BORDER,
            }}
          >
            <SectionTitle title="Submittal" />
            <Text style={{ fontSize: 9.2, lineHeight: 1.5, fontWeight: 700 }}>{data.submittalTitle}</Text>
          </View>
        ) : null}

        {/* ── MANUFACTURER ── */}
        {data.manufacturer && data.manufacturer !== '—' ? (
          <View
            style={{
              paddingHorizontal: 26,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: SECTION_BORDER,
            }}
          >
            <SectionTitle title="Manufacturer" />
            <Text style={{ fontSize: 9.2, lineHeight: 1.5 }}>{data.manufacturer}</Text>
          </View>
        ) : null}

        {/* ── QUESTION / ISSUE ── */}
        {data.questionIssue && data.questionIssue !== '—' ? (
          <View
            style={{
              paddingHorizontal: 26,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: SECTION_BORDER,
            }}
          >
            <SectionTitle title="Question / Issue" />
            <Text style={{ fontSize: 9.2, lineHeight: 1.5 }}>{data.questionIssue}</Text>
          </View>
        ) : null}

        {/* ── ATTACHMENTS ── */}
        {data.attachments.length > 0 ? (
          <View
            style={{
              paddingHorizontal: 26,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: SECTION_BORDER,
            }}
          >
            <SectionTitle title="Attachments" />
            {data.attachments.map((a, i) => (
              <Text key={`att-${i}`} style={{ fontSize: 9, marginBottom: 4 }}>
                {'\u2022 '}{a}
              </Text>
            ))}
          </View>
        ) : null}

        {/* ── LINKED DOCUMENTS ── */}
        {data.linkedDocuments.length > 0 ? (
          <View
            style={{
              paddingHorizontal: 26,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: SECTION_BORDER,
            }}
          >
            <SectionTitle title="Linked Documents" />
            {data.linkedDocuments.map((doc, i) => (
              <View
                key={`ld-${i}`}
                style={{
                  backgroundColor: '#f0f4ff',
                  borderLeftWidth: 3,
                  borderLeftColor: DARK,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginTop: i > 0 ? 6 : 0,
                }}
              >
                <Text style={{ fontSize: 9 }}>
                  <Text style={{ fontWeight: 700 }}>{doc.id}</Text>
                  {doc.title ? ` \u2014 ${doc.title}` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── APPROVAL LOG ── */}
        {data.approvalRows.length > 0 ? (
          <View
            wrap={false}
            style={{
              paddingHorizontal: 26,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: SECTION_BORDER,
            }}
          >
            <SectionTitle title="Approval Log" />
            {/* Table header */}
            <View style={{ flexDirection: 'row', backgroundColor: DARK }}>
              {(['Role', 'Signature', 'Date', 'Notes'] as const).map((h, i) => (
                <Text
                  key={h}
                  style={{
                    width:
                      i === 0 ? '22%' : i === 1 ? '36%' : i === 2 ? '18%' : '24%',
                    fontSize: 6.8,
                    fontWeight: 700,
                    color: '#ffffff',
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                >
                  {h}
                </Text>
              ))}
            </View>
            {/* Rows */}
            {data.approvalRows.map((row, idx) => {
              const sig = sigStyle(row.signature)
              return (
                <View
                  key={`ar-${idx}`}
                  style={{
                    flexDirection: 'row',
                    borderBottomWidth: idx === data.approvalRows.length - 1 ? 2 : 1,
                    borderBottomColor:
                      idx === data.approvalRows.length - 1 ? DARK : '#cccccc',
                    backgroundColor: '#ffffff',
                    minHeight: 28,
                  }}
                >
                  <Text
                    style={{
                      width: '22%',
                      fontSize: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                    }}
                  >
                    {row.role}
                  </Text>
                  <View style={{ width: '36%', paddingHorizontal: 10, paddingVertical: 8 }}>
                    {row.signatureUrl ? (
                      <Image
                        src={row.signatureUrl}
                        style={{ width: 74, height: 16, objectFit: 'contain' }}
                      />
                    ) : row.signatureName ? (
                      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Oblique', color: '#444444' }}>
                        {row.signatureName}
                      </Text>
                    ) : (
                      <Text
                        style={{
                          fontSize: 8,
                          fontWeight: 600,
                          color: sig.color,
                          textTransform: row.signature !== 'pending' ? 'uppercase' : 'none',
                        }}
                      >
                        {sig.text}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      width: '18%',
                      fontSize: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                    }}
                  >
                    {row.date}
                  </Text>
                  <Text
                    style={{
                      width: '24%',
                      fontSize: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                    }}
                  >
                    {row.notes}
                  </Text>
                </View>
              )
            })}
          </View>
        ) : null}

        {/* ── FOOTER ── */}
        <View
          style={{
            textAlign: 'center',
            paddingHorizontal: 26,
            paddingVertical: 10,
            backgroundColor: '#f9f9f9',
            borderTopWidth: 1,
            borderTopColor: SECTION_BORDER,
          }}
        >
          <Text style={{ fontSize: 6.8, color: '#888888' }}>{data.footerNote}</Text>
        </View>
      </Page>
    </Document>
  )
}
