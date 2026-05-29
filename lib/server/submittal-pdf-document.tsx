import React from 'react'
import {
  Circle,
  Document,
  Image,
  Page,
  Path,
  Rect,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer'
import { stripHtmlToPlainParagraphs } from '@/lib/document-html'

export type SubmittalAttachmentRow = {
  fileName: string
  fileType: string
  notes: string
}

export type SubmittalApprovalRow = {
  name: string
  role: string
  action: string
  date: string
  notes: string
  signatureName?: string | null
  signatureUrl?: string | null
}

export type SubmittalPdfViewModel = {
  logoDataUri: string
  brand: string
  brandSub: string
  themePrimary: string
  contactAddress: string
  contactPhone: string
  contactEmail: string

  projectName: string
  projectAddress: string
  submittalNumber: string
  status: string
  dateIssued: string
  requiredReviewDate: string
  to: string
  from: string

  submittalTitle: string
  submittalType: string
  priority: string

  detailedDescription: string
  manufacturerVendor: string
  materialProductName: string
  modelNumber: string
  quantity: string

  specificationSections: string
  drawingSheetNumbers: string
  detailReferences: string
  relatedRfiNumbers: string

  attachments: SubmittalAttachmentRow[]

  reviewerComments: string
  reviewedBy: string
  reviewDate: string
  reviewerSignatureUrl: string
  reviewerSignatureName: string | null

  footerNote: string
}

const BRAND_NAVY = '#002162'
const BORDER = '#e8edf2'
const CARD_BORDER = '#c8d8e8'
const CARD_BG = '#ffffff'
const HEADER_BG = BRAND_NAVY
const TITLE_BLUE = BRAND_NAVY
const PAGE_FRAME = BRAND_NAVY
const TEXT_DARK = '#1f2937'
const MUTED = '#5b6471'
const ORANGE_ACCENT = '#f97316'
const ICON_TILE_BG = '#eaf2fb'
const ICON_NAVY = BRAND_NAVY
const PDF_RED = '#dc2626'
const GREEN_LABEL = '#2d6a4f'
const GREEN_TILE_BG = '#e6f1ec'
const DETAIL_TILE_BG = '#eef0fb'

const PAGE_WIDTH_PT = 8 * 72 
const PAGE_HEIGHT_PT = 13 * 72 
const BASE_FONT = 7.85
const LABEL_FONT = 6.5
const VALUE_FONT = 7.85
const BODY_LINE_HEIGHT = 1.24
const SECTION_GAP = 6
const PAGE_MARGIN_PT = 11
const FRAME_INNER_PADDING = 10
const MAX_DESCRIPTION_CHARS = 820
const MAX_REVIEWER_COMMENTS_CHARS = 280
const MAX_FIELD_CELL_CHARS = 68
const MAX_SUMMARY_TITLE_CHARS = 72
const MAX_ATTACHMENTS_ROWS = 5
const META_PARTY_MAX_LINES = 2

function statusPillLabel(raw: string) {
  const s = (raw || '').toUpperCase()
  if (s.includes('APPROVED AS NOTED')) return 'APPROVED AS NOTED'
  if (s.includes('PENDING')) return 'PENDING REVIEW'
  if (s.includes('APPROVED')) return 'APPROVED'
  if (s.includes('REVISE')) return 'REVISE & RESUBMIT'
  if (s.includes('REJECT')) return 'REJECTED'
  if (s.includes('CLOSED')) return 'CLOSED'
  return s || 'PENDING REVIEW'
}

function statusBadgeStyle(status: string): { backgroundColor: string; color: string } {
  const s = (status || '').toUpperCase()
  if (s.includes('CLOSED')) return { backgroundColor: '#dc2626', color: '#ffffff' }
  if (s.includes('APPROVED') && !s.includes('NOTED')) return { backgroundColor: '#16a34a', color: '#ffffff' }
  if (s.includes('APPROVED AS NOTED') || (s.includes('APPROVED') && s.includes('NOTED')))
    return { backgroundColor: '#16a34a', color: '#ffffff' }
  if (s.includes('REJECT')) return { backgroundColor: '#dc2626', color: '#ffffff' }
  if (s.includes('REVISE')) return { backgroundColor: '#e65100', color: '#ffffff' }
  return { backgroundColor: '#f59e0b', color: '#111827' }
}

function priorityStyle(raw: string) {
  const p = (raw || '').toLowerCase()
  if (p.includes('high') || p.includes('urgent')) return { color: '#dc2626' }
  if (p.includes('low')) return { color: '#16a34a' }
  return { color: TEXT_DARK }
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
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length >= 2) return [parts[0], parts.slice(1).join(', ')]
  const m = raw.match(/^(.*?)(\s+(?:USA|United States|US)\b.*)$/i)
  if (m && m[1] && m[2]) return [m[1].trim(), m[2].trim()]
  return [raw]
}

