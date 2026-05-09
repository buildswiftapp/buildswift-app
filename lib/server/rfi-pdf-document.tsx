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

export type RfiApprovalRow = {
  name: string
  role: string
  /** Resolved signature image (typically data URI) when the reviewer signed digitally */
  signatureImageUri: string | null
  /** Shown in the Signature column when no image (typed name or status) */
  signatureTextFallback: string
  /** Review outcome — used for Response section fallback, not shown as its own column */
  reviewDecision: 'approved' | 'rejected' | 'pending'
  date: string
  notes: string
}

export type RfiAttachmentRow = { fileName: string; fileType: string; notes: string }

export type RfiPdfViewModel = {
  logoDataUri: string
  brand: string
  brandSub: string
  contactAddress: string
  contactPhone: string
  contactEmail: string
  rfiNumber: string
  status: string
  projectName: string
  projectAddress: string
  issueDate: string
  requiredResponseDate: string
  recipient: string
  sender: string
  summaryTitle: string
  priority: string
  detailedQuestion: string
  reasonForRequest: string
  conflictIdentification: string
  missingInformation: string
  clarificationRequired: string
  drawingSheetNumber: string
  specificationSection: string
  specificReference: string
  location: string
  attachments: RfiAttachmentRow[]
  responseContent: string
  responder: string
  responseDate: string
  costImpact: string
  scheduleImpact: string
  impactDescription: string
  finalStatus: string
  reviewedBy: string
  approvalRows: RfiApprovalRow[]
  footerNote: string
}

// ── Color tokens ───────────────────────────────────────────────────────────────
/** Default brand navy used for the page frame, RFI# tile, section titles, icons,
 *  table headers, footer band, and avatar tiles. Single source of truth. */
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

// ── Page geometry ──────────────────────────────────────────────────────────────
/**
 * Custom page (portrait): 8" × 13" in points (576 × 936).
 * Single sheet: wrap=false; tight typography + clamps; overflow truncates with …
 */
const PAGE_WIDTH_PT = 8 * 72 // 576pt — 8in canvas width
const PAGE_HEIGHT_PT = 13 * 72 // 936
const BASE_FONT = 8.05
const LABEL_FONT = 6.5
const VALUE_FONT = 8.05
const BODY_LINE_HEIGHT = 1.24
const SECTION_GAP = 6
const PAGE_MARGIN_PT = 11
const FRAME_INNER_PADDING = 10
/** Narrative clamps */
const MAX_QUESTION_CHARS = 520
const MAX_RESPONSE_CHARS = 1320
const MAX_ATTACHMENTS_ROWS = 5
const MAX_APPROVAL_ROWS = 7
/** Max wrapped lines shown for sender/recipient columns in metadata grid */
const META_PARTY_MAX_LINES = 2

function statusBadgeStyle(status: string): { backgroundColor: string; color: string } {
  const s = (status || '').toUpperCase()
  if (s === 'ANSWERED') return { backgroundColor: '#16a34a', color: '#ffffff' }
  if (s === 'CLOSED') return { backgroundColor: '#dc2626', color: '#ffffff' }
  return { backgroundColor: '#f59e0b', color: '#111827' }
}

function splitLines(value: string): string[] {
  return (value || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function clampChars(text: string, maxChars: number) {
  const t = (text || '').trim()
  if (t.length <= maxChars) return t
  return t.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…'
}

function formatAddressLines(value: string): string[] {
  const raw = (value || '').trim()
  if (!raw) return []
  const nl = splitLines(raw)
  if (nl.length > 1) return nl

  // Common DB storage is "street, city, state zip" (comma-separated). Convert to 2 lines.
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    const first = parts[0]
    const rest = parts.slice(1).join(', ')
    return [first, rest].filter(Boolean)
  }

  // Fallback: try to split before a trailing country token.
  const m = raw.match(/^(.*?)(\s+(?:USA|United States|US)\b.*)$/i)
  if (m && m[1] && m[2]) return [m[1].trim(), m[2].trim()]

  return [raw]
}

// ── SVG icon helpers (Lucide-style strokes) ────────────────────────────────────

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

const IconEdit = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
      'M15 5l4 4',
    ]}
  />
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

