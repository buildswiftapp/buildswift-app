import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'

export type ReviewPdfViewModel = {
  docType: string
  brand: string
  brandSub: string
  logoDataUri: string
  /** Theme colors (defaults match legacy BuildSwift PDF). */
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
  /** RFI only: long-form contract date when metadata provides it. */
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
  if (!key || key === '—' || key === '-') {
    return null
  }
  if (key === 'high' || key === 'urgent') {
    return { backgroundColor: '#c9413b', color: '#ffffff' }
  }
  if (key === 'medium') {
    return { backgroundColor: '#f59e0b', color: '#111827' }
  }
  if (key === 'low' || key === 'normal') {
    return { backgroundColor: '#e2e8f0', color: '#334155' }
  }
  return { backgroundColor: '#1f3768', color: '#ffffff' }
}

function contactLines(address: string) {
  return address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const styles = StyleSheet.create({
  page: { paddingTop: 18, paddingBottom: 18, paddingHorizontal: 18, fontSize: 10, color: '#0f172a' },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  topLeft: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 38, height: 38 },
  brandBlock: { marginLeft: 10 },
  brand: { fontSize: 18, fontWeight: 800, color: '#1f3768' },
  brandSub: { fontSize: 10, color: '#334155', marginTop: 1, letterSpacing: 0.8 },
  contactBlock: { maxWidth: 220, textAlign: 'right', fontSize: 8, color: '#64748b', lineHeight: 1.4 },

  reviewBar: {
    marginTop: 2,
    backgroundColor: '#1f3768',
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewTitle: { color: '#ffffff', fontSize: 17, fontWeight: 800 },
  rightBadgeWrap: { alignItems: 'flex-end' },
  numberBadge: {
    backgroundColor: '#d58a2f',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 800,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  statusPill: {
    marginTop: 3,
    backgroundColor: '#f0ddb8',
    color: '#7b5a2a',
    fontSize: 9,
    fontWeight: 700,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  accent: { height: 3, backgroundColor: '#c37a29', marginBottom: 10 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  metaLeft: { fontSize: 9 },
  metaRight: { fontSize: 9 },

  labelRow: { flexDirection: 'row', marginBottom: 4 },
  label: { width: 24, fontSize: 9 },
  value: { fontSize: 11, fontWeight: 700 },

  sectionTitle: { marginTop: 6, marginBottom: 6, fontSize: 10, fontWeight: 700 },
  factLine: { fontSize: 9, marginBottom: 1 },
  infoGrid: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#d7dbe4',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 12,
  },
  infoRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e5ec' },
  infoCell: { width: '50%', paddingVertical: 9, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: '#e2e5ec' },
  infoCellLast: { borderRightWidth: 0 },
  infoLabel: { fontSize: 9, fontWeight: 700, color: '#1f3768' },
  infoValue: { fontSize: 11, marginTop: 2, lineHeight: 1.3 },
  priorityBadge: {
    fontSize: 10,
    fontWeight: 700,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 10,
  },

  card: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#d9dce5',
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#f8f8fb',
  },
  cardHeader: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f3f4f8',
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderLabel: { fontSize: 11, fontWeight: 700, color: '#1f3768' },
  cardHeaderValue: { fontSize: 12, marginLeft: 10, color: '#111827' },
  questionCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#d9dce5',
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#fcfcfe',
  },
  questionHeader: {
    backgroundColor: '#f5f0df',
    borderBottomWidth: 1,
    borderBottomColor: '#e5dcc4',
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIcon: { fontSize: 10, color: '#b7791f', marginRight: 6 },
  questionHeaderText: { fontSize: 11, fontWeight: 700, color: '#1f3768' },
  questionBody: { paddingHorizontal: 12, paddingVertical: 11, fontSize: 11, lineHeight: 1.45 },
  sectionHeaderLine: { marginTop: 11, flexDirection: 'row', alignItems: 'center' },
  sectionHeaderText: { fontSize: 11, fontWeight: 800, color: '#1f3768' },
  sectionHeaderAccent: { height: 1, flexGrow: 1, marginLeft: 5, backgroundColor: '#e2a65c' },
  listCard: {
    borderWidth: 1,
    borderColor: '#d9dce5',
    borderRadius: 5,
    backgroundColor: '#f8f8fc',
    marginTop: 5,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  listItem: { fontSize: 10, marginBottom: 5, lineHeight: 1.35 },
  table: { marginTop: 5, borderWidth: 1, borderColor: '#d7dbe4', borderRadius: 5, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1f3768', paddingVertical: 6, paddingHorizontal: 8 },
  tableHeaderCell: { color: '#ffffff', fontSize: 9, fontWeight: 800 },
  tableRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e2e5ec', paddingVertical: 6, paddingHorizontal: 8 },
  tableCell: { fontSize: 9 },
  signatureCell: { justifyContent: 'center' },
  signatureImage: { width: 64, height: 18, objectFit: 'contain' },
  signatureNameText: { fontSize: 8, color: '#0f172a' },
  sigApproved: {
    color: '#0f766e',
    backgroundColor: '#d1fae5',
    fontSize: 8,
    fontWeight: 700,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  sigPending: {
    color: '#a16207',
    backgroundColor: '#fef3c7',
    fontSize: 8,
    fontWeight: 700,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  sigRejected: {
    color: '#991b1b',
    backgroundColor: '#fee2e2',
    fontSize: 8,
    fontWeight: 700,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },

  impactCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e8c48a',
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#fffbf3',
  },
  impactHeader: {
    backgroundColor: '#fdf3e0',
    borderBottomWidth: 1,
    borderBottomColor: '#e8d4b8',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  impactHeaderText: { fontSize: 11, fontWeight: 800, color: '#92400e' },
  impactRow: { paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3e8d4' },
  impactRowLast: { borderBottomWidth: 0 },
  impactRowLabel: { fontSize: 9, fontWeight: 700, color: '#1f3768', marginBottom: 2 },
  impactRowValue: { fontSize: 10, lineHeight: 1.38 },

  footerRoles: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerRoleItem: { fontSize: 8, color: '#334155', marginHorizontal: 8, marginBottom: 3 },

  footer: { marginTop: 10, textAlign: 'center', fontSize: 8, color: '#64748b' },
  debugFooter: { marginTop: 3, textAlign: 'center', fontSize: 6, color: '#94a3b8' },
})

function titleCardLabel(docType: string) {
  if (docType === 'rfi') return 'SUBJECT'
  if (docType === 'submittal') return 'SUBMITTAL'
  return 'CHANGE ORDER'
}

export function ReviewPdfDocument({ data }: { data: ReviewPdfViewModel }) {
  const isRfi = data.docType === 'rfi'
  const isSubmittal = data.docType === 'submittal'
  const isChangeOrder = data.docType === 'change_order'
  const documentNumberLabel = isChangeOrder
    ? 'Change Order No.'
    : isSubmittal
      ? 'Submittal No.'
      : 'RFI No.'
  const descriptionHeading = isChangeOrder
    ? 'DESCRIPTION OF CHANGE'
    : isSubmittal
      ? 'SUBMITTAL DESCRIPTION'
      : 'QUESTION / ISSUE'
  const reasonHeading = isChangeOrder ? 'REASON FOR CHANGE' : isSubmittal ? 'SPECIFICATION / COMPLIANCE' : 'CONTRACTOR\'S PROPOSED INTERPRETATION'

  const toBullets = (value: string) =>
    value
      .split('\n')
      .map((line) => line.replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean)

  const summaryCost =
    data.impactRows.find((row) => row.label.toLowerCase().includes('cost'))?.value?.trim() || '—'
  const summarySchedule =
    data.impactRows.find((row) => row.label.toLowerCase().includes('schedule'))?.value?.trim() || '—'
  const summaryScope =
    data.impactRows.find((row) => row.label.toLowerCase().includes('scope'))?.value?.trim() || ''
  const fallbackNarrative =
    data.contentSections.find((s) => s.label.toLowerCase().includes('question'))?.body ||
    data.contentSections[0]?.body ||
    data.questionIssue ||
    data.rawContent ||
    '—'
  const scopeBullets = toBullets(summaryScope || data.questionIssue)
  const assumptionBullets =
    (data.assumptions && data.assumptions.length
      ? data.assumptions
      : toBullets(
          data.contentSections.find((s) => s.label.toLowerCase().includes('assumption'))?.body ||
            "Work is based on current drawings.\nAny additional scope outside this description will be addressed separately."
        )) || []
  const costItems =
    data.costItems && data.costItems.length
      ? data.costItems
      : [{ item: 'Total Added Cost', amount: summaryCost }]
  const narrativeSections = data.contentSections.filter(
    (section) => section.body && section.body.trim() && section.body.trim() !== '—'
  )
  const dividerColor = '#e5ecf8'
  const contractorDisplayName = (data.contractorName || data.submittedBy || '').trim()
  const contractorDisplayRole = (data.contractorRole || '').trim()
  const contractorDisplayEmail = (data.contractorEmail || data.contactEmail || '').trim()
  const contractorDisplayPhone = (data.contractorPhone || data.contactPhone || '').trim()
  const architectDisplayName = (data.architectName || '').trim()
  const architectDisplayRole = (data.architectRole || '').trim()
  const architectDisplayEmail = (data.architectEmail || '').trim()
  const architectDisplayPhone = (data.architectPhone || '').trim()
  const BASE_SPACE = 8
  const approvalDisplayRows =
    data.approvalRows.length > 0
      ? data.approvalRows
      : isChangeOrder
        ? [
            {
              title: contractorDisplayName || 'Contractor Company',
              role: 'Contractor',
              signature: 'pending' as const,
              date: '____________',
              notes: '—',
            },
            {
              title: architectDisplayName || 'Architect/Engineer',
              role: 'Architect',
              signature: 'pending' as const,
              date: '____________',
              notes: '—',
            },
            {
              title: 'Owner',
              role: 'Owner',
              signature: 'pending' as const,
              date: '____________',
              notes: '—',
            },
          ]
        : [{ title: '—', role: '—', signature: 'pending' as const, date: '—', notes: '—' }]

  const Section = ({ children, marginTop = 0, marginBottom = BASE_SPACE * 1.25 }: { children: React.ReactNode; marginTop?: number; marginBottom?: number }) => (
    <View style={{ marginTop, marginBottom }}>{children}</View>
  )

  const SectionHeading = ({ title, marginTop = 0 }: { title: string; marginTop?: number }) => (
    <View style={{ marginTop, marginBottom: 5 }}>
      <Text style={{ fontSize: 13.2, fontWeight: 700, marginBottom: 2 }}>{title}</Text>
      <View style={{ height: 1, backgroundColor: '#e4e9f4' }} />
    </View>
  )

  return (
    <Document>
      <Page
        size="A4"
        style={{
          paddingTop: 30,
          paddingBottom: 34,
          paddingHorizontal: 34,
          fontSize: 10.2,
          color: '#0f172a',
          fontFamily: 'Helvetica',
        }}
      >
        <View style={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 2, marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {data.logoDataUri ? <Image src={data.logoDataUri} style={{ width: 66, height: 66 }} /> : null}
              <View style={{ marginLeft: 8, paddingTop: 4 }}>
                <Text
                  style={{
                    fontSize: 19.6,
                    fontWeight: 500,
                    color: '#243b6b',
                    letterSpacing: 0.1,
                  }}
                >
                  {data.brand || 'BuildSwift'}
                </Text>
                <View
                  style={{
                    marginTop: 1,
                    width: 116,
                    height: 0.9,
                    backgroundColor: '#3b5f97',
                  }}
                />
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', paddingTop: 14 }}>
              <Text style={{ fontSize: 13.5, fontWeight: 700 }}>{`${documentNumberLabel} ${data.reviewNumber}`}</Text>
              <Text style={{ marginTop: 4, fontSize: 11.5 }}>{data.reportDate}</Text>
            </View>
          </View>
        </View>
        <View style={{ height: 1.2, backgroundColor: '#2d5fa8', marginTop: 6, marginBottom: BASE_SPACE * 1.8 }} />

        <View style={{ marginBottom: 4, borderBottomWidth: 1, borderBottomColor: dividerColor, paddingTop: 1, paddingBottom: 7 }}>
          <Text style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 1 }}>
            PROJECT: <Text style={{ fontWeight: 500 }}>{data.project}</Text>
          </Text>
          <Text style={{ fontSize: 10.8, color: '#334155' }}>{data.contactAddress.split('\n')[0] || '—'}</Text>
        </View>
        {isChangeOrder ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9, borderBottomWidth: 1, borderBottomColor: dividerColor, paddingBottom: 5 }}>
            <View style={{ width: '49%' }}>
              <Text style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>CONTRACTOR:</Text>
              {contractorDisplayName ? <Text style={{ fontSize: 11 }}>{contractorDisplayName}</Text> : null}
              {contractorDisplayRole ? <Text style={{ fontSize: 11 }}>{contractorDisplayRole}</Text> : null}
              {contractorDisplayEmail ? <Text style={{ fontSize: 11, color: '#334155' }}>{contractorDisplayEmail}</Text> : null}
              {contractorDisplayPhone ? <Text style={{ fontSize: 11, color: '#334155' }}>{contractorDisplayPhone}</Text> : null}
            </View>
            <View style={{ width: '49%' }}>
              <Text style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>ARCHITECT/ENGINEER:</Text>
              {architectDisplayName ? <Text style={{ fontSize: 11 }}>{architectDisplayName}</Text> : null}
              {architectDisplayRole ? <Text style={{ fontSize: 11 }}>{architectDisplayRole}</Text> : null}
              {architectDisplayEmail ? <Text style={{ fontSize: 11, color: '#334155' }}>{architectDisplayEmail}</Text> : null}
              {architectDisplayPhone ? <Text style={{ fontSize: 11, color: '#334155' }}>{architectDisplayPhone}</Text> : null}
            </View>
          </View>
        ) : (
          <View style={{ width: '49%', marginBottom: 9, borderBottomWidth: 1, borderBottomColor: dividerColor, paddingBottom: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>CONTRACTOR:</Text>
            {contractorDisplayName ? <Text style={{ fontSize: 11 }}>{contractorDisplayName}</Text> : null}
            {contractorDisplayRole ? <Text style={{ fontSize: 11 }}>{contractorDisplayRole}</Text> : null}
            {contractorDisplayEmail ? <Text style={{ fontSize: 11, color: '#334155' }}>{contractorDisplayEmail}</Text> : null}
            {contractorDisplayPhone ? <Text style={{ fontSize: 11, color: '#334155' }}>{contractorDisplayPhone}</Text> : null}
          </View>
        )}

        <View
          style={{
            flexDirection: 'row',
            borderWidth: 1,
            borderColor: '#c9d5e8',
            borderRadius: 2,
            overflow: 'hidden',
            marginTop: BASE_SPACE * 2,
            marginBottom: BASE_SPACE * 1.5,
          }}
        >
          <View style={{ width: 58, backgroundColor: '#2d5fa8', paddingVertical: 7, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>Title</Text>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 9 }}>
            <Text style={{ fontSize: 15.5, fontWeight: 500 }}>{data.title || '—'}</Text>
          </View>
        </View>

        {isChangeOrder ? (
          <Section marginBottom={BASE_SPACE * 1.3}>
            <SectionHeading title={descriptionHeading} />
            <Text style={{ fontSize: 11.3, lineHeight: 1.42, marginBottom: 10 }}>
              {fallbackNarrative}
            </Text>

            <SectionHeading title={reasonHeading} marginTop={BASE_SPACE * 1.6} />
            <Text style={{ fontSize: 11.3, lineHeight: 1.4, marginTop: BASE_SPACE * 0.5, marginBottom: BASE_SPACE * 1.6 }}>
              {data.contentSections.find((s) => s.label.toLowerCase().includes('reason'))?.body ||
                data.title ||
                '—'}
            </Text>
          </Section>
        ) : (
          <>
            {narrativeSections.length > 0 ? (
              narrativeSections.map((section, idx) => (
                <View key={`section-${idx}`} style={{ marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#edf2fb', paddingBottom: 5 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 3 }}>
                    {section.label}
                  </Text>
                  <Text style={{ fontSize: 10.8, lineHeight: 1.5, color: '#1e293b' }}>{section.body}</Text>
                </View>
              ))
            ) : (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{descriptionHeading}</Text>
                <Text style={{ fontSize: 11, lineHeight: 1.45 }}>{fallbackNarrative}</Text>
              </View>
            )}
            {isSubmittal && data.specSection && data.specSection !== '—' ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>SPECIFICATION / COMPLIANCE</Text>
                <Text style={{ fontSize: 11, lineHeight: 1.45 }}>{data.specSection}</Text>
              </View>
            ) : null}
          </>
        )}

        {isChangeOrder ? (
          <Section marginBottom={BASE_SPACE * 1.6}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: '48%' }}>
              <SectionHeading title="SCOPE OF WORK" />
              <View style={{ marginTop: BASE_SPACE * 0.5 }}>
              {scopeBullets.slice(0, 6).map((line, idx) => (
                <Text key={`scope-${idx}`} style={{ fontSize: 11.2, lineHeight: 1.42, marginBottom: 4 }}>
                  {`- ${line}`}
                </Text>
              ))}
              </View>
              <SectionHeading title="COST BREAKDOWN" marginTop={8} />
              <View style={{ marginTop: BASE_SPACE * 0.5, paddingVertical: 6 }}>
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
              <View style={{ borderWidth: 1, borderColor: '#b8c7de', marginTop: BASE_SPACE * 0.5, marginBottom: BASE_SPACE * 1.2 }}>
                <View style={{ flexDirection: 'row', backgroundColor: '#eef3fb', borderBottomWidth: 1, borderBottomColor: '#d5deec' }}>
                  <Text style={{ width: '42%', padding: 6, fontSize: 10, fontWeight: 700 }}>Item</Text>
                  <Text style={{ width: '29%', padding: 6, fontSize: 10, fontWeight: 700 }}>Amount</Text>
                  <Text style={{ width: '29%', padding: 6, fontSize: 10, fontWeight: 700 }}>Amount</Text>
                </View>
                {costItems.map((row, idx) => (
                  <View
                    key={`cost-${idx}`}
                    style={{
                      flexDirection: 'row',
                      borderBottomWidth: idx === costItems.length - 1 ? 0 : 1,
                      borderBottomColor: '#e5e7eb',
                    }}
                  >
                    <Text style={{ width: '42%', padding: 6, fontSize: 10 }}>{row.item}</Text>
                    <Text style={{ width: '29%', padding: 6, fontSize: 10 }}>
                      {row.amount}
                    </Text>
                    <Text style={{ width: '29%', padding: 6, fontSize: 10, fontWeight: idx === costItems.length - 1 ? 700 : 500 }}>
                      {row.amount}
                    </Text>
                  </View>
                ))}
              </View>
              <SectionHeading title="ASSUMPTIONS" marginTop={10} />
              <View style={{ marginTop: BASE_SPACE * 0.5 }}>
              {assumptionBullets.slice(0, 4).map((line, idx) => (
                <Text key={`assump-${idx}`} style={{ fontSize: 11.2, lineHeight: 1.4, marginBottom: 4 }}>
                  {`- ${line}`}
                </Text>
              ))}
              </View>
            </View>
          </View>
          </Section>
        ) : null}

        {!isChangeOrder && data.attachments.some((item) => item && item.trim() && item.trim() !== '—') ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 4 }}>ATTACHMENTS</Text>
            {data.attachments.map((item, idx) => (
              <Text key={`attachment-${idx}`} style={{ fontSize: 10.8, lineHeight: 1.45, color: '#1e293b' }}>
                {`- ${item}`}
              </Text>
            ))}
          </View>
        ) : null}

        {isChangeOrder ? (
          <Section marginBottom={BASE_SPACE * 1.2}>
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
          </Section>
        ) : null}

        <SectionHeading title="APPROVAL" marginTop={BASE_SPACE * 0.8} />
        <View style={{ borderWidth: 1, borderColor: '#d5deec', borderRadius: 2, overflow: 'hidden', marginBottom: BASE_SPACE * 1.2 }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#f1f6fd', borderBottomWidth: 1, borderBottomColor: '#d5deec' }}>
            <Text style={{ width: '33%', padding: 6, fontSize: 9.8, fontWeight: 700 }}>Company</Text>
            <Text style={{ width: '22%', padding: 6, fontSize: 9.8, fontWeight: 700 }}>Role</Text>
            <Text style={{ width: '25%', padding: 6, fontSize: 9.8, fontWeight: 700 }}>Signature</Text>
            <Text style={{ width: '20%', padding: 6, fontSize: 9.8, fontWeight: 700 }}>Date</Text>
          </View>
          {approvalDisplayRows.map((row, idx) => (
            <View key={`approval-${idx}`} style={{ flexDirection: 'row', minHeight: 28, borderBottomWidth: idx === approvalDisplayRows.length - 1 ? 0 : 1, borderBottomColor: '#eef2f7' }}>
              <Text style={{ width: '33%', paddingVertical: 6, paddingHorizontal: 6, fontSize: 10 }}>{row.title}</Text>
              <Text style={{ width: '22%', paddingVertical: 6, paddingHorizontal: 6, fontSize: 10 }}>{row.role}</Text>
              <View style={{ width: '25%', paddingVertical: 6, paddingHorizontal: 6 }}>
                {row.signatureUrl ? <Image src={row.signatureUrl} style={{ width: 68, height: 15, objectFit: 'contain' }} /> : <Text style={{ fontSize: 10 }}>{row.signature === 'approved' ? 'Approved' : row.signature === 'rejected' ? 'Rejected' : 'Pending'}</Text>}
              </View>
              <Text style={{ width: '20%', paddingVertical: 6, paddingHorizontal: 6, fontSize: 10 }}>{row.date}</Text>
            </View>
          ))}
        </View>
        <View
          fixed
          style={{
            position: 'absolute',
            left: 34,
            right: 34,
            bottom: 16,
            borderTopWidth: 1,
            borderTopColor: '#e4e9f4',
            paddingTop: 4,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontSize: 8.5, color: '#64748b' }}>{`Generated ${data.reportDate}`}</Text>
          <Text
            style={{ fontSize: 8.5, color: '#64748b' }}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
        <View style={{ height: BASE_SPACE * 2 }} />
      </Page>
    </Document>
  )

}

