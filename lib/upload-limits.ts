export const DOCUMENT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024

export const CLASH_GAP_MAX_BYTES = 50* 1024 * 1024

export function formatUploadSizeLimit(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024)
    return `${mb % 1 === 0 ? mb : mb.toFixed(1)} MB`
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