const IconShieldCheck = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
      'M9 12l2 2 4-4',
    ]}
  />
)

/** Filled red PDF document icon with little "PDF" mark. */
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

/** Soft rounded tile with a centered icon. */
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

/** Circular tile with a centered icon (used by the 3-col RFI summary). */
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

const IconMapPin = ({ size = 10, color = ICON_NAVY }: { size?: number; color?: string }) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Path
      d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z"
      fill={color}
    />
    <Circle cx={12} cy={10} r={2.6} fill="#ffffff" />
  </Svg>
)

/** Rounded-square avatar tile (navy fill, white person silhouette). */
const IconAvatarTile = ({
  size = 22,
  color = HEADER_BG,
  radius = 5,
}: {
  size?: number
  color?: string
  radius?: number
}) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Rect x={0} y={0} width={24} height={24} rx={(radius * 24) / size} ry={(radius * 24) / size} fill={color} />
    <Circle cx={12} cy={9.5} r={3.6} fill="#ffffff" />
    <Path d="M4.5 20.5c1.5-3.5 4.5-5 7.5-5s6 1.5 7.5 5z" fill="#ffffff" />
  </Svg>
)

// ── Re-usable building blocks ──────────────────────────────────────────────────

/** Section card with an icon + uppercase title at the top (no border-overlap). */
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

