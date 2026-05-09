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

export type ChangeOrderApprovalPdfRow = {
  name: string
  role: string
  action: string
  /** Resolved image URL (often a data URI) when the reviewer drew/uploaded a signature */
  signatureUrl?: string | null
  /** Typed / printed signer name fallback when no image */
  signatureName?: string | null
  date: string
  notes: string
}

export type ChangeOrderAttachmentRow = { fileName: string; fileType: string; notes: string }

/** Legacy row shape used only while assembling cost breakdown cards in `change-order-pdf.ts`. */
export type ChangeOrderCostLinePdfRow = {
  lineDescription: string
  qtyDisplay: string
  unitCostDisplay: string
  subtotalDisplay: string
  justificationText?: string | null
}

export type ChangeOrderCostBreakdownCardPdf = {
  title: string
  sublabel: string
  amountDisplay: string
}

export type ChangeOrderCostBreakdownPdf =
  | { kind: 'justification'; body: string; totalImpactDisplay: string }
  | {
      kind: 'cards'
      cards: ChangeOrderCostBreakdownCardPdf[]
      /** Shown beside "Total Cost Impact" (formatted dollars; credits may append "credit"). */
      totalImpactDisplay: string
    }

export type ChangeOrderPdfViewModel = {
  logoDataUri: string
  brand: string
  brandSub: string
  themePrimary: string
  contactAddress: string
  contactPhone: string
  contactEmail: string

  /** Full legal name under logo / in contact block */
  companyLegalName: string

  projectName: string
  projectAddress: string
  changeOrderNumber: string
  dateIssuedDisplay: string
  /** Shown only when not N/A */
  requiredReviewDateDisplayOptional: string

  toOwner: string
  fromContractor: string

  changeTitle: string
  summaryStatus: string
  priorityDisplay: string

  /** Change Order Summary — title + reason only */
  reasonForChangeDisplay: string

  detailedDescription: string

  costBreakdown: ChangeOrderCostBreakdownPdf
  /** Cost strip: prime / signed CO delta / revised total */
  originalContractAmountDisplay: string
  changeOrderAmountDisplay: string
  revisedContractAmountDisplay: string

  /** Schedule impact — original / proposed (impact or explicit) / new total */
  originalDurationDisplay: string
  proposedDurationDisplay: string
  newDurationDisplay: string

  attachments: ChangeOrderAttachmentRow[]

  finalAuthorizationStatus: string
  /** Latest decided reviewer full name when available (else single assignee, else em dash). */
  reviewedByDisplay: string
  approvalRows: ChangeOrderApprovalPdfRow[]
}

// ── Color tokens ───────────────────────────────────────────────────────────────
/** Default brand navy. Single source of truth for all primary brand surfaces. */
const BRAND_NAVY = '#002162'
const HEADER_BG = BRAND_NAVY
const TITLE_BLUE = BRAND_NAVY
const ICON_NAVY = BRAND_NAVY
const PAGE_FRAME = BRAND_NAVY
const ORANGE_ACCENT = '#f97316'
const ICON_TILE_BG = '#eef0fb'
const BLUE_TILE_BG = '#e6effb'
const GREEN_TILE_BG = '#e7f4ec'
const ORANGE_TILE_BG = '#fdebd9'
const COST_GRID_BG = '#f5f6fc'
const BORDER = '#e8edf2'
const CARD_BORDER = '#c8d8e8'
const CARD_BG = '#ffffff'
const TEXT_DARK = '#1f2937'
const MUTED = '#5b6471'
const PDF_RED = '#dc2626'
const APPROVED_GREEN = '#16a34a'
const SCHED_GREEN = '#0e8a4e'
const SCHED_ORANGE = '#c2410c'
const SCHED_BLUE = TITLE_BLUE

// ── Page geometry ──────────────────────────────────────────────────────────────
/**
 * Custom page (portrait): 8" × 13" in points (576 × 936).
 * Single sheet: wrap=false; tight typography + clamps; overflow truncates with …
 */
const PAGE_WIDTH_PT = 8 * 72
const PAGE_HEIGHT_PT = 13 * 72
const PAGE_MARGIN_PT = 11
const FRAME_INNER_PADDING = 10

const BASE_FONT = 7.85
const LABEL_FONT = 6.5
const VALUE_FONT = 7.85
const BODY_LINE_HEIGHT = 1.24
const DESC_LINE_HEIGHT = 1.32
const SECTION_GAP = 6

