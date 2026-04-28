import {
  Document,
  Image,
  Page,
  Text,
  View,
} from '@react-pdf/renderer'

export type ReviewPdfViewModel = {
  docType: string
  brand: string
  brandSub: string
  logoDataUri: string
  themePrimary: string
  themeAccent: string
  badgeBackground: string
  footerLine: string
  debugInfo?: string
  reviewTitle: string
  reviewNumber: string
  reviewStatus: string
  docTypeLine: string
  generatedAt: string
  contactAddress: string
  contactPhone: string
  contactEmail: string
  title: string
  project: string
  projectNo: string
  rfiNo: string
  reportDate: string
  actionNeededBy: string
  contractDateDisplay: string
  submittedBy: string
  specSection: string
  priority: string
  submittalTitle: string
  questionIssue: string
  contentSections: Array<{ label: string; body: string }>
  impactRows: Array<{ label: string; value: string }>
  attachments: string[]
  linkedDocuments: string[]
  costItems?: Array<{ item: string; amount: string }>
  assumptions?: string[]
  contractorName?: string
  contractorRole?: string
  contractorPhone?: string
  contractorEmail?: string
  architectName?: string
  architectRole?: string
  architectPhone?: string
  architectEmail?: string
  scheduleExtension?: string
  newCompletionDate?: string
  approvalRows: Array<{
    title: string
    role: string
    signature: 'approved' | 'pending' | 'rejected'
    signatureName?: string | null
    signatureUrl?: string | null
    date: string
    notes: string
  }>
  facts: Array<{ label: string; value: string }>
  sections: Array<{ heading: string; body: string }>
  rawContent: string
}

function priorityBadgeStyle(priority: string) {
  const key = priority.trim().toLowerCase()
  if (!key || key === '—' || key === '-') return null
  if (key === 'high' || key === 'urgent') return { backgroundColor: '#c9413b', color: '#ffffff' }
  if (key === 'medium') return { backgroundColor: '#f59e0b', color: '#111827' }
  if (key === 'low' || key === 'normal') return { backgroundColor: '#e2e8f0', color: '#334155' }
  return { backgroundColor: '#1f3768', color: '#ffffff' }
}

