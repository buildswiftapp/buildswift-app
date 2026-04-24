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
  page: { paddingTop: 22, paddingBottom: 20, paddingHorizontal: 22, fontSize: 10, color: '#0f172a' },
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
  logo: { width: 26, height: 26 },
  brandBlock: { marginLeft: 8 },
  brand: { fontSize: 18, fontWeight: 700, color: '#1f3768' },
  brandSub: { fontSize: 9, color: '#334155', marginTop: 1 },
  contactBlock: { maxWidth: 220, textAlign: 'right', fontSize: 8, color: '#64748b', lineHeight: 1.4 },

  reviewBar: {
    marginTop: 2,
    backgroundColor: '#1f3768',
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewTitle: { color: '#ffffff', fontSize: 15, fontWeight: 700 },
  rightBadgeWrap: { alignItems: 'flex-end' },
  numberBadge: {
    backgroundColor: '#d58a2f',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 700,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
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
  accent: { height: 2, backgroundColor: '#c37a29', marginBottom: 11 },

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
  infoCell: { width: '50%', paddingVertical: 8, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: '#e2e5ec' },
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
    backgroundColor: '#ffffff',
  },
  questionHeader: {
    backgroundColor: '#f5f0df',
    borderBottomWidth: 1,
    borderBottomColor: '#e5dcc4',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  questionHeaderText: { fontSize: 11, fontWeight: 700, color: '#1f3768' },
  questionBody: { paddingHorizontal: 12, paddingVertical: 11, fontSize: 11, lineHeight: 1.45 },
  sectionHeaderLine: { marginTop: 11, flexDirection: 'row', alignItems: 'center' },
  sectionHeaderText: { fontSize: 10, fontWeight: 700, color: '#1f3768' },
  sectionHeaderAccent: { height: 1, flexGrow: 1, marginLeft: 5, backgroundColor: '#e2a65c' },
  listCard: {
    borderWidth: 1,
    borderColor: '#d9dce5',
    borderRadius: 5,
    backgroundColor: '#fafafb',
    marginTop: 5,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  listItem: { fontSize: 10, marginBottom: 5, lineHeight: 1.35 },
  table: { marginTop: 5, borderWidth: 1, borderColor: '#d7dbe4', borderRadius: 5, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1f3768', paddingVertical: 6, paddingHorizontal: 8 },
  tableHeaderCell: { color: '#ffffff', fontSize: 9, fontWeight: 700 },
  tableRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e2e5ec', paddingVertical: 6, paddingHorizontal: 8 },
  tableCell: { fontSize: 9 },
  signatureCell: { width: '22%', justifyContent: 'center' },
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
  impactHeaderText: { fontSize: 11, fontWeight: 700, color: '#92400e' },
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
  footerRoleItem: { fontSize: 8, color: '#64748b', marginHorizontal: 8, marginBottom: 3 },

  footer: { marginTop: 10, textAlign: 'center', fontSize: 8, color: '#64748b' },
})

function titleCardLabel(docType: string) {
  if (docType === 'rfi') return 'SUBJECT'
  if (docType === 'submittal') return 'SUBMITTAL'
  return 'CHANGE ORDER'
}

export function ReviewPdfDocument({ data }: { data: ReviewPdfViewModel }) {
  const docNoLabel =
    data.docType === 'rfi' ? 'RFI No:' : data.docType === 'submittal' ? 'Submittal No:' : 'Document No:'
  const priorityColors = priorityBadgeStyle(data.priority)
  const showAttachments = data.attachments.some((s) => s.trim() && s.trim() !== '—')
  const showLinked = data.linkedDocuments.some((s) => s.trim() && s.trim() !== '—')
  const showApproval = data.approvalRows.length > 0
  const showNarrative = data.contentSections.length > 0
  const showImpact = data.impactRows.length > 0
  const primary = data.themePrimary
  const accent = data.themeAccent

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topHeader}>
          <View style={styles.topLeft}>
            {data.logoDataUri ? <Image src={data.logoDataUri} style={styles.logo} /> : null}
            <View style={styles.brandBlock}>
              {data.brand ? <Text style={[styles.brand, { color: primary }]}>{data.brand}</Text> : null}
              {data.brandSub ? <Text style={styles.brandSub}>{data.brandSub}</Text> : null}
            </View>
          </View>
          <View style={styles.contactBlock}>
            {contactLines(data.contactAddress).map((line, i) => (
              <Text key={`addr-${i}`}>{line}</Text>
            ))}
            <Text>{data.contactPhone}</Text>
            <Text>{data.contactEmail}</Text>
          </View>
        </View>

        <View style={[styles.reviewBar, { backgroundColor: primary }]}>
          <Text style={styles.reviewTitle}>{data.reviewTitle}</Text>
          <View style={styles.rightBadgeWrap}>
            <Text style={[styles.numberBadge, { backgroundColor: data.badgeBackground }]}>{data.reviewNumber}</Text>
            <Text style={styles.statusPill}>{data.reviewStatus}</Text>
          </View>
        </View>
        <View style={[styles.accent, { backgroundColor: accent }]} />

        <View style={styles.metaRow}>
          <Text style={styles.metaLeft}>{data.docTypeLine}</Text>
          <Text style={styles.metaRight}>{data.generatedAt}</Text>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoRow}>
            <View style={styles.infoCell}>
              <Text style={[styles.infoLabel, { color: primary }]}>Project:</Text>
              <Text style={styles.infoValue}>{data.project}</Text>
            </View>
            <View style={[styles.infoCell, styles.infoCellLast]}>
              <Text style={[styles.infoLabel, { color: primary }]}>Project No:</Text>
              <Text style={styles.infoValue}>{data.projectNo}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoCell}>
              <Text style={[styles.infoLabel, { color: primary }]}>Date:</Text>
              <Text style={styles.infoValue}>{data.reportDate}</Text>
            </View>
            <View style={[styles.infoCell, styles.infoCellLast]}>
              <Text style={[styles.infoLabel, { color: primary }]}>Action Needed By:</Text>
              <Text style={styles.infoValue}>{data.actionNeededBy}</Text>
            </View>
          </View>
          {data.docType === 'rfi' && data.contractDateDisplay ? (
            <View style={styles.infoRow}>
              <View style={{ width: '100%', paddingVertical: 6, paddingHorizontal: 8 }}>
                <Text style={[styles.infoLabel, { color: primary }]}>Contract Date:</Text>
                <Text style={styles.infoValue}>{data.contractDateDisplay}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <View style={styles.infoCell}>
              <Text style={[styles.infoLabel, { color: primary }]}>{docNoLabel}</Text>
              <Text style={styles.infoValue}>{data.rfiNo}</Text>
            </View>
            <View style={[styles.infoCell, styles.infoCellLast]}>
              <Text style={[styles.infoLabel, { color: primary }]}>Priority:</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                {priorityColors ? (
                  <Text style={[styles.priorityBadge, { backgroundColor: priorityColors.backgroundColor, color: priorityColors.color }]}>
                    {data.priority}
                  </Text>
                ) : (
                  <Text style={styles.infoValue}>{data.priority}</Text>
                )}
              </View>
            </View>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.infoCell}>
              <Text style={[styles.infoLabel, { color: primary }]}>Submitted By:</Text>
              <Text style={styles.infoValue}>{data.submittedBy}</Text>
            </View>
            <View style={[styles.infoCell, styles.infoCellLast]}>
              <Text style={[styles.infoLabel, { color: primary }]}>Spec Section:</Text>
              <Text style={styles.infoValue}>{data.specSection}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardHeaderLabel, { color: primary }]}>{titleCardLabel(data.docType)}</Text>
            <Text style={styles.cardHeaderValue}>{data.submittalTitle}</Text>
          </View>
        </View>

        {showNarrative ? (
          data.contentSections.map((sec, idx) => (
            <View key={`${sec.label}-${idx}`} style={styles.questionCard}>
              <View style={styles.questionHeader}>
                <Text style={[styles.questionHeaderText, { color: primary }]}>{sec.label}</Text>
              </View>
              <Text style={styles.questionBody}>{sec.body}</Text>
            </View>
          ))
        ) : (
          <View style={styles.questionCard}>
            <View style={styles.questionHeader}>
              <Text style={[styles.questionHeaderText, { color: primary }]}>QUESTION / ISSUE</Text>
            </View>
            <Text style={styles.questionBody}>{data.questionIssue}</Text>
          </View>
        )}

        {showImpact ? (
          <View style={styles.impactCard}>
            <View style={styles.impactHeader}>
              <Text style={styles.impactHeaderText}>IMPACT</Text>
            </View>
            {data.impactRows.map((row, idx) => (
              <View
                key={`${row.label}-${idx}`}
                style={
                  idx === data.impactRows.length - 1
                    ? [styles.impactRow, styles.impactRowLast]
                    : styles.impactRow
                }
              >
                <Text style={[styles.impactRowLabel, { color: primary }]}>{row.label}</Text>
                <Text style={styles.impactRowValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {showAttachments ? (
          <>
            <View style={styles.sectionHeaderLine}>
                <Text style={[styles.sectionHeaderText, { color: primary }]}>ATTACHMENTS</Text>
              <View style={[styles.sectionHeaderAccent, { backgroundColor: accent }]} />
            </View>
            <View style={styles.listCard}>
              {data.attachments.map((item, idx) => (
                <Text key={`${item}-${idx}`} style={styles.listItem}>
                  {item}
                </Text>
              ))}
            </View>
          </>
        ) : null}

        {showLinked ? (
          <>
            <View style={styles.sectionHeaderLine}>
              <Text style={[styles.sectionHeaderText, { color: primary }]}>LINKED DOCUMENTS</Text>
              <View style={[styles.sectionHeaderAccent, { backgroundColor: accent }]} />
            </View>
            <View style={styles.listCard}>
              {data.linkedDocuments.map((item, idx) => (
                <Text key={`${item}-${idx}`} style={styles.listItem}>
                  {item}
                </Text>
              ))}
            </View>
          </>
        ) : null}

        {showApproval ? (
          <>
            <View style={styles.sectionHeaderLine}>
              <Text style={[styles.sectionHeaderText, { color: primary }]}>APPROVAL LOG</Text>
              <View style={[styles.sectionHeaderAccent, { backgroundColor: accent }]} />
            </View>
            <View style={styles.table}>
              <View style={[styles.tableHeader, { backgroundColor: primary }]}>
                <Text style={[styles.tableHeaderCell, { width: '28%' }]}>Title</Text>
                <Text style={[styles.tableHeaderCell, { width: '22%' }]}>Role</Text>
                <Text style={[styles.tableHeaderCell, { width: '22%' }]}>Signature</Text>
                <Text style={[styles.tableHeaderCell, { width: '28%' }]}>Date</Text>
              </View>
              {data.approvalRows.map((row, idx) => (
                <View key={`${row.title}-${idx}`} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { width: '28%' }]}>{row.title}</Text>
                  <Text style={[styles.tableCell, { width: '22%' }]}>{row.role}</Text>
                  <View style={styles.signatureCell}>
                    {row.signatureUrl ? (
                      <Image src={row.signatureUrl} style={styles.signatureImage} />
                    ) : row.signatureName ? (
                      <Text style={styles.signatureNameText}>{row.signatureName}</Text>
                    ) : row.signature === 'rejected' ? (
                      <Text style={styles.signatureNameText}> </Text>
                    ) : (
                      <Text
                        style={
                          row.signature === 'approved'
                            ? styles.sigApproved
                            : styles.sigPending
                        }
                      >
                        {row.signature === 'approved' ? 'Approved' : 'Pending'}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.tableCell, { width: '28%' }]}>{row.date}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.footerRoles}>
          <Text style={styles.footerRoleItem}>☑ Owner</Text>
          <Text style={styles.footerRoleItem}>☑ Structural Engineer</Text>
          <Text style={styles.footerRoleItem}>☑ Architect</Text>
          <Text style={styles.footerRoleItem}>☑ Contractor</Text>
        </View>
        <Text style={styles.footer}>{data.footerLine}</Text>
      </Page>
    </Document>
  )
}