/** Clamps tuned so a full CO layout fits one 8×13 page without overflow */
const MAX_DESCRIPTION_CHARS = 210
const MAX_FIELD_CELL_CHARS = 56
const MAX_ATTACHMENTS_ROWS = 3
const MAX_APPROVAL_ROWS = 3
const MAX_SUMMARY_TITLE_CHARS = 58
const MAX_REASON_IN_SUMMARY_CHARS = 56
const PARTY_LINES_MAX = 2

// ── Style helpers ─────────────────────────────────────────────────────────────

function statusBadgeStyle(status: string): { backgroundColor: string; color: string } {
  const s = (status || '').toUpperCase()
  if (s === 'APPROVED') return { backgroundColor: '#16a34a', color: '#ffffff' }
  if (s === 'REJECTED') return { backgroundColor: '#dc2626', color: '#ffffff' }
  return { backgroundColor: '#f2c94c', color: '#111827' }
}

function priorityStyle(raw: string): { color: string } {
  const t = (raw || '').trim()
  const u = t.toUpperCase()
  if (u === 'HIGH' || /\bhigh\b/i.test(t) || /\burgent\b/i.test(t)) return { color: '#dc2626' }
  if (u === 'LOW' || /\blow\b/i.test(t)) return { color: '#16a34a' }
  return { color: TEXT_DARK }
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

const IconTag = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
      'M7 7h.01',
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

/** Filled red PDF document icon for attachment rows. */
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

/** Rounded-square avatar tile (filled tile, white person silhouette). */
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

const IconUsers = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
      'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
      'M22 21v-2a4 4 0 0 0-3-3.87',
      'M16 3.13a4 4 0 0 1 0 7.75',
    ]}
  />
)

const IconBoxes = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z',
      'M7 16.5l-4.74-2.85',
      'M7 16.5l5-3',
      'M7 16.5v5.17',
      'M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z',
      'M17 16.5l-5-3',
      'M17 16.5l4.74-2.85',
      'M17 16.5v5.17',
      'M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z',
      'M12 8L7.26 5.15',
      'M12 8l4.74-2.85',
      'M12 13.5V8',
    ]}
  />
)

const IconExcavator = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M2 19h13.5a2 2 0 0 0 2-2v-1l4 1V14',
      'M2 19v-3a2 2 0 0 1 2-2h7v5',
      'M11 14V9a1 1 0 0 1 1-1h2.5l3 4',
      'M14.5 8l3-3.5L21 8',
      'M5 22a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
      'M14 22a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    ]}
  />
)

const IconHardHat = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z',
      'M4 15v-3a8 8 0 0 1 16 0v3',
      'M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2',
    ]}
  />
)

const IconMoreHorizontal = ({ size = 10, color = ICON_NAVY }: { size?: number; color?: string }) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Circle cx={5} cy={12} r={2} fill={color} />
    <Circle cx={12} cy={12} r={2} fill={color} />
    <Circle cx={19} cy={12} r={2} fill={color} />
  </Svg>
)

const IconPercent = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M19 5L5 19',
      'M6.5 6.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
      'M17.5 12.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
    ]}
  />
)

const IconClipboard = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
      'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
    ]}
  />
)

const IconClipboardCheck = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
      'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
      'M9 14l2 2 4-4',
    ]}
  />
)

const IconCalendar = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
      'M16 2v4',
      'M8 2v4',
      'M3 10h18',
    ]}
  />
)

const IconCalendarCheck = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
      'M16 2v4',
      'M8 2v4',
      'M3 10h18',
      'M9 16l2 2 4-4',
    ]}
  />
)

const IconClockPlus = ({ size = 10, color = ICON_NAVY }: { size?: number; color?: string }) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Circle cx={11} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
    <Path
      d="M11 7v5l3 2"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M19 4v6"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M16 7h6"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
)

const IconShieldCheck = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z',
      'M9 12l2 2 4-4',
    ]}
  />
)

const IconUsersGroup = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M18 21a8 8 0 0 0-16 0',
      'M10 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
      'M22 21a6 6 0 0 0-3.5-5.5',
      'M16 3a4 4 0 0 1 0 8',
    ]}
  />
)