function clampText(value: string, maxChars: number) {
  const t = (value || '').trim()
  if (t.length <= maxChars) return t
  return t.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…'
}

type StrokeIconProps = {
  size?: number
  color?: string
  strokeWidth?: number
  paths: string[]
  viewBox?: string
}

function StrokeIcon({
  size = 10,
  color = ICON_NAVY,
  strokeWidth = 2,
  paths,
  viewBox = '0 0 24 24',
}: StrokeIconProps) {
  return (
    <Svg viewBox={viewBox} width={size} height={size}>
      {paths.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  )
}

const IconBuilding = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z',
      'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2',
      'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2',
      'M10 6h4',
      'M10 10h4',
      'M10 14h4',
      'M10 18h4',
    ]}
  />
)

const IconMapPin = ({ size = 10, color = ICON_NAVY }: { size?: number; color?: string }) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Path
      d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z"
      fill={color}
    />
    <Circle cx={12} cy={10} r={2.6} fill="#ffffff" />
  </Svg>
)

const IconPhone = ({ size = 10, color = ICON_NAVY }: { size?: number; color?: string }) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Path
      d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z"
      fill={color}
    />
  </Svg>
)

const IconMail = ({ size = 10, color = ICON_NAVY }: { size?: number; color?: string }) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Rect x={2} y={4} width={20} height={16} rx={2} ry={2} fill={color} />
    <Path
      d="M3 7l9 5.7a2 2 0 0 0 2 0L21 7"
      stroke="#ffffff"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
)

const IconFileText = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z',
      'M14 2v4a2 2 0 0 0 2 2h4',
      'M10 9H8',
      'M16 13H8',
      'M16 17H8',
    ]}
  />
)

const IconLayers = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z',
      'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12',
      'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
    ]}
  />
)

const IconBarChart = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M3 3v16a2 2 0 0 0 2 2h16',
      'M8 17V13',
      'M12 17V9',
      'M16 17V5',
    ]}
  />
)

const IconFactory = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z',
      'M17 18h1',
      'M12 18h1',
      'M7 18h1',
    ]}
  />
)

const IconBox = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
      'M3.3 7 12 12l8.7-5',
      'M12 22V12',
    ]}
  />
)

const IconTag = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
      'M7 7h.01',
    ]}
  />
)

const IconClipboardList = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
      'M8 2h8a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2z',
      'M12 11h4',
      'M12 16h4',
      'M8 11h.01',
      'M8 16h.01',
    ]}
  />
)

const IconFileSpreadsheet = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z',
      'M14 2v4a2 2 0 0 0 2 2h4',
      'M8 13h2',
      'M14 13h2',
      'M8 17h2',
      'M14 17h2',
    ]}
  />
)

const IconTarget = ({ size = 10, color = ICON_NAVY }: { size?: number; color?: string }) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} fill="none" />
    <Circle cx={12} cy={12} r={6} stroke={color} strokeWidth={2} fill="none" />
    <Circle cx={12} cy={12} r={2} stroke={color} strokeWidth={2} fill="none" />
  </Svg>
)

