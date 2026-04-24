const DEFAULT_BUCKET = 'document-attachments'

/** Resolve Supabase Storage object path from DB `attachments.storage_path` (URL or relative path). */
export function objectPathFromStoredPath(stored: string | null | undefined, bucket = DEFAULT_BUCKET): string | null {
  const s = typeof stored === 'string' ? stored.trim() : ''
  if (!s || s === '#') return null
  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      const u = new URL(s)
      const pub = `/object/public/${bucket}/`
      const pubIdx = u.pathname.indexOf(pub)
      if (pubIdx !== -1) {
        return decodeURIComponent(u.pathname.slice(pubIdx + pub.length).replace(/^\/+/, ''))
      }
      const sign = `/object/sign/${bucket}/`
      const signIdx = u.pathname.indexOf(sign)
      if (signIdx !== -1) {
        const after = u.pathname.slice(signIdx + sign.length).replace(/^\/+/, '')
        const q = after.indexOf('?')
        return decodeURIComponent(q === -1 ? after : after.slice(0, q))
      }
    } catch {
      return null
    }
  }
  return s.replace(/^\/+/, '')
}

export function attachmentsBucket() {
  return process.env.ATTACHMENTS_BUCKET || DEFAULT_BUCKET
}