const IconArrowRight = ({ size = 10, color = MUTED }: { size?: number; color?: string }) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Path
      d="M5 12h14"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M13 6l6 6-6 6"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
)

const IconDollarSign = (p: { size?: number; color?: string }) => (
  <StrokeIcon
    {...p}
    paths={[
      'M12 1v22',
      'M17 5H9a3.5 3.5 0 0 0 0 7h6a3.5 3.5 0 0 1 0 7H7',
    ]}
  />
)

const IconCircleDollar = ({ size = 10, color = ICON_NAVY }: { size?: number; color?: string }) => (
  <Svg viewBox="0 0 24 24" width={size} height={size}>
    <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} fill="none" />
    <Path
      d="M12 6v12"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      fill="none"
    />
    <Path
      d="M15 9.5h-4a1.7 1.7 0 1 0 0 3.4h2a1.7 1.7 0 1 1 0 3.4H9"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
)

/** Soft rounded-square tile with a centered icon. */
function IconTile({
  children,
  size = 18,
  bg = ICON_TILE_BG,
  radius = 4,
}: {
  children: React.ReactNode
  size?: number
  bg?: string
  radius?: number
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  )
}

/** Circular tile with a centered icon. */
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

// ── Re-usable building blocks ──────────────────────────────────────────────────

