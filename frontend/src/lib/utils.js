export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function formatConfidence(score) {
  return `${Math.round(score * 100)}%`
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fileExtension(name) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

export const SUPPORTED_FILE_EXTS = new Set(['pdf', 'docx'])