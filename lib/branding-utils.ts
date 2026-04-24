/** Normalize hex for CSS / React-PDF (#RGB or #RRGGBB). */
export function parseBrandingPrimaryColor(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim()
  if (!t) return null
  const hex = t.startsWith('#') ? t.slice(1) : t
  if (!/^[0-9a-fA-F]{3}$/.test(hex) && !/^[0-9a-fA-F]{6}$/.test(hex)) return null
  if (hex.length === 3) {
    const r = hex[0] + hex[0]
    const g = hex[1] + hex[1]
    const b = hex[2] + hex[2]
    return `#${r}${g}${b}`.toUpperCase()
  }
  return `#${hex}`.toUpperCase()
}

/** Slightly lighter accent line derived from primary (simple mix toward white). */
export function brandingAccentFromPrimary(primary: string): string {
  const p = parseBrandingPrimaryColor(primary)
  if (!p) return '#c37a29'
  const r = parseInt(p.slice(1, 3), 16)
  const g = parseInt(p.slice(3, 5), 16)
  const b = parseInt(p.slice(5, 7), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * 0.35)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
}
