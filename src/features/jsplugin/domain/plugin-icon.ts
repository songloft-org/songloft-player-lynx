/** Recognize SVG filenames, including icon URLs passed through the registry proxy. */
export function isSvgIcon(icon: string | undefined): boolean {
  const raw = (icon ?? '').trim()
  const [path, query] = raw.split('?', 2)
  if (path && path.toLowerCase().endsWith('.svg')) return true
  if (!query) return false
  for (const part of query.split('&')) {
    if (!part.startsWith('url=')) continue
    let target = part.slice(4)
    try {
      target = decodeURIComponent(target)
    } catch {
      // Malformed percent-encoding: use the raw value.
    }
    return target.split('?')[0]!.toLowerCase().endsWith('.svg')
  }
  return false
}
