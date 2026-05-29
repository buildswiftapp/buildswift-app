import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'

export type TextPdfSection = { heading?: string; body: string }

export type TextPdfParams = {
  title: string
  subtitle?: string
  sections: TextPdfSection[]
}

export function TextPdfDocument({ title, subtitle, sections }: TextPdfParams) {
  return (
    <Document>
      <Page size="LETTER" style={{ padding: 40, fontSize: 9, fontFamily: 'Courier', lineHeight: 1.35 }}>
        <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: subtitle ? 2 : 12 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica', color: '#475569', marginBottom: 12 }}>
            {subtitle}
          </Text>
        ) : null}
        {sections.map((section, i) => (
          <View key={i} style={{ marginBottom: 14 }}>
            {section.heading ? (
              <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>
                {section.heading}
              </Text>
            ) : null}
            <Text>{section.body.trim() || '(no text recognized on this page)'}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}

export async function renderTextPdf(params: TextPdfParams): Promise<Buffer> {
  return (await renderToBuffer(<TextPdfDocument {...params} />)) as Buffer
}
