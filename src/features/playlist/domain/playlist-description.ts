/** Hide only the recognized machine-only marker. Never rewrite stored descriptions. */
export function playlistDisplayDescription(description?: string): string {
  const text = description ?? ''
  return /^\[navidrome:[^:\]\r\n]+:[^\]\r\n]+\]$/.test(text.trim()) ? '' : text
}