const IconHelpCircle = ({ size = 10, color = ICON_NAVY }: { size?: number; color?: string }) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} fill="none" />
    <Path
      d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M12 17h.01"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
)

const IconPaperclip = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.57 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48',
    ]}
  />
)

const IconImage = ({ size = 10, color = ICON_NAVY }: { size?: number; color?: string }) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Rect x={3} y={3} width={18} height={18} rx={2} ry={2} stroke={color} strokeWidth={2} fill="none" />
    <Circle cx={9} cy={9} r={2} stroke={color} strokeWidth={2} fill="none" />
    <Path
      d="M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
)

const IconChat = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    ]}
  />
)

const IconPdf = ({ size = 10 }: { size?: number }) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Path
      d="M5 3a2 2 0 0 1 2-2h7l5 5v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"
      fill="#fee2e2"
      stroke={PDF_RED}
      strokeWidth={2}
      strokeLinejoin="round"
    />
    <Path d="M14 1v6h5" stroke={PDF_RED} strokeWidth={2} strokeLinejoin="round" fill="none" />
    <Rect x={6} y={13} width={12} height={6} rx={1} fill={PDF_RED} />
  </Svg>
)

const IconAvatarTile = ({
  size = 22,
  color = HEADER_BG,
}: {
  size?: number
  color?: string
}) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Rect x={0} y={0} width={24} height={24} rx={5} ry={5} fill={color} />
    <Circle cx={12} cy={9.5} r={3.6} fill="#ffffff" />
    <Path d="M4.5 20.5c1.5-3.5 4.5-5 7.5-5s6 1.5 7.5 5z" fill="#ffffff" />
  </Svg>
)

function IconTile({
  children,
  size = 18,
  bg = ICON_TILE_BG,
}: {
  children: React.ReactNode
  size?: number
  bg?: string
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  )
}

function CircleTile({
  children,
  size = 26,
  bg = ICON_TILE_BG,
}: {
  children: React.ReactNode
  size?: number
  bg?: string
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  )
}

function Section({
  icon,
  title,
  children,
  bodyPadding = 9,
}: {
  icon?: React.ReactNode
  title: string
  children: React.ReactNode
  bodyPadding?: number
}) {
  return (
    <View
      style={{
        marginBottom: SECTION_GAP,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 8,
        backgroundColor: CARD_BG,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderBottomWidth: 1,
          borderBottomColor: BORDER,
          backgroundColor: '#fbfcfe',
        }}
      >
        {icon ? <View style={{ marginRight: 6 }}>{icon}</View> : null}
        <Text
          style={{
            fontSize: LABEL_FONT + 1.5,
            fontWeight: 800,
            color: TITLE_BLUE,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {title}
        </Text>
      </View>
      <View style={{ padding: bodyPadding }}>{children}</View>
    </View>
  )
}

function Label({
  children,
  style,
  color = MUTED,
}: {
  children: React.ReactNode
  style?: any
  color?: string
}) {
  return (
    <Text
      style={{
        fontSize: LABEL_FONT,
        color,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        fontWeight: 800,
        ...(style ?? {}),
      }}
    >
      {children}
    </Text>
  )
}

function attachmentIcon(fileType: string): React.ReactNode {
  const t = (fileType || '').toLowerCase()
  if (t.includes('pdf')) return <IconPdf size={11} />
  if (
    t.includes('png') ||
    t.includes('jpg') ||
    t.includes('jpeg') ||
    t.includes('image') ||
    t.includes('gif') ||
    t.includes('webp')
  )
    return <IconImage size={11} color={TITLE_BLUE} />
  return <IconFileText size={11} color={MUTED} />
}

function DetailField({
  icon,
  label,
  value,
  borderRight,
  borderBottom,
}: {
  icon: React.ReactNode
  label: string
  value: string
  borderRight?: boolean
  borderBottom?: boolean
}) {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        paddingHorizontal: 9,
        paddingVertical: 8,
        borderRightWidth: borderRight ? 1 : 0,
        borderRightColor: BORDER,
        borderBottomWidth: borderBottom ? 1 : 0,
        borderBottomColor: BORDER,
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 5,
          backgroundColor: DETAIL_TILE_BG,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ marginLeft: 8, flex: 1 }}>
        <Label color={GREEN_LABEL} style={{ marginBottom: 2 }}>
          {label}
        </Label>
        <Text style={{ fontSize: VALUE_FONT, fontWeight: 800, color: TEXT_DARK, lineHeight: BODY_LINE_HEIGHT }}>
          {clampText(value, MAX_FIELD_CELL_CHARS)}
        </Text>
      </View>
    </View>
  )
}