function contactLines(address: string) {
  return address.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function sectionCardStyle(label: string) {
  const l = label.toLowerCase()
  if (l.includes('reason') || l.includes('question') || l.includes('issue')) {
    return { headerBg: '#f5f0df', headerBorder: '#e5dcc4', titleColor: '#1f3768', iconColor: '#b7791f', icon: '●' }
  }
  if (l.includes('contractor') || l.includes('interpretation')) {
    return { headerBg: '#eef0f8', headerBorder: '#d8ddf0', titleColor: '#1f3768', iconColor: '#3b5fa8', icon: '■' }
  }
  return { headerBg: '#f3f4f8', headerBorder: '#e5e7eb', titleColor: '#1f3768', iconColor: '#64748b', icon: '▸' }
}

export function ReviewPdfDocument({ data }: { data: ReviewPdfViewModel }) {
  const isRfi = data.docType === 'rfi'
  const isSubmittal = data.docType === 'submittal'
  const isChangeOrder = data.docType === 'change_order'

  const reviewBarLabel = isChangeOrder
    ? 'CHANGE ORDER'
    : isSubmittal
      ? 'PRODUCT SUBMITTAL'
      : 'REQUEST FOR INFORMATION (RFI)'

  const toBullets = (value: string) =>
    value.split('\n').map((line) => line.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)

  const summaryCost = data.impactRows.find((r) => r.label.toLowerCase().includes('cost'))?.value?.trim() || '—'
  const summarySchedule = data.impactRows.find((r) => r.label.toLowerCase().includes('schedule'))?.value?.trim() || '—'
  const summaryScope = data.impactRows.find((r) => r.label.toLowerCase().includes('scope'))?.value?.trim() || ''

  const fallbackNarrative =
    data.contentSections.find((s) => s.label.toLowerCase().includes('question'))?.body ||
    data.contentSections[0]?.body ||
    data.questionIssue ||
    data.rawContent ||
    '—'

  const scopeBullets = toBullets(summaryScope || data.questionIssue)
  const assumptionBullets =
    data.assumptions && data.assumptions.length
      ? data.assumptions
      : toBullets(
          "Work is based on current drawings and owner direction.\nNo unforeseen structural modifications are included.\nAny additional scope outside this description will be addressed separately."
        )
  const costItems =
    data.costItems && data.costItems.length
      ? data.costItems
      : [{ item: 'Total Added Cost', amount: summaryCost }]

  const narrativeSections = data.contentSections.filter(
    (s) => s.body && s.body.trim() && s.body.trim() !== '—'
  )

  const contractorDisplayName = (data.contractorName || data.submittedBy || '').trim()
  const contractorDisplayRole = (data.contractorRole || '').trim()
  const contractorDisplayEmail = (data.contractorEmail || data.contactEmail || '').trim()
  const contractorDisplayPhone = (data.contractorPhone || data.contactPhone || '').trim()
  const architectDisplayName = (data.architectName || '').trim()
  const architectDisplayRole = (data.architectRole || '').trim()
  const architectDisplayEmail = (data.architectEmail || '').trim()
  const architectDisplayPhone = (data.architectPhone || '').trim()

  const approvalDisplayRows =
    data.approvalRows.length > 0
      ? data.approvalRows
      : isChangeOrder
        ? [
            { title: contractorDisplayName || 'Contractor Company', role: 'Contractor', signature: 'pending' as const, date: '____________', notes: '—' },
            { title: architectDisplayName || 'Architect/Engineer', role: 'Architect', signature: 'pending' as const, date: '____________', notes: '—' },
            { title: 'Owner', role: 'Owner', signature: 'pending' as const, date: '____________', notes: '—' },
          ]
        : [{ title: '—', role: '—', signature: 'pending' as const, date: '—', notes: '—' }]

  const statusPillStyle =
    data.reviewStatus === 'APPROVED'
      ? { backgroundColor: '#d1fae5', color: '#065f46' }
      : data.reviewStatus === 'REJECTED'
        ? { backgroundColor: '#fee2e2', color: '#991b1b' }
        : { backgroundColor: '#f0ddb8', color: '#7b5a2a' }

  const priorityBadge = priorityBadgeStyle(data.priority || '')

  const BASE = 8

  const pageWidth = 595.28
  const pageHeight = (() => {
    const base = 900
    const approvals = Math.max(0, approvalDisplayRows.length)
    const impacts = Math.max(0, data.impactRows?.length ?? 0)
    const attachments = Math.max(0, data.attachments?.filter((a) => a && a.trim() && a.trim() !== '—').length ?? 0)
    const linked = Math.max(0, data.linkedDocuments?.length ?? 0)
    const costItemsCount = Math.max(0, data.costItems?.length ?? 0)
    const assumptionsCount = Math.max(0, data.assumptions?.length ?? 0)
    const narrativeLen = (fallbackNarrative ?? '').trim().length
    const extra =
      approvals * 18 +
      impacts * 16 +
      attachments * 14 +
      linked * 14 +
      costItemsCount * 16 +
      assumptionsCount * 12 +
      Math.min(520, Math.ceil(narrativeLen / 180) * 16)
    return Math.min(5200, Math.max(820, base + extra))
  })()

  const SectionHeading = ({ title, marginTop = 0 }: { title: string; marginTop?: number }) => (
    <View style={{ marginTop, marginBottom: 5 }}>
      <Text style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{title}</Text>
      <View style={{ height: 1, backgroundColor: '#e4e9f4' }} />
    </View>
  )

  return (
    <Document>
      <Page
        size={[pageWidth, pageHeight]}
        style={{
          paddingTop: 26,
          paddingBottom: 38,
          paddingHorizontal: 28,
          fontSize: 10,
          color: '#0f172a',
          fontFamily: 'Helvetica',
        }}
      >

        {/* ── TOP HEADER ── */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          {/* Left: logo + brand */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {data.logoDataUri ? (
              <Image src={data.logoDataUri} style={{ width: 48, height: 48 }} />
            ) : null}
            <View style={{ marginLeft: data.logoDataUri ? 9 : 0 }}>
              <Text style={{ fontSize: 18, fontWeight: 800, color: data.themePrimary, letterSpacing: 0.5 }}>
                {(data.brand || 'BUILDSWIFT').toUpperCase()}
              </Text>
              {data.brandSub ? (
                <Text style={{ fontSize: 9, color: '#475569', letterSpacing: 1.4, marginTop: 1 }}>
                  {data.brandSub.toUpperCase()}
                </Text>
              ) : null}
              <View style={{ height: 1.2, backgroundColor: data.themePrimary, marginTop: data.brandSub ? 3 : 4, width: '100%' }} />
            </View>
          </View>
          {/* Right: contact block */}
          <View style={{ alignItems: 'flex-end' }}>
            {contactLines(data.contactAddress).map((line, i) => (
              <Text key={`cl-${i}`} style={{ fontSize: 8.5, color: '#475569', lineHeight: 1.4 }}>{line}</Text>
            ))}
            {data.contactPhone ? (
              <Text style={{ fontSize: 8.5, color: '#475569', lineHeight: 1.4 }}>{data.contactPhone}</Text>
            ) : null}
            {data.contactEmail ? (
              <Text style={{ fontSize: 8.5, color: '#2563eb', lineHeight: 1.4 }}>{data.contactEmail}</Text>
            ) : null}
          </View>
        </View>

        {/* ── REVIEW BAR ── */}
        <View
          style={{
            backgroundColor: data.themePrimary,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 10,
            paddingHorizontal: 14,
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: 800 }}>{reviewBarLabel}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ backgroundColor: data.badgeBackground, paddingVertical: 4, paddingHorizontal: 11, borderRadius: 13 }}>
              <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: 800 }}>{data.reviewNumber}</Text>
            </View>
            <View style={[{ marginTop: 3, paddingVertical: 2, paddingHorizontal: 9, borderRadius: 9 }, statusPillStyle]}>
              <Text style={{ fontSize: 8.5, fontWeight: 700 }}>{`* ${data.reviewStatus}`}</Text>
            </View>
          </View>
        </View>

        {/* ── ACCENT LINE ── */}
        <View style={{ height: 3, backgroundColor: data.themeAccent, marginBottom: 12 }} />

        {/* ── META GRID (RFI / SUBMITTAL) ── */}
        {!isChangeOrder ? (
          <View style={{ borderWidth: 1, borderColor: '#d7dbe4', marginBottom: 12 }}>
            {/* Row 1: Project | Project No | Date */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#d7dbe4' }}>
              <View style={{ flex: 5, paddingVertical: 5, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: '#d7dbe4' }}>
                <Text style={{ fontSize: 9.5 }}>
                  <Text style={{ fontWeight: 700 }}>{'Project:  '}</Text>
                  <Text>{data.project}</Text>
                </Text>
              </View>
              <View style={{ flex: 3, paddingVertical: 5, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: '#d7dbe4' }}>
                <Text style={{ fontSize: 9.5 }}>
                  <Text style={{ fontWeight: 700 }}>{'Project No:  '}</Text>
                  <Text>{data.projectNo}</Text>
                </Text>
              </View>
              <View style={{ flex: 2, paddingVertical: 5, paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 9.5, textAlign: 'right' }}>{data.reportDate}</Text>
              </View>
            </View>
            {/* Row 2: RFI/Submittal No | Contract Date */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#d7dbe4' }}>
              <View style={{ flex: 1, paddingVertical: 5, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: '#d7dbe4' }}>
                <Text style={{ fontSize: 9.5 }}>
                  <Text style={{ fontWeight: 700 }}>{isSubmittal ? 'Submittal No:  ' : 'RFI No:  '}</Text>
                  <Text>{data.rfiNo}</Text>
                </Text>
              </View>
              <View style={{ flex: 1, paddingVertical: 5, paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 9.5 }}>
                  <Text style={{ fontWeight: 700 }}>{'Contract Date:  '}</Text>
                  <Text>{data.contractDateDisplay || '—'}</Text>
                </Text>
              </View>
            </View>
            {/* Row 3: Submitted By | Priority */}
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 3, paddingVertical: 5, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: '#d7dbe4' }}>
                <Text style={{ fontSize: 9.5 }}>
                  <Text style={{ fontWeight: 700 }}>{'Submitted By:  '}</Text>
                  <Text>{data.submittedBy}</Text>
                </Text>
              </View>
              <View style={{ flex: 2, paddingVertical: 5, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 9.5, fontWeight: 700 }}>{'Priority:  '}</Text>
                {priorityBadge ? (
                  <View style={{ backgroundColor: priorityBadge.backgroundColor, paddingVertical: 1, paddingHorizontal: 7, borderRadius: 9, marginLeft: 2 }}>
                    <Text style={{ fontSize: 8.5, fontWeight: 700, color: priorityBadge.color }}>{data.priority}</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 9.5 }}>{data.priority}</Text>
                )}
              </View>
            </View>
          </View>
        ) : null}

        {/* ── CHANGE ORDER: Project, Parties, Title Bar ── */}
        {isChangeOrder ? (
          <>
            <View style={{ marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#e5ecf8', paddingBottom: 7 }}>
              <Text style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 1 }}>
                {'PROJECT: '}
                <Text style={{ fontWeight: 500 }}>{data.project}</Text>
              </Text>
              <Text style={{ fontSize: 10.8, color: '#334155' }}>{data.contactAddress.split('\n')[0] || '—'}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9, borderBottomWidth: 1, borderBottomColor: '#e5ecf8', paddingBottom: 5 }}>
              <View style={{ width: '49%' }}>
                <Text style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>CONTRACTOR:</Text>
                {contractorDisplayName ? <Text style={{ fontSize: 11 }}>{contractorDisplayName}</Text> : null}
                {contractorDisplayRole ? <Text style={{ fontSize: 11 }}>{contractorDisplayRole}</Text> : null}
                {contractorDisplayPhone ? <Text style={{ fontSize: 11, color: '#334155' }}>{contractorDisplayPhone}</Text> : null}
                {contractorDisplayEmail ? <Text style={{ fontSize: 11, color: '#334155' }}>{contractorDisplayEmail}</Text> : null}
              </View>
              <View style={{ width: '49%' }}>
                <Text style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>ARCHITECT/ENGINEER:</Text>
                {architectDisplayName ? <Text style={{ fontSize: 11 }}>{architectDisplayName}</Text> : null}
                {architectDisplayRole ? <Text style={{ fontSize: 11 }}>{architectDisplayRole}</Text> : null}
                {architectDisplayPhone ? <Text style={{ fontSize: 11, color: '#334155' }}>{architectDisplayPhone}</Text> : null}
                {architectDisplayEmail ? <Text style={{ fontSize: 11, color: '#334155' }}>{architectDisplayEmail}</Text> : null}
              </View>
            </View>
            {/* Title Bar */}
            <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: '#c9d5e8', borderRadius: 2, overflow: 'hidden', marginTop: BASE * 2, marginBottom: BASE * 1.5 }}>
              <View style={{ width: 58, backgroundColor: '#2d5fa8', paddingVertical: 7, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>Title</Text>
              </View>
              <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 9 }}>
                <Text style={{ fontSize: 15.5, fontWeight: 500 }}>{data.title || '—'}</Text>
              </View>
            </View>
          </>
        ) : null}

        {/* ── CHANGE ORDER: narrative sections ── */}
        {isChangeOrder ? (
          <>
            <View style={{ marginBottom: BASE * 1.3 }}>
              <SectionHeading title="DESCRIPTION OF CHANGE" />
              <Text style={{ fontSize: 11.3, lineHeight: 1.42, marginBottom: 10 }}>{fallbackNarrative}</Text>
              <SectionHeading title="REASON FOR CHANGE" marginTop={BASE * 1.6} />
              <Text style={{ fontSize: 11.3, lineHeight: 1.4, marginTop: BASE * 0.5, marginBottom: BASE * 1.6 }}>
                {data.contentSections.find((s) => s.label.toLowerCase().includes('reason'))?.body || data.title || '—'}
              </Text>
            </View>

            {/* Scope + Cost columns */}
            <View style={{ marginBottom: BASE * 1.6 }}>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: '48%', marginRight: 12 }}>
                  <SectionHeading title="SCOPE OF WORK" />
                  <View style={{ marginTop: BASE * 0.5 }}>
                    {scopeBullets.slice(0, 6).map((line, idx) => (
                      <Text key={`scope-${idx}`} style={{ fontSize: 11.2, lineHeight: 1.42, marginBottom: 4 }}>{`- ${line}`}</Text>
                    ))}
                  </View>
                  <SectionHeading title="COST BREAKDOWN" marginTop={8} />
                  <View style={{ marginTop: BASE * 0.5, paddingVertical: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ fontSize: 11.3, fontWeight: 700 }}>Time Extension:</Text>
                      <Text style={{ marginLeft: 6, fontSize: 11 }}>{data.scheduleExtension || summarySchedule}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11.3, fontWeight: 700 }}>New Completion Date:</Text>
                      <Text style={{ marginLeft: 6, fontSize: 11 }}>{data.newCompletionDate || data.actionNeededBy || '—'}</Text>
                    </View>
                  </View>
                </View>
                <View style={{ width: '52%' }}>
                  <SectionHeading title="COST BREAKDOWN" />
                  <View style={{ borderWidth: 1, borderColor: '#b8c7de', marginTop: BASE * 0.5, marginBottom: BASE * 1.2 }}>
                    <View style={{ flexDirection: 'row', backgroundColor: '#eef3fb', borderBottomWidth: 1, borderBottomColor: '#d5deec' }}>
                      <Text style={{ width: '42%', padding: 6, fontSize: 10, fontWeight: 700 }}>Item</Text>
                      <Text style={{ width: '29%', padding: 6, fontSize: 10, fontWeight: 700 }}>Amount</Text>
                      <Text style={{ width: '29%', padding: 6, fontSize: 10, fontWeight: 700 }}>Amount</Text>
                    </View>
                    {costItems.map((row, idx) => (
                      <View key={`cost-${idx}`} style={{ flexDirection: 'row', borderBottomWidth: idx === costItems.length - 1 ? 0 : 1, borderBottomColor: '#e5e7eb' }}>
                        <Text style={{ width: '42%', padding: 6, fontSize: 10 }}>{row.item}</Text>
                        <Text style={{ width: '29%', padding: 6, fontSize: 10 }}>{row.amount}</Text>
                        <Text style={{ width: '29%', padding: 6, fontSize: 10, fontWeight: idx === costItems.length - 1 ? 700 : 500 }}>{row.amount}</Text>
                      </View>
                    ))}
                  </View>
                  <SectionHeading title="ASSUMPTIONS" marginTop={10} />
                  <View style={{ marginTop: BASE * 0.5 }}>
                    {assumptionBullets.slice(0, 4).map((line, idx) => (
                      <Text key={`assump-${idx}`} style={{ fontSize: 11.2, lineHeight: 1.4, marginBottom: 4 }}>{`- ${line}`}</Text>
                    ))}
                  </View>
                </View>
              </View>
            </View>

            {/* Schedule Impact */}
            <View style={{ marginBottom: BASE * 1.2 }}>
              <SectionHeading title="SCHEDULE IMPACT" />
              <View style={{ borderWidth: 1, borderColor: '#d5deec', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#eef3fb', paddingVertical: 6, paddingHorizontal: 8 }}>
                  <Text style={{ width: '45%', fontSize: 10.4, fontWeight: 700 }}>Time Extension:</Text>
                  <Text style={{ width: '55%', fontSize: 10.4 }}>{data.scheduleExtension || summarySchedule}</Text>
                </View>
                <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8 }}>
                  <Text style={{ width: '45%', fontSize: 10.4, fontWeight: 700 }}>New Completion Date:</Text>
                  <Text style={{ width: '55%', fontSize: 10.4 }}>{data.newCompletionDate || data.actionNeededBy || '—'}</Text>
                </View>
              </View>
            </View>
          </>
        ) : null}

        {/* ── RFI / SUBMITTAL: icon+card sections ── */}
        {!isChangeOrder ? (
          <>
            {narrativeSections.length > 0 ? (
              narrativeSections.map((section, idx) => {
                const cs = sectionCardStyle(section.label)
                return (
                  <View key={`section-${idx}`} style={{ marginTop: 8, borderWidth: 1, borderColor: '#d9dce5', borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: cs.headerBg, borderBottomWidth: 1, borderBottomColor: cs.headerBorder, paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: cs.iconColor, marginRight: 6 }}>{cs.icon}</Text>
                      <Text style={{ fontSize: 10.5, fontWeight: 700, color: cs.titleColor }}>{section.label}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fcfcfe' }}>
                      <Text style={{ fontSize: 10.5, lineHeight: 1.45, color: '#1e293b' }}>{section.body}</Text>
                    </View>
                  </View>
                )
              })
            ) : (
              <View style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>
                  {isSubmittal ? 'SUBMITTAL DESCRIPTION' : 'QUESTION / ISSUE'}
                </Text>
                <Text style={{ fontSize: 11, lineHeight: 1.45 }}>{fallbackNarrative}</Text>
              </View>
            )}

            {/* IMPACT card */}
            {data.impactRows.length > 0 ? (
              <View style={{ marginTop: 8, borderWidth: 1, borderColor: '#e8c48a', borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ backgroundColor: '#fdf3e0', borderBottomWidth: 1, borderBottomColor: '#e8d4b8', paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: '#92400e', marginRight: 6 }}>▲</Text>
                  <Text style={{ fontSize: 10.5, fontWeight: 700, color: '#92400e' }}>IMPACT</Text>
                </View>
                {data.impactRows.map((row, idx) => (
                  <View
                    key={`impact-${idx}`}
                    style={{
                      flexDirection: 'row',
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderBottomWidth: idx < data.impactRows.length - 1 ? 1 : 0,
                      borderBottomColor: '#f3e8d4',
                      backgroundColor: '#fffbf3',
                    }}
                  >
                    <Text style={{ fontSize: 9.5, fontWeight: 700, color: '#1f3768', width: 95 }}>{`${row.label}:`}</Text>
                    <Text style={{ fontSize: 9.5, flex: 1 }}>{row.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {/* ── ATTACHMENTS card ── */}
        {data.attachments.some((a) => a && a.trim() && a.trim() !== '—') ? (
          <View style={{ marginTop: 8, borderWidth: 1, borderColor: '#c8e6d8', borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ backgroundColor: '#f0f7f4', borderBottomWidth: 1, borderBottomColor: '#c8e6d8', paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#065f46', marginRight: 6 }}>{'>'}</Text>
              <Text style={{ fontSize: 10.5, fontWeight: 700, color: '#065f46' }}>ATTACHMENTS:</Text>
            </View>
            <View style={{ paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fcfffe' }}>
              {data.attachments
                .filter((a) => a && a.trim() && a.trim() !== '—')
                .map((item, idx) => (
                  <Text key={`att-${idx}`} style={{ fontSize: 10.2, marginBottom: 3, color: '#1e293b' }}>{`- ${item}`}</Text>
                ))}
            </View>
          </View>
        ) : null}

        {/* ── APPROVAL LOG ── */}
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
            <Text style={{ fontSize: 10, color: '#1f3768', marginRight: 5, fontWeight: 700 }}>■</Text>
            <Text style={{ fontSize: 11.5, fontWeight: 800 }}>
              {isChangeOrder ? 'APPROVAL' : 'APPROVAL LOG:'}
            </Text>
            <View style={{ height: 1, flex: 1, backgroundColor: '#d7dbe4', marginLeft: 6 }} />
          </View>
          <View style={{ borderWidth: 1, borderColor: '#d7dbe4', borderRadius: 4, overflow: 'hidden' }}>
            {/* Header row */}
            <View style={{ flexDirection: 'row', backgroundColor: '#eef3fb', borderBottomWidth: 1, borderBottomColor: '#c8d5ec' }}>
              {(['Role', 'Signature', 'Date', 'Notes'] as const).map((h, i) => (
                <Text
                  key={`th-${i}`}
                  style={{
                    width: i === 0 ? '22%' : i === 1 ? '36%' : i === 2 ? '18%' : '24%',
                    paddingVertical: 5,
                    paddingHorizontal: 6,
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#1f3768',
                  }}
                >
                  {h}
                </Text>
              ))}
            </View>
            {/* Data rows */}
            {approvalDisplayRows.map((row, idx) => (
              <View
                key={`arow-${idx}`}
                style={{
                  flexDirection: 'row',
                  minHeight: 26,
                  borderBottomWidth: idx < approvalDisplayRows.length - 1 ? 1 : 0,
                  borderBottomColor: '#e8eef7',
                }}
              >
                <Text style={{ width: '22%', paddingVertical: 5, paddingHorizontal: 6, fontSize: 9.5 }}>{row.role}</Text>
                <View style={{ width: '36%', paddingVertical: 5, paddingHorizontal: 6 }}>
                  {row.signatureUrl ? (
                    <Image src={row.signatureUrl} style={{ width: 68, height: 15, objectFit: 'contain' }} />
                  ) : row.signatureName ? (
                    <Text style={{ fontSize: 9.5, color: '#0f172a' }}>{row.signatureName}</Text>
                  ) : (
                    <View style={{ width: 60, height: 0.7, backgroundColor: '#94a3b8', marginTop: 9 }} />
                  )}
                </View>
                <Text style={{ width: '18%', paddingVertical: 5, paddingHorizontal: 6, fontSize: 9, color: '#2563eb' }}>{row.date}</Text>
                <Text style={{ width: '24%', paddingVertical: 5, paddingHorizontal: 6, fontSize: 9 }}>{row.notes}</Text>
              </View>
            ))}
          </View>

          {/* Roles bar */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 7, marginBottom: 4 }}>
            {approvalDisplayRows.map((row, idx) => (
              <View key={`role-${idx}`} style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, marginVertical: 2 }}>
                <View style={{ width: 12, height: 12, backgroundColor: '#1f3768', borderRadius: 2, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
                  <Text style={{ fontSize: 8, color: '#ffffff', fontWeight: 700 }}>✓</Text>
                </View>
                <Text style={{ fontSize: 8.5, color: '#334155' }}>{row.role}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Debug info */}
        {data.debugInfo ? (
          <Text style={{ marginTop: 3, textAlign: 'center', fontSize: 6, color: '#94a3b8' }}>{data.debugInfo}</Text>
        ) : null}

        {/* Spacer above footer */}
        <View style={{ height: BASE * 2 }} />

        {/* ── FIXED FOOTER ── */}
        <View
          fixed
          style={{
            position: 'absolute',
            left: 28,
            right: 28,
            bottom: 14,
            borderTopWidth: 1,
            borderTopColor: '#e4e9f4',
            paddingTop: 4,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontSize: 8, color: '#64748b' }}>{data.footerLine}</Text>
          <Text
            style={{ fontSize: 8, color: '#64748b' }}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
