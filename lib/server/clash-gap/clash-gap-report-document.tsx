import { Document, Page, Text, View } from '@react-pdf/renderer'

export type ClashGapReportIssue = {
  type: string
  title: string
  description: string
  severity: string
  sheetReference: string
  suggestedAction: string
  location: string
}

export type ClashGapReportViewModel = {
  projectName: string
  projectAddress: string
  jobNumber: string
  generatedAt: string
  companyName: string
  summary: { total: number; clash: number; gap: number; mismatch: number }
  issues: ClashGapReportIssue[]
  attachments: string[]
}

export function ClashGapReportDocument({ data }: { data: ClashGapReportViewModel }) {
  return (
    <Document>
      <Page size="LETTER" style={{ padding: 40, fontSize: 10, fontFamily: 'Helvetica' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>
          Clash &amp; Gap Detection Report
        </Text>
        <Text style={{ marginBottom: 4 }}>{data.companyName}</Text>
        <Text style={{ marginBottom: 2 }}>Project: {data.projectName}</Text>
        {data.projectAddress ? <Text style={{ marginBottom: 2 }}>Address: {data.projectAddress}</Text> : null}
        {data.jobNumber ? <Text style={{ marginBottom: 2 }}>Job #: {data.jobNumber}</Text> : null}
        <Text style={{ marginBottom: 12 }}>Generated: {data.generatedAt}</Text>

        <View style={{ marginBottom: 16, padding: 8, backgroundColor: '#f1f5f9' }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Summary</Text>
          <Text>Total issues: {data.summary.total}</Text>
          <Text>Clashes: {data.summary.clash}</Text>
          <Text>Gaps: {data.summary.gap}</Text>
          <Text>Spec mismatches: {data.summary.mismatch}</Text>
        </View>

        {data.issues.map((issue, idx) => (
          <View key={idx} wrap={false} style={{ marginBottom: 12, borderBottomWidth: 1, borderColor: '#e2e8f0', paddingBottom: 8 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 11 }}>
              {idx + 1}. [{issue.type}] {issue.title}
            </Text>
            <Text>Severity: {issue.severity} | Sheet: {issue.sheetReference}</Text>
            {issue.location ? <Text>Location: {issue.location}</Text> : null}
            <Text style={{ marginTop: 4 }}>{issue.description}</Text>
            {issue.suggestedAction ? (
              <Text style={{ marginTop: 4, fontStyle: 'italic' }}>
                Suggested action: {issue.suggestedAction}
              </Text>
            ) : null}
          </View>
        ))}

        {data.attachments.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Attachments</Text>
            {data.attachments.map((name, i) => (
              <Text key={i}>- {name}</Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  )
}