/** Section card with an icon + uppercase title at the top. */
function Section({
  icon,
  title,
  children,
  bodyPadding = 9,
  marginBottom = SECTION_GAP,
  flex,
}: {
  icon?: React.ReactNode
  title: string
  children: React.ReactNode
  bodyPadding?: number
  marginBottom?: number
  flex?: number
}) {
  return (
    <View
      style={{
        marginBottom,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 8,
        backgroundColor: CARD_BG,
        overflow: 'hidden',
        ...(flex !== undefined ? { flex } : {}),
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

/** Reviewer signature slot inside the APPROVAL / RESPONSE LOG grid (no inner divider). */
function CoApprovalLogSignatureCell({
  signatureUrl,
  signatureName,
}: {
  signatureUrl?: string | null
  signatureName?: string | null
}) {
  const url = (signatureUrl || '').trim()
  const name = (signatureName || '').trim()
  return (
    <View
      style={{
        width: '22%',
        paddingHorizontal: 8,
        paddingVertical: 6,
        justifyContent: 'center',
      }}
    >
      {url ? (
        <Image
          src={url}
          style={{
            width: '100%',
            height: 26,
            objectFit: 'contain',
            objectPosition: 'left center',
          }}
        />
      ) : name ? (
        <Text
          style={{
            fontSize: VALUE_FONT + 1,
            fontFamily: 'Helvetica-Oblique',
            color: TEXT_DARK,
            lineHeight: BODY_LINE_HEIGHT,
          }}
        >
          {clampText(name, 24)}
        </Text>
      ) : (
        <View
          style={{
            borderBottomWidth: 0.9,
            borderBottomColor: BORDER,
            marginTop: 12,
            opacity: 0.9,
          }}
        />
      )}
    </View>
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

/** Map a cost-card title to its category icon. Falls back to file-text for arbitrary line-item titles. */
function costCardIcon(title: string, color = ICON_NAVY): React.ReactNode {
  const t = (title || '').toLowerCase().trim()
  if (t === 'labor') return <IconUsers size={15} color={color} />
  if (t === 'material' || t === 'materials') return <IconBoxes size={15} color={color} />
  if (t === 'equipment') return <IconExcavator size={15} color={color} />
  if (t === 'subcontractor' || t === 'subcontractors') return <IconHardHat size={15} color={color} />
  if (t === 'other') return <IconMoreHorizontal size={15} color={color} />
  if (t.includes('overhead') || t.includes('profit') || t.includes('markup')) return <IconPercent size={15} color={color} />
  return <IconFileText size={15} color={color} />
}

// ── Cost-breakdown subsection ──────────────────────────────────────────────────

function PartyBlock({
  lines,
  maxChars = MAX_FIELD_CELL_CHARS + 6,
}: {
  lines: string[]
  maxChars?: number
}) {
  const show = lines.length ? lines.slice(0, PARTY_LINES_MAX) : ['Not Provided']
  return (
    <>
      {show.map((line, idx) => (
        <Text
          key={`p-${idx}`}
          style={{
            fontSize: VALUE_FONT,
            color: TEXT_DARK,
            fontWeight: idx === 0 ? 800 : 500,
            lineHeight: BODY_LINE_HEIGHT,
            marginTop: idx === 0 ? 2 : 0,
          }}
        >
          {clampText(line, maxChars)}
        </Text>
      ))}
    </>
  )
}

function CostCard({ card }: { card: ChangeOrderCostBreakdownCardPdf }) {
  return (
    <View
      style={{
        flex: 1,
        marginHorizontal: 4,
        marginVertical: 4,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 7,
        backgroundColor: '#ffffff',
        paddingHorizontal: 9,
        paddingVertical: 9,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <CircleTile size={28} bg={ICON_TILE_BG}>
        {costCardIcon(card.title, ICON_NAVY)}
      </CircleTile>
      <View style={{ marginLeft: 9, flex: 1 }}>
        <Label color={TITLE_BLUE} style={{ marginBottom: 1 }}>
          {clampText(card.title, 22)}
        </Label>
        <Text
          style={{
            fontSize: LABEL_FONT - 0.2,
            color: MUTED,
            marginTop: 1,
          }}
        >
          {clampText(card.sublabel, 28)}
        </Text>
        <Text
          style={{
            fontSize: VALUE_FONT + 1.6,
            fontWeight: 900,
            color: TEXT_DARK,
            marginTop: 3,
            letterSpacing: 0.15,
          }}
        >
          {card.amountDisplay}
        </Text>
      </View>
    </View>
  )
}

function ChangeOrderCostBreakdownSection({
  breakdown,
  originalContractAmountDisplay,
  changeOrderAmountDisplay,
  revisedContractAmountDisplay,
}: {
  breakdown: ChangeOrderCostBreakdownPdf
  originalContractAmountDisplay: string
  changeOrderAmountDisplay: string
  revisedContractAmountDisplay: string
}) {
  const totalImpactDisplay = breakdown.totalImpactDisplay

  return (
    <View>
      {breakdown.kind === 'cards' ? (
        <View
          style={{
            backgroundColor: COST_GRID_BG,
            borderRadius: 7,
            paddingHorizontal: 4,
            paddingVertical: 2,
          }}
        >
          {(() => {
            const cards = breakdown.cards
            const rows: ChangeOrderCostBreakdownCardPdf[][] = []
            for (let i = 0; i < cards.length; i += 3) {
              rows.push(cards.slice(i, i + 3))
            }
            return rows.map((row, rIdx) => (
              <View key={`cost-row-${rIdx}`} style={{ flexDirection: 'row' }}>
                {row.map((card, cIdx) => (
                  <CostCard key={`cost-${rIdx}-${cIdx}`} card={card} />
                ))}
                {row.length < 3
                  ? Array.from({ length: 3 - row.length }).map((_, k) => (
                      <View key={`pad-${rIdx}-${k}`} style={{ flex: 1, marginHorizontal: 4 }} />
                    ))
                  : null}
              </View>
            ))
          })()}
        </View>
      ) : (
        <View
          style={{
            borderWidth: 1,
            borderColor: BORDER,
            borderRadius: 7,
            padding: 10,
            backgroundColor: '#fbfcfe',
            flexDirection: 'row',
            alignItems: 'flex-start',
          }}
        >
          <CircleTile size={28} bg={ICON_TILE_BG}>
            <IconFileText size={15} color={ICON_NAVY} />
          </CircleTile>
          <View style={{ marginLeft: 9, flex: 1 }}>
            <Label color={TITLE_BLUE} style={{ marginBottom: 3 }}>
              Cost Justification
            </Label>
            <Text
              style={{
                fontSize: BASE_FONT,
                lineHeight: DESC_LINE_HEIGHT,
                color: TEXT_DARK,
                fontWeight: 600,
              }}
            >
              {clampText(breakdown.body, 520)}
            </Text>
          </View>
        </View>
      )}

      {/* Total Cost Impact navy bar */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: HEADER_BG,
          paddingVertical: 9,
          paddingHorizontal: 12,
          borderRadius: 7,
          marginTop: 8,
        }}
      >
        <Text
          style={{
            fontSize: LABEL_FONT + 1.5,
            fontWeight: 800,
            color: '#ffffff',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Total Cost Impact
        </Text>
        <Text
          style={{
            fontSize: BASE_FONT + 4.5,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: 0.2,
          }}
        >
          {totalImpactDisplay}
        </Text>
      </View>

      {/* 3-card totals row */}
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <TotalsTile
          tileBg={BLUE_TILE_BG}
          icon={<IconClipboard size={15} color={TITLE_BLUE} />}
          label="Original Contract Amount"
          value={originalContractAmountDisplay}
          marginRight
        />
        <TotalsTile
          tileBg={GREEN_TILE_BG}
          icon={<IconCircleDollar size={15} color={SCHED_GREEN} />}
          label="Change Order Amount"
          value={changeOrderAmountDisplay}
          valueColor={SCHED_GREEN}
          marginRight
        />
        <TotalsTile
          tileBg={ORANGE_TILE_BG}
          icon={<IconClipboardCheck size={15} color={SCHED_ORANGE} />}
          label="Revised Contract Amount"
          value={revisedContractAmountDisplay}
        />
      </View>
    </View>
  )
}

function TotalsTile({
  tileBg,
  icon,
  label,
  value,
  valueColor = TEXT_DARK,
  marginRight,
}: {
  tileBg: string
  icon: React.ReactNode
  label: string
  value: string
  valueColor?: string
  marginRight?: boolean
}) {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 7,
        paddingHorizontal: 9,
        paddingVertical: 8,
        marginRight: marginRight ? 8 : 0,
        backgroundColor: '#fffaf3',
      }}
    >
      <CircleTile size={28} bg={tileBg}>
        {icon}
      </CircleTile>
      <View style={{ marginLeft: 9, flex: 1 }}>
        <Label color={MUTED} style={{ marginBottom: 2 }}>
          {label}
        </Label>
        <Text style={{ fontSize: VALUE_FONT + 1.2, fontWeight: 900, color: valueColor }}>{value}</Text>
      </View>
    </View>
  )
}

function ScheduleCard({
  tileBg,
  icon,
  label,
  value,
}: {
  tileBg: string
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 7,
        paddingHorizontal: 9,
        paddingVertical: 9,
        backgroundColor: '#ffffff',
      }}
    >
      <CircleTile size={28} bg={tileBg}>
        {icon}
      </CircleTile>
      <View style={{ marginLeft: 9, flex: 1 }}>
        <Label color={MUTED} style={{ marginBottom: 2 }}>
          {label}
        </Label>
        <Text style={{ fontSize: VALUE_FONT + 1.2, fontWeight: 900, color: TEXT_DARK }}>{value}</Text>
      </View>
    </View>
  )
}

// ── Main document ─────────────────────────────────────────────────────────────

export function ChangeOrderPdfDocument({ data }: { data: ChangeOrderPdfViewModel }) {
  const statusStyle = statusBadgeStyle(data.summaryStatus)
  const priorityUpper = (data.priorityDisplay || '').toUpperCase()
  const pStyle = priorityStyle(data.priorityDisplay)

  const fromLines = splitLines(data.fromContractor)
  const toLines = splitLines(data.toOwner)

  const approvalRowsDisplayed: ChangeOrderApprovalPdfRow[] = (() => {
    const trimmed = data.approvalRows.slice(0, MAX_APPROVAL_ROWS)
    if (trimmed.length > 0) return trimmed
    return [
      {
        name: '—',
        role: '—',
        action: '—',
        date: '—',
        notes: 'No reviewer responses recorded yet.',
      },
    ]
  })()

  const attachmentRowsTruncated =
    data.attachments.length > MAX_ATTACHMENTS_ROWS
      ? data.attachments.slice(0, MAX_ATTACHMENTS_ROWS)
      : data.attachments

  const hasAttachments = data.attachments.some((a) => {
    const name = (a?.fileName ?? '').trim()
    return Boolean(name) && name !== 'N/A' && name !== '—' && name !== 'Not Provided'
  })

  const descPlainClamped = clampText(stripHtmlToPlainParagraphs(data.detailedDescription), MAX_DESCRIPTION_CHARS)

  const requiredResponseDateDisplay =
    (data.requiredReviewDateDisplayOptional || '').trim() && data.requiredReviewDateDisplayOptional !== 'N/A'
      ? data.requiredReviewDateDisplayOptional
      : 'N/A'

  // Derive a role line for the AUTHORIZATION card from the latest decided row
  const authRow = data.approvalRows.find(
    (r) => /\b(approved|rejected|signed)\b/i.test((r.action || '').trim()) && (r.name || '').trim().length > 0,
  ) || data.approvalRows[0]
  const authReviewedBy = (data.reviewedByDisplay || authRow?.name || '—').trim() || '—'
  const authRole = (authRow?.role || '').trim()
  const authDate = (authRow?.date || '').trim()
  const authSigUrl = (authRow?.signatureUrl || '').trim()
  const authSigName = (authRow?.signatureName || '').trim()

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
                width: 166,
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
                Change Order #
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
                {clampText(data.changeOrderNumber, 22)}
              </Text>
            </View>
          </View>

          {/* ── 2. Header info row: Contact+Project | Status ────────────────── */}
          <View
            style={{
              flexDirection: 'row',
              marginBottom: SECTION_GAP + 1,
              minHeight: 110,
            }}
          >
            {/* Left card: Contact + Project */}
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
                    {clampText(data.companyLegalName, 36)}
                  </Text>
                </View>
                {formatAddressLines(data.contactAddress).slice(0, 2).map((line, idx) => (
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
                <IconTile size={36} radius={6}>
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
                  {clampText(data.projectName, 42)}
                </Text>
                {formatAddressLines(data.projectAddress).slice(0, 2).map((line, idx) => (
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

            {/* Right card: Status / Date Issued / Required Response Date / Priority */}
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
                  {data.summaryStatus}
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
                  {data.dateIssuedDisplay}
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
                  {requiredResponseDateDisplay}
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
                  {priorityUpper || data.priorityDisplay || '—'}
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
                <PartyBlock lines={fromLines.length ? fromLines : ['Not Provided']} />
              </View>
            </View>
            <View style={{ width: 1, backgroundColor: BORDER }} />
            <View style={{ flex: 1, padding: 9, flexDirection: 'row', alignItems: 'center' }}>
              <IconAvatarTile size={22} />
              <View style={{ marginLeft: 9, flex: 1 }}>
                <Label>Sent To</Label>
                <PartyBlock lines={toLines.length ? toLines : ['Not Provided']} />
              </View>
            </View>
          </View>

          {/* ── 4. CHANGE ORDER SUMMARY (3 cols) ────────────────────────────── */}
          <Section icon={<IconFileText size={11} color={TITLE_BLUE} />} title="Change Order Summary">
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingRight: 9, flexDirection: 'row' }}>
                <CircleTile size={26}>
                  <IconTag size={13} color={TITLE_BLUE} />
                </CircleTile>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Label style={{ marginBottom: 3 }}>Change Title</Label>
                  <Text
                    style={{
                      fontSize: VALUE_FONT,
                      fontWeight: 800,
                      color: TEXT_DARK,
                      lineHeight: BODY_LINE_HEIGHT,
                    }}
                  >
                    {clampText(data.changeTitle, MAX_SUMMARY_TITLE_CHARS)}
                  </Text>
                </View>
              </View>
              <View style={{ width: 1, backgroundColor: BORDER }} />
              <View style={{ flex: 1, paddingHorizontal: 9, flexDirection: 'row' }}>
                <View style={{ width: 26, height: 26 }}>
                  <IconAvatarTile size={26} />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Label style={{ marginBottom: 3 }}>Reason for Change</Label>
                  <Text
                    style={{
                      fontSize: VALUE_FONT,
                      fontWeight: 800,
                      color: TEXT_DARK,
                      lineHeight: BODY_LINE_HEIGHT,
                    }}
                  >
                    {clampText(data.reasonForChangeDisplay, MAX_REASON_IN_SUMMARY_CHARS)}
                  </Text>
                </View>
              </View>
              <View style={{ width: 1, backgroundColor: BORDER }} />
              <View style={{ flex: 1.4, paddingLeft: 9, flexDirection: 'row' }}>
                <CircleTile size={26}>
                  <IconFileText size={13} color={TITLE_BLUE} />
                </CircleTile>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Label style={{ marginBottom: 3 }}>Description of Change</Label>
                  <Text
                    style={{
                      fontSize: VALUE_FONT - 0.1,
                      color: TEXT_DARK,
                      lineHeight: DESC_LINE_HEIGHT,
                    }}
                  >
                    {descPlainClamped}
                  </Text>
                </View>
              </View>
            </View>
          </Section>

          {/* ── 5. COST BREAKDOWN ───────────────────────────────────────────── */}
          <Section
            icon={
              <CircleTile size={14} bg={ICON_TILE_BG}>
                <IconDollarSign size={9} color={TITLE_BLUE} />
              </CircleTile>
            }
            title="Cost Breakdown"
          >
            <ChangeOrderCostBreakdownSection
              breakdown={data.costBreakdown}
              originalContractAmountDisplay={data.originalContractAmountDisplay}
              changeOrderAmountDisplay={data.changeOrderAmountDisplay}
              revisedContractAmountDisplay={data.revisedContractAmountDisplay}
            />
          </Section>

          {/* ── 6. SCHEDULE IMPACT ──────────────────────────────────────────── */}
          <Section icon={<IconCalendar size={11} color={TITLE_BLUE} />} title="Schedule Impact">
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ScheduleCard
                tileBg={BLUE_TILE_BG}
                icon={<IconCalendar size={15} color={SCHED_BLUE} />}
                label="Original Duration"
                value={data.originalDurationDisplay}
              />
              <View style={{ paddingHorizontal: 6 }}>
                <IconArrowRight size={11} color={MUTED} />
              </View>
              <ScheduleCard
                tileBg={GREEN_TILE_BG}
                icon={<IconClockPlus size={15} color={SCHED_GREEN} />}
                label="Proposed Duration"
                value={data.proposedDurationDisplay}
              />
              <View style={{ paddingHorizontal: 6 }}>
                <IconArrowRight size={11} color={MUTED} />
              </View>
              <ScheduleCard
                tileBg={ORANGE_TILE_BG}
                icon={<IconCalendarCheck size={15} color={SCHED_ORANGE} />}
                label="New Duration"
                value={data.newDurationDisplay}
              />
            </View>
          </Section>

          {/* ── 7. ATTACHMENTS ──────────────────────────────────────────────── */}
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
                {attachmentRowsTruncated.map((row, ri) => (
                  <View
                    key={`att-${ri}`}
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
                      <View style={{ marginRight: 6 }}>{attachmentIcon(row.fileType)}</View>
                      <Text
                        style={{
                          fontSize: BASE_FONT,
                          color: TEXT_DARK,
                          lineHeight: BODY_LINE_HEIGHT,
                          flex: 1,
                        }}
                      >
                        {clampText(row.fileName || 'N/A', 52)}
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
                      {clampText(row.fileType || 'N/A', 14)}
                    </Text>
                  </View>
                ))}
                {data.attachments.length > MAX_ATTACHMENTS_ROWS ? (
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
                    +{data.attachments.length - MAX_ATTACHMENTS_ROWS} additional attachment(s) not listed
                  </Text>
                ) : null}
              </View>
            </Section>
          ) : null}

          {/* ── 8. APPROVAL / AUTHORIZATION  +  APPROVAL / RESPONSE LOG ────── */}
          <View style={{ flexDirection: 'row', marginBottom: SECTION_GAP }}>
            <Section
              icon={<IconShieldCheck size={11} color={TITLE_BLUE} />}
              title="Approval / Authorization"
              flex={38}
              marginBottom={0}
            >
              <View
                style={{
                  marginRight: 0,
                }}
              >
                <View style={{ marginBottom: 7 }}>
                  <Label style={{ marginBottom: 3 }}>Reviewed By</Label>
                  <Text style={{ fontSize: VALUE_FONT + 0.3, fontWeight: 800, color: TEXT_DARK }}>
                    {clampText(authReviewedBy, 48)}
                  </Text>
                  {authRole ? (
                    <Text style={{ fontSize: BASE_FONT - 0.4, color: MUTED, marginTop: 2 }}>
                      {clampText(authRole, 36)}
                    </Text>
                  ) : null}
                </View>
                <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 5 }} />
                <View style={{ flexDirection: 'row', marginTop: 5 }}>
                  <View style={{ flex: 1, paddingRight: 6 }}>
                    <Label style={{ marginBottom: 3 }}>Signature</Label>
                    {authSigUrl ? (
                      <Image
                        src={authSigUrl}
                        style={{
                          width: '100%',
                          height: 22,
                          objectFit: 'contain',
                          objectPosition: 'left center',
                        }}
                      />
                    ) : authSigName ? (
                      <Text
                        style={{
                          fontSize: VALUE_FONT,
                          fontFamily: 'Helvetica-Oblique',
                          color: TEXT_DARK,
                        }}
                      >
                        {clampText(authSigName, 24)}
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
                  <View style={{ flex: 1, paddingLeft: 6 }}>
                    <Label style={{ marginBottom: 3 }}>Date</Label>
                    <Text style={{ fontSize: VALUE_FONT, fontWeight: 800, color: TEXT_DARK }}>
                      {clampText(authDate || '—', 18)}
                    </Text>
                  </View>
                </View>
              </View>
            </Section>

            <View style={{ width: 8 }} />

            <Section
              icon={<IconUsersGroup size={11} color={TITLE_BLUE} />}
              title="Approval / Response Log"
              flex={62}
              marginBottom={0}
              bodyPadding={0}
            >
              <View>
                <View style={{ flexDirection: 'row', backgroundColor: '#f7f9fc' }}>
                  {([
                    { h: 'Name', w: '24%' },
                    { h: 'Role', w: '16%' },
                    { h: 'Action', w: '20%' },
                    { h: 'Signature', w: '22%' },
                    { h: 'Date', w: '18%' },
                  ] as const).map(({ h, w }, idx, arr) => (
                    <Text
                      key={h}
                      style={{
                        width: w,
                        fontSize: LABEL_FONT,
                        fontWeight: 700,
                        paddingHorizontal: 8,
                        paddingVertical: 7,
                        textTransform: 'uppercase',
                        color: TITLE_BLUE,
                        borderRightWidth: idx === arr.length - 1 ? 0 : 1,
                        borderRightColor: BORDER,
                        letterSpacing: 0.6,
                      }}
                    >
                      {h}
                    </Text>
                  ))}
                </View>
                {approvalRowsDisplayed.map((r, idx) => {
                  const action = (r.action || '').trim()
                  const isApproved = /^approved$/i.test(action)
                  const isRejected = /^rejected$/i.test(action)
                  return (
                    <View
                      key={`ap-${idx}`}
                      style={{
                        flexDirection: 'row',
                        borderTopWidth: 1,
                        borderTopColor: BORDER,
                        backgroundColor: '#ffffff',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          width: '24%',
                          fontSize: BASE_FONT - 0.2,
                          paddingHorizontal: 8,
                          paddingVertical: 8,
                          lineHeight: BODY_LINE_HEIGHT,
                          color: TEXT_DARK,
                          fontWeight: 700,
                        }}
                      >
                        {clampText(r.name, 28)}
                      </Text>
                      <Text
                        style={{
                          width: '16%',
                          fontSize: BASE_FONT - 0.2,
                          paddingHorizontal: 8,
                          paddingVertical: 8,
                          lineHeight: BODY_LINE_HEIGHT,
                          color: TEXT_DARK,
                        }}
                      >
                        {clampText(r.role, 20)}
                      </Text>
                      <View
                        style={{
                          width: '20%',
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          justifyContent: 'center',
                        }}
                      >
                        {isApproved || isRejected ? (
                          <Text
                            style={{
                              alignSelf: 'flex-start',
                              fontSize: LABEL_FONT,
                              fontWeight: 900,
                              backgroundColor: isApproved ? APPROVED_GREEN : '#dc2626',
                              color: '#ffffff',
                              paddingHorizontal: 9,
                              paddingVertical: 2.5,
                              borderRadius: 999,
                              textTransform: 'capitalize',
                              letterSpacing: 0.3,
                            }}
                          >
                            {action}
                          </Text>
                        ) : (
                          <Text style={{ fontSize: BASE_FONT - 0.2, color: TEXT_DARK }}>
                            {clampText(action || '—', 18)}
                          </Text>
                        )}
                      </View>
                      <CoApprovalLogSignatureCell
                        signatureUrl={r.signatureUrl}
                        signatureName={r.signatureName}
                      />
                      <Text
                        style={{
                          width: '18%',
                          fontSize: BASE_FONT - 0.2,
                          paddingHorizontal: 8,
                          paddingVertical: 8,
                          lineHeight: BODY_LINE_HEIGHT,
                          color: TEXT_DARK,
                        }}
                      >
                        {clampText(r.date, 16)}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </Section>
          </View>

          {/* ── 9. Footer (orange divider + navy band) ──────────────────────── */}
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
