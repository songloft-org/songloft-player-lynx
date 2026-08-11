/**
 * Pure domain logic for the exclude-dir manager — batch 26. Ports the Flutter
 * `ExcludeDirManager` (`features/settings/presentation/widgets/exclude_dir_manager.dart`)
 * three-tab model: exclude-by-name, exclude-by-path, auto-create-playlist excludes.
 */

export const EXCLUDE_TABS = ['name', 'path', 'autoCreate'] as const
export type ExcludeTab = (typeof EXCLUDE_TABS)[number]

export function excludeTabLabelKey(tab: ExcludeTab): string {
  switch (tab) {
    case 'path':
      return 'libops.excludeTabPath'
    case 'autoCreate':
      return 'libops.excludeTabAutoCreate'
    default:
      return 'libops.excludeTabName'
  }
}

/**
 * Autocomplete candidates for the name-exclude tab: case-insensitive substring
 * match against `query`, already-excluded names dropped, capped at `limit`.
 * Mirrors the Flutter `Autocomplete.optionsBuilder`. An empty query yields no
 * suggestions (matches Flutter — a full alphabetical dump is not useful).
 */
export function filterDirNameSuggestions(
  allNames: readonly string[],
  query: string,
  excluded: readonly string[],
  limit = 8,
): string[] {
  const trimmed = query.trim().toLowerCase()
  if (trimmed.length === 0) return []
  const out: string[] = []
  for (const name of allNames) {
    if (out.length >= limit) break
    if (excluded.includes(name)) continue
    if (name.toLowerCase().includes(trimmed)) out.push(name)
  }
  return out
}

/**
 * Display form of an excluded path, relative to the music root — mirrors
 * Flutter's `path.startsWith(_musicPath) ? path.substring(_musicPath.length) :
 * path`. Strips exactly one leading separator so `music/a` under root `music`
 * shows as `a`, not `/a`; an empty result (path === root) shows as `/`.
 */
export function relativeToRoot(path: string, root: string): string {
  if (root.length === 0 || !path.startsWith(root)) return path
  const rest = path.slice(root.length).replace(/^[/\\]/, '')
  return rest.length > 0 ? rest : '/'
}