/** Uppercase muted small label. */
function Label({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <Text
      style={{
        fontSize: LABEL_FONT,
        color: MUTED,
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

/** Decide which file-type icon to render based on attachment fileType. */
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

export function RfiPdfDocument({ data }: { data: RfiPdfViewModel }) {
  const statusStyle = statusBadgeStyle(data.status)
  const priorityUpper = (data.priority || '').toUpperCase()
  const priorityStyle =
    priorityUpper === 'HIGH'
      ? { color: '#dc2626' }
      : priorityUpper === 'LOW'
        ? { color: '#16a34a' }
        : { color: TEXT_DARK }
  const reviewedByDisplay =
    data.reviewedBy && data.reviewedBy.trim() && data.reviewedBy !== 'Not Provided'
      ? data.reviewedBy
      : '—'
  const approvalRowsForTable =
    data.approvalRows.length > 0
      ? data.approvalRows.slice(0, MAX_APPROVAL_ROWS)
      : [
          {
            name: '—',
            role: '—',
            signatureImageUri: null,
            signatureTextFallback: '—',
            reviewDecision: 'pending' as const,
            date: '—',
            notes: '—',
          },
        ]
  const approvalTruncated = data.approvalRows.length > MAX_APPROVAL_ROWS
  const hasAttachments = data.attachments.some((a) => {
    const name = (a?.fileName ?? '').trim()
    return Boolean(name) && name !== 'N/A' && name !== '—' && name !== 'Not Provided'
  })
  const attachmentRows = data.attachments.slice(0, MAX_ATTACHMENTS_ROWS)
  const attachmentsTruncated = data.attachments.length > MAX_ATTACHMENTS_ROWS

  const questionPlain = stripHtmlToPlainParagraphs(data.detailedQuestion)
  const senderLines = splitLines(data.sender).length ? splitLines(data.sender) : ['Not Provided']
  const recipientLines = splitLines(data.recipient).length
    ? splitLines(data.recipient)
    : ['Not Provided']

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
          {/* ── 1. Brand row ───────────────────────────────────────────────── */}
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
                width: 138,
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
                RFI #
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
                {data.rfiNumber}
              </Text>
            </View>
          </View>

          {/* ── 2. Header info row: Contact+Project card | Status card ──────── */}
          <View
            style={{
              flexDirection: 'row',
              marginBottom: SECTION_GAP + 1,
              minHeight: 110,
            }}
          >
            {/* Left card: Contact + Project (two cells) */}
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
            {/* Cell A: Contact */}
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

            {/* Cell B: Project */}
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

            {/* Right card: Status / Dates / Priority */}
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
                  {data.status}
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
                <Label>Date Issued</Label>
                <Text style={{ fontSize: VALUE_FONT, fontWeight: 800, color: TEXT_DARK }}>
                  {data.issueDate}
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
                <Label>Required Response Date</Label>
                <Text style={{ fontSize: VALUE_FONT, fontWeight: 800, color: TEXT_DARK }}>
                  {data.requiredResponseDate}
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
                    ...(priorityStyle as any),
                  }}
                >
                  {priorityUpper || '—'}
                </Text>
              </View>
            </View>
          </View>

          {/* ── 3. Sent From / Sent To row ──────────────────────────────────── */}
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
                    {clampChars(line, 62)}
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
                    {clampChars(line, 62)}
                  </Text>
                ))}
              </View>
            </View>
          </View>

          {/* ── 4. RFI Summary (3 cols) ─────────────────────────────────────── */}
          <Section icon={<IconFileText size={11} color={TITLE_BLUE} />} title="RFI Summary">
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingRight: 9, flexDirection: 'row' }}>
                <CircleTile size={26}>
                  <IconEdit size={13} color={TITLE_BLUE} />
                </CircleTile>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Label style={{ marginBottom: 3 }}>RFI Title</Label>
                  <Text
                    style={{
                      fontSize: VALUE_FONT,
                      fontWeight: 700,
                      color: TEXT_DARK,
                      lineHeight: BODY_LINE_HEIGHT,
                    }}
                  >
                    {clampChars(data.summaryTitle, 110)}
                  </Text>
                </View>
              </View>
              <View style={{ width: 1, backgroundColor: BORDER }} />
              <View style={{ flex: 1, paddingHorizontal: 9, flexDirection: 'row' }}>
                <CircleTile size={26}>
                  <IconHelpCircle size={13} color={TITLE_BLUE} />
                </CircleTile>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Label style={{ marginBottom: 3 }}>Reason for Request</Label>
                  <Text
                    style={{
                      fontSize: VALUE_FONT,
                      color: TEXT_DARK,
                      lineHeight: BODY_LINE_HEIGHT,
                    }}
                  >
                    {clampChars(data.reasonForRequest, 110)}
                  </Text>
                </View>
              </View>
              <View style={{ width: 1, backgroundColor: BORDER }} />
              <View style={{ flex: 1.25, paddingLeft: 9, flexDirection: 'row' }}>
                <CircleTile size={26}>
                  <IconFileText size={13} color={TITLE_BLUE} />
                </CircleTile>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Label style={{ marginBottom: 3 }}>Question / Request Details</Label>
                  <Text
                    style={{
                      fontSize: BASE_FONT,
                      lineHeight: BODY_LINE_HEIGHT,
                      color: TEXT_DARK,
                    }}
                  >
                    {clampChars(questionPlain, MAX_QUESTION_CHARS)}
                  </Text>
                </View>
              </View>
            </View>
          </Section>

          {/* ── 5. Attachments ──────────────────────────────────────────────── */}
          {hasAttachments ? (
            <Section
              icon={<IconPaperclip size={11} color={TITLE_BLUE} />}
              title="Attachments"
              bodyPadding={0}
            >
              <View>
                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: HEADER_BG,
                  }}
                >
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
                        {clampChars(a.fileName, 52)}
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
                      {a.fileType}
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

          {/* ── 6. Response ─────────────────────────────────────────────────── */}
          <Section
            icon={<IconChat size={11} color={TITLE_BLUE} />}
            title="Response"
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
                <Label style={{ marginBottom: 3 }}>Name of Responder</Label>
                <Text
                  style={{
                    fontSize: VALUE_FONT,
                    color: TEXT_DARK,
                    fontWeight: 700,
                    lineHeight: BODY_LINE_HEIGHT,
                  }}
                >
                  {data.responder}
                </Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Label style={{ marginBottom: 3 }}>Response Date</Label>
                <Text
                  style={{
                    fontSize: VALUE_FONT,
                    color: TEXT_DARK,
                    fontWeight: 700,
                    lineHeight: BODY_LINE_HEIGHT,
                  }}
                >
                  {data.responseDate}
                </Text>
              </View>
            </View>
            <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 }}>
              <Label style={{ marginBottom: 4 }}>RFI Answer</Label>
              <Text style={{ fontSize: BASE_FONT, lineHeight: BODY_LINE_HEIGHT, color: TEXT_DARK }}>
                {clampChars(data.responseContent, MAX_RESPONSE_CHARS) || '—'}
              </Text>
            </View>
          </Section>

          {/* ── 7. Approval / Tracking ──────────────────────────────────────── */}
          <Section
            icon={<IconShieldCheck size={11} color={TITLE_BLUE} />}
            title="Approval / Tracking"
            bodyPadding={0}
          >
            <View style={{ paddingHorizontal: 10, paddingVertical: 7 }}>
              <Label style={{ marginBottom: 3 }}>Reviewed By</Label>
              <Text style={{ fontSize: VALUE_FONT, fontWeight: 800, color: TEXT_DARK }}>
                {reviewedByDisplay}
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderTopWidth: 1,
                borderTopColor: BORDER,
                backgroundColor: '#fbfcfe',
              }}
            >
              <Label>Approval / Response Log</Label>
            </View>

            <View>
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: HEADER_BG,
                  borderTopWidth: 1,
                  borderTopColor: BORDER,
                }}
              >
                {(['Response By', 'Role', 'Signature', 'Response Date'] as const).map((h, idx) => (
                  <Text
                    key={h}
                    style={{
                      width: idx === 0 ? '24%' : idx === 1 ? '18%' : idx === 2 ? '22%' : '36%',
                      fontSize: LABEL_FONT,
                      fontWeight: 700,
                      paddingHorizontal: 7,
                      paddingVertical: 6,
                      textTransform: 'uppercase',
                      color: '#ffffff',
                      borderRightWidth: idx === 3 ? 0 : 1,
                      borderRightColor: 'rgba(255,255,255,0.18)',
                      letterSpacing: 0.6,
                    }}
                  >
                    {h}
                  </Text>
                ))}
              </View>
              {approvalTruncated ? (
                <Text
                  style={{
                    fontSize: LABEL_FONT - 0.4,
                    color: MUTED,
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                  }}
                >
                  Showing first {MAX_APPROVAL_ROWS} reviewer row(s)
                </Text>
              ) : null}
              {approvalRowsForTable.map((r, idx) => (
                <View
                  key={`r-${idx}`}
                  style={{
                    flexDirection: 'row',
                    borderTopWidth: 1,
                    borderTopColor: BORDER,
                    backgroundColor: '#ffffff',
                  }}
                >
                  <Text
                    style={{
                      width: '24%',
                      fontSize: BASE_FONT,
                      paddingHorizontal: 7,
                      paddingVertical: 5,
                      borderRightWidth: 1,
                      borderRightColor: BORDER,
                      lineHeight: BODY_LINE_HEIGHT,
                      color: TEXT_DARK,
                    }}
                  >
                    {clampChars(r.name, 28)}
                  </Text>
                  <Text
                    style={{
                      width: '18%',
                      fontSize: BASE_FONT,
                      paddingHorizontal: 7,
                      paddingVertical: 5,
                      borderRightWidth: 1,
                      borderRightColor: BORDER,
                      lineHeight: BODY_LINE_HEIGHT,
                      color: TEXT_DARK,
                    }}
                  >
                    {clampChars(r.role, 14)}
                  </Text>
                  <View
                    style={{
                      width: '22%',
                      paddingHorizontal: 4,
                      paddingVertical: 4,
                      borderRightWidth: 1,
                      borderRightColor: BORDER,
                      justifyContent: 'center',
                      minHeight: 32,
                    }}
                  >
                    {r.signatureImageUri ? (
                      <Image
                        src={r.signatureImageUri}
                        style={{
                          maxHeight: 26,
                          width: '100%',
                          objectFit: 'contain',
                          objectPosition: 'left center',
                        }}
                      />
                    ) : (
                      <Text style={{ fontSize: BASE_FONT, lineHeight: BODY_LINE_HEIGHT }}>
                        {clampChars(r.signatureTextFallback, 18)}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      width: '36%',
                      fontSize: BASE_FONT,
                      paddingHorizontal: 7,
                      paddingVertical: 5,
                      lineHeight: BODY_LINE_HEIGHT,
                      color: TEXT_DARK,
                    }}
                  >
                    {r.date}
                  </Text>
                </View>
              ))}
            </View>
          </Section>

          {/* ── 8. Footer (orange divider + navy band) ──────────────────────── */}
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