export function SubmittalPdfDocument({ data }: { data: SubmittalPdfViewModel }) {
  const statusStyle = statusBadgeStyle(data.status)
  const statusLabel = statusPillLabel(data.status)
  const priorityUpper = (data.priority || '').toUpperCase()
  const pStyle = priorityStyle(data.priority)
  const senderLines = splitLines(data.from).length ? splitLines(data.from) : ['Not Provided']
  const recipientLines = splitLines(data.to).length ? splitLines(data.to) : ['Not Provided']
  const attachmentRows = data.attachments.slice(0, MAX_ATTACHMENTS_ROWS)
  const attachmentsTruncated = data.attachments.length > MAX_ATTACHMENTS_ROWS
  const hasAttachments = data.attachments.some((a) => {
    const name = (a?.fileName ?? '').trim()
    return Boolean(name) && name !== 'N/A' && name !== '—' && name !== 'Not Provided'
  })

  const descPlain = stripHtmlToPlainParagraphs(data.detailedDescription)

  const sigUrl = (data.reviewerSignatureUrl || '').trim()
  const sigName = (data.reviewerSignatureName || '').trim()

  return (
    <Document>
      <Page
        size={[PAGE_WIDTH_PT, PAGE_HEIGHT_PT]}
        wrap={false}
        style={{
          fontFamily: 'Helvetica',
          fontSize: BASE_FONT,
          color: TEXT_DARK,
          backgroundColor: '#ffffff',
          padding: PAGE_MARGIN_PT,
        }}
      >
        <View
          style={{
            borderWidth: 2,
            borderColor: PAGE_FRAME,
            borderRadius: 8,
            backgroundColor: '#ffffff',
            padding: FRAME_INNER_PADDING,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: SECTION_GAP + 2,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
              {data.logoDataUri ? (
                <Image
                  src={data.logoDataUri}
                  style={{ width: 50, height: 50, objectFit: 'contain' }}
                />
              ) : null}
              <View style={{ marginLeft: data.logoDataUri ? 10 : 0 }}>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: TITLE_BLUE,
                    letterSpacing: 0.5,
                    lineHeight: 1.05,
                  }}
                >
                  {(data.brand || 'BUILDSWIFT').toUpperCase()}
                </Text>
                <Text
                  style={{
                    fontSize: LABEL_FONT + 1.2,
                    color: MUTED,
                    letterSpacing: 4.6,
                    marginTop: 4,
                    fontWeight: 700,
                  }}
                >
                  {(data.brandSub || 'CONSTRUCTION').toUpperCase()}
                </Text>
              </View>
            </View>

            <View
              style={{
                width: 156,
                backgroundColor: HEADER_BG,
                borderRadius: 9,
                paddingVertical: 9,
                paddingHorizontal: 10,
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 54,
              }}
            >
              <Text
                style={{
                  color: '#ffffff',
                  fontSize: LABEL_FONT + 0.6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.7,
                  fontWeight: 700,
                  opacity: 0.9,
                }}
              >
                Submittal #
              </Text>
              <Text
                style={{
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: 18,
                  marginTop: 2,
                  letterSpacing: 0.6,
                }}
              >
                {data.submittalNumber}
              </Text>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              marginBottom: SECTION_GAP + 1,
              minHeight: 110,
            }}
          >
            <View
              style={{
                flex: 62,
                marginRight: 8,
                borderWidth: 1,
                borderColor: CARD_BORDER,
                borderRadius: 8,
                flexDirection: 'row',
                backgroundColor: CARD_BG,
              }}
            >
              <View style={{ flex: 32, padding: 9 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <IconMapPin size={10} color={TITLE_BLUE} />
                  <Text
                    style={{
                      fontSize: VALUE_FONT,
                      fontWeight: 800,
                      color: TEXT_DARK,
                      marginLeft: 5,
                    }}
                  >
                    {data.brand}
                  </Text>
                </View>
                {formatAddressLines(data.contactAddress).map((line, idx) => (
                  <Text
                    key={`caddr-${idx}`}
                    style={{
                      fontSize: BASE_FONT - 0.2,
                      color: TEXT_DARK,
                      lineHeight: BODY_LINE_HEIGHT,
                      marginLeft: 15,
                    }}
                  >
                    {line}
                  </Text>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
                  <IconPhone size={9} color={TITLE_BLUE} />
                  <Text
                    style={{
                      fontSize: BASE_FONT - 0.2,
                      color: TEXT_DARK,
                      marginLeft: 6,
                    }}
                  >
                    {data.contactPhone}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                  <IconMail size={9} color={TITLE_BLUE} />
                  <Text
                    style={{
                      fontSize: BASE_FONT - 0.2,
                      color: TEXT_DARK,
                      marginLeft: 6,
                    }}
                  >
                    {data.contactEmail}
                  </Text>
                </View>
              </View>

              <View style={{ width: 1, backgroundColor: BORDER }} />

              <View style={{ flex: 30, padding: 9, alignItems: 'flex-start' }}>
                <IconTile size={36}>
                  <IconBuilding size={22} color={TITLE_BLUE} />
                </IconTile>
                <Label style={{ marginTop: 7, marginBottom: 3 }}>Project</Label>
                <Text
                  style={{
                    fontSize: VALUE_FONT + 0.5,
                    fontWeight: 900,
                    color: TEXT_DARK,
                    marginBottom: 2,
                  }}
                >
                  {data.projectName}
                </Text>
                {formatAddressLines(data.projectAddress).map((line, idx) => (
                  <Text
                    key={`paddr-${idx}`}
                    style={{
                      fontSize: BASE_FONT - 0.2,
                      color: TEXT_DARK,
                      lineHeight: BODY_LINE_HEIGHT,
                    }}
                  >
                    {line}
                  </Text>
                ))}
              </View>
            </View>

            <View
              style={{
                flex: 38,
                borderWidth: 1,
                borderColor: CARD_BORDER,
                borderRadius: 8,
                backgroundColor: CARD_BG,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 9,
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: BORDER,
                }}
              >
                <Label>Status</Label>
                <Text
                  style={{
                    fontSize: BASE_FONT - 0.4,
                    fontWeight: 900,
                    paddingVertical: 2.5,
                    paddingHorizontal: 9,
                    borderRadius: 999,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                    ...(statusStyle as any),
                  }}
                >
                  {statusLabel}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 9,
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: BORDER,
                }}
              >
                <Label>Date Sent</Label>
                <Text style={{ fontSize: VALUE_FONT, fontWeight: 800, color: TEXT_DARK }}>
                  {data.dateIssued}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 9,
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: BORDER,
                }}
              >
                <Label>Required Review Date</Label>
                <Text style={{ fontSize: VALUE_FONT, fontWeight: 800, color: TEXT_DARK }}>
                  {data.requiredReviewDate}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 9,
                  paddingVertical: 6,
                }}
              >
                <Label>Priority</Label>
                <Text
                  style={{
                    fontSize: VALUE_FONT,
                    fontWeight: 900,
                    letterSpacing: 0.3,
                    ...(pStyle as any),
                  }}
                >
                  {priorityUpper || '—'}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: CARD_BORDER,
              borderRadius: 8,
              flexDirection: 'row',
              backgroundColor: CARD_BG,
              marginBottom: SECTION_GAP + 1,
            }}
          >
            <View style={{ flex: 1, padding: 9, flexDirection: 'row', alignItems: 'center' }}>
              <IconAvatarTile size={22} />
              <View style={{ marginLeft: 9, flex: 1 }}>
                <Label>Sent From</Label>
                {senderLines.slice(0, META_PARTY_MAX_LINES).map((line, idx) => (
                  <Text
                    key={`sf-${idx}`}
                    style={{
                      fontSize: VALUE_FONT,
                      color: TEXT_DARK,
                      fontWeight: idx === 0 ? 800 : 500,
                      lineHeight: BODY_LINE_HEIGHT,
                      marginTop: idx === 0 ? 2 : 0,
                    }}
                  >
                    {clampText(line, 62)}
                  </Text>
                ))}
              </View>
            </View>
            <View style={{ width: 1, backgroundColor: BORDER }} />
            <View style={{ flex: 1, padding: 9, flexDirection: 'row', alignItems: 'center' }}>
              <IconAvatarTile size={22} />
              <View style={{ marginLeft: 9, flex: 1 }}>
                <Label>Sent To</Label>
                {recipientLines.slice(0, META_PARTY_MAX_LINES).map((line, idx) => (
                  <Text
                    key={`st-${idx}`}
                    style={{
                      fontSize: VALUE_FONT,
                      color: TEXT_DARK,
                      fontWeight: idx === 0 ? 800 : 500,
                      lineHeight: BODY_LINE_HEIGHT,
                      marginTop: idx === 0 ? 2 : 0,
                    }}
                  >
                    {clampText(line, 62)}
                  </Text>
                ))}
              </View>
            </View>
          </View>

          <Section icon={<IconFileText size={11} color={TITLE_BLUE} />} title="Submittal Summary">
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingRight: 9, flexDirection: 'row' }}>
                <CircleTile size={26}>
                  <IconFileText size={13} color={TITLE_BLUE} />
                </CircleTile>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Label style={{ marginBottom: 3 }}>Submittal Title</Label>
                  <Text
                    style={{
                      fontSize: VALUE_FONT,
                      fontWeight: 800,
                      color: TEXT_DARK,
                      lineHeight: BODY_LINE_HEIGHT,
                    }}
                  >
                    {clampText(data.submittalTitle, MAX_SUMMARY_TITLE_CHARS)}
                  </Text>
                </View>
              </View>
              <View style={{ width: 1, backgroundColor: BORDER }} />
              <View style={{ flex: 1, paddingLeft: 9, flexDirection: 'row' }}>
                <CircleTile size={26}>
                  <IconLayers size={13} color={TITLE_BLUE} />
                </CircleTile>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Label style={{ marginBottom: 3 }}>Submittal Type</Label>
                  <Text
                    style={{
                      fontSize: VALUE_FONT,
                      fontWeight: 800,
                      color: TEXT_DARK,
                      lineHeight: BODY_LINE_HEIGHT,
                    }}
                  >
                    {data.submittalType}
                  </Text>
                </View>
              </View>
            </View>
          </Section>

          <Section icon={<IconClipboardList size={11} color={TITLE_BLUE} />} title="Submittal Details">
            <View
              style={{
                marginBottom: 8,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 7,
                paddingHorizontal: 10,
                paddingVertical: 8,
                backgroundColor: '#fbfcfe',
              }}
            >
              <Label color={GREEN_LABEL} style={{ marginBottom: 4 }}>
                Detailed Description
              </Label>
              <Text
                style={{
                  fontSize: BASE_FONT,
                  lineHeight: BODY_LINE_HEIGHT,
                  color: TEXT_DARK,
                }}
              >
                {clampText(descPlain, MAX_DESCRIPTION_CHARS)}
              </Text>
            </View>
            <View
              style={{
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 7,
                overflow: 'hidden',
              }}
            >
              <View style={{ flexDirection: 'row' }}>
                <DetailField
                  icon={<IconFactory size={13} color={ICON_NAVY} />}
                  label="Manufacturer / Vendor Name"
                  value={data.manufacturerVendor}
                  borderRight
                  borderBottom
                />
                <DetailField
                  icon={<IconBox size={13} color={ICON_NAVY} />}
                  label="Material / Product Name"
                  value={data.materialProductName}
                  borderBottom
                />
              </View>
              <View style={{ flexDirection: 'row' }}>
                <DetailField
                  icon={<IconTag size={13} color={ICON_NAVY} />}
                  label="Model Number(s)"
                  value={data.modelNumber}
                  borderRight
                  borderBottom
                />
                <DetailField
                  icon={<IconBox size={13} color={ICON_NAVY} />}
                  label="Quantity"
                  value={data.quantity}
                  borderBottom
                />
              </View>
              <View style={{ flexDirection: 'row' }}>
                <DetailField
                  icon={<IconFileText size={13} color={ICON_NAVY} />}
                  label="Specification Section(s)"
                  value={data.specificationSections}
                  borderRight
                  borderBottom
                />
                <DetailField
                  icon={<IconFileSpreadsheet size={13} color={ICON_NAVY} />}
                  label="Drawing / Sheet Number(s)"
                  value={data.drawingSheetNumbers}
                  borderBottom
                />
              </View>
              <View style={{ flexDirection: 'row' }}>
                <DetailField
                  icon={<IconTarget size={13} color={ICON_NAVY} />}
                  label="Detail Reference(s)"
                  value={data.detailReferences}
                  borderRight
                />
                <DetailField
                  icon={<IconHelpCircle size={13} color={ICON_NAVY} />}
                  label="Related RFI Number(s)"
                  value={data.relatedRfiNumbers}
                />
              </View>
            </View>
          </Section>

          {hasAttachments ? (
            <Section
              icon={<IconPaperclip size={11} color={TITLE_BLUE} />}
              title="Attachments"
              bodyPadding={0}
            >
              <View>
                <View style={{ flexDirection: 'row', backgroundColor: HEADER_BG }}>
                  <Text
                    style={{
                      width: '68%',
                      fontSize: LABEL_FONT,
                      fontWeight: 700,
                      paddingHorizontal: 9,
                      paddingVertical: 7,
                      textTransform: 'uppercase',
                      color: '#ffffff',
                      borderRightWidth: 1,
                      borderRightColor: 'rgba(255,255,255,0.18)',
                      letterSpacing: 0.6,
                    }}
                  >
                    File Name
                  </Text>
                  <Text
                    style={{
                      width: '32%',
                      fontSize: LABEL_FONT,
                      fontWeight: 700,
                      paddingHorizontal: 9,
                      paddingVertical: 7,
                      textTransform: 'uppercase',
                      color: '#ffffff',
                      letterSpacing: 0.6,
                    }}
                  >
                    File Type
                  </Text>
                </View>
                {attachmentRows.map((a, idx) => (
                  <View
                    key={`att-${idx}`}
                    style={{
                      flexDirection: 'row',
                      borderTopWidth: 1,
                      borderTopColor: BORDER,
                      backgroundColor: '#ffffff',
                      alignItems: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: '68%',
                        paddingHorizontal: 9,
                        paddingVertical: 6,
                        borderRightWidth: 1,
                        borderRightColor: BORDER,
                        flexDirection: 'row',
                        alignItems: 'center',
                      }}
                    >
                      <View style={{ marginRight: 6 }}>{attachmentIcon(a.fileType)}</View>
                      <Text
                        style={{
                          fontSize: BASE_FONT,
                          color: TEXT_DARK,
                          lineHeight: BODY_LINE_HEIGHT,
                          flex: 1,
                        }}
                      >
                        {clampText(a.fileName || 'N/A', 52)}
                      </Text>
                    </View>
                    <Text
                      style={{
                        width: '32%',
                        fontSize: BASE_FONT,
                        paddingHorizontal: 9,
                        paddingVertical: 6,
                        lineHeight: BODY_LINE_HEIGHT,
                        color: TEXT_DARK,
                        textTransform: 'uppercase',
                        letterSpacing: 0.3,
                      }}
                    >
                      {clampText(a.fileType || 'N/A', 14)}
                    </Text>
                  </View>
                ))}
                {attachmentsTruncated ? (
                  <Text
                    style={{
                      fontSize: LABEL_FONT - 0.4,
                      color: MUTED,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderTopWidth: 1,
                      borderTopColor: BORDER,
                    }}
                  >
                    +{data.attachments.length - MAX_ATTACHMENTS_ROWS} additional attachment(s) not
                    listed
                  </Text>
                ) : null}
              </View>
            </Section>
          ) : null}

          <Section
            icon={<IconChat size={11} color={TITLE_BLUE} />}
            title="Review / Response"
            bodyPadding={0}
          >
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: '#fbfcfe',
                borderBottomWidth: 1,
                borderBottomColor: BORDER,
              }}
            >
              <View
                style={{
                  flex: 1,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRightWidth: 1,
                  borderRightColor: BORDER,
                }}
              >
                <Label style={{ marginBottom: 3 }}>Reviewed By</Label>
                <Text
                  style={{
                    fontSize: VALUE_FONT,
                    color: TEXT_DARK,
                    fontWeight: 800,
                    lineHeight: BODY_LINE_HEIGHT,
                  }}
                >
                  {data.reviewedBy || '—'}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRightWidth: 1,
                  borderRightColor: BORDER,
                }}
              >
                <Label style={{ marginBottom: 3 }}>Response Date</Label>
                <Text
                  style={{
                    fontSize: VALUE_FONT,
                    color: TEXT_DARK,
                    fontWeight: 800,
                    lineHeight: BODY_LINE_HEIGHT,
                  }}
                >
                  {data.reviewDate || '—'}
                </Text>
              </View>
              <View
                style={{
                  flex: 1.05,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  justifyContent: 'center',
                  minHeight: 36,
                }}
              >
                <Label style={{ marginBottom: 3 }}>Reviewer Signature</Label>
                {sigUrl ? (
                  <Image
                    src={sigUrl}
                    style={{
                      maxHeight: 22,
                      width: '100%',
                      objectFit: 'contain',
                      objectPosition: 'left center',
                    }}
                  />
                ) : sigName ? (
                  <Text
                    style={{
                      fontSize: VALUE_FONT,
                      fontFamily: 'Helvetica-Oblique',
                      color: TEXT_DARK,
                    }}
                  >
                    {sigName}
                  </Text>
                ) : (
                  <View
                    style={{
                      borderBottomWidth: 0.9,
                      borderBottomColor: BORDER,
                      marginTop: 8,
                      opacity: 0.9,
                    }}
                  />
                )}
              </View>
            </View>
            <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 }}>
              <Label style={{ marginBottom: 4 }}>Reviewers Comments</Label>
              <Text
                style={{
                  fontSize: BASE_FONT,
                  lineHeight: BODY_LINE_HEIGHT,
                  color: TEXT_DARK,
                  fontWeight: 600,
                }}
              >
                {clampText(data.reviewerComments, MAX_REVIEWER_COMMENTS_CHARS) || '—'}
              </Text>
            </View>
          </Section>

          <View style={{ marginTop: 4 }}>
            <View style={{ height: 2, backgroundColor: ORANGE_ACCENT, borderRadius: 1 }} />
            <View
              style={{
                backgroundColor: HEADER_BG,
                paddingVertical: 9,
                paddingHorizontal: 12,
                alignItems: 'center',
                justifyContent: 'center',
                borderBottomLeftRadius: 4,
                borderBottomRightRadius: 4,
              }}
            >
              <Text
                style={{
                  color: '#ffffff',
                  fontSize: BASE_FONT,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                }}
              >
                AI-Powered Construction Documents  -  Fast, Clear, Professional    |    www.buildswift.app
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
