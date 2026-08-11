import type { DirEntry } from '../../../models/library-ops.js'

/**
 * Pure state machine for the lazy-loading directory tree — batch 19.
 *
 * The Flutter reference (`shared/widgets/directory_tree_selector.dart`) kept each
 * node's children in that node's own widget state, so collapsing a branch
 * destroyed the cache and re-expanding refetched it. Here the cache is a **flat
 * map keyed by path**, which makes "lazy-load on *first* expand" actually true:
 * loaded once, kept for the life of the page. It also keeps the recursive
 * component purely presentational (props in, taps out), so all of this logic is
 * unit-testable without rendering.
 *
 * The root level is stored under the `''` key.
 */

export const ROOT_KEY = ''

export type RootStatus = 'loading' | 'error' | 'ready'

export interface DirectoryTreeState {
  rootStatus: RootStatus
  /** Loaded children per path; `''` holds the music root's first level. */
  childrenByPath: Record<string, DirEntry[]>
  expandedPaths: string[]
  loadingPaths: string[]
  /** Absolute music root reported by the backend (display only). */
  root: string
}

export function initialTreeState(): DirectoryTreeState {
  return {
    rootStatus: 'loading',
    childrenByPath: {},
    expandedPaths: [],
    loadingPaths: [],
    root: '',
  }
}

export function childrenOf(state: DirectoryTreeState, path: string): DirEntry[] {
  return state.childrenByPath[path] ?? []
}

export function isExpanded(state: DirectoryTreeState, path: string): boolean {
  return state.expandedPaths.includes(path)
}

export function isLoading(state: DirectoryTreeState, path: string): boolean {
  return state.loadingPaths.includes(path)
}

/**
 * Whether expanding `path` should trigger a fetch: only when it can have
 * children, has none cached, and is not already in flight. A failed load caches
 * an empty array, so this also prevents an endless retry loop on a broken node.
 */
export function needsLoad(
  state: DirectoryTreeState,
  path: string,
  hasChildren: boolean,
): boolean {
  if (!hasChildren) return false
  if (state.childrenByPath[path] !== undefined) return false
  return !state.loadingPaths.includes(path)
}

export function withLoading(state: DirectoryTreeState, path: string): DirectoryTreeState {
  if (state.loadingPaths.includes(path)) return state
  return { ...state, loadingPaths: [...state.loadingPaths, path] }
}

export function withChildren(
  state: DirectoryTreeState,
  path: string,
  entries: DirEntry[],
): DirectoryTreeState {
  return {
    ...state,
    childrenByPath: { ...state.childrenByPath, [path]: entries },
    loadingPaths: state.loadingPaths.filter((p) => p !== path),
  }
}

/** Failure caches an empty array — silent, and non-repeating (see `needsLoad`). */
export function withLoadFailure(
  state: DirectoryTreeState,
  path: string,
): DirectoryTreeState {
  return withChildren(state, path, [])
}

/** Toggle expansion. Collapsing deliberately keeps the cached children. */
export function withExpandToggled(
  state: DirectoryTreeState,
  path: string,
): DirectoryTreeState {
  const open = state.expandedPaths.includes(path)
  return {
    ...state,
    expandedPaths: open
      ? state.expandedPaths.filter((p) => p !== path)
      : [...state.expandedPaths, path],
  }
}

export function withRootLoaded(
  state: DirectoryTreeState,
  entries: DirEntry[],
  root: string,
): DirectoryTreeState {
  return {
    ...state,
    rootStatus: 'ready',
    childrenByPath: { ...state.childrenByPath, [ROOT_KEY]: entries },
    root,
  }
}

export function withRootError(state: DirectoryTreeState): DirectoryTreeState {
  return { ...state, rootStatus: 'error' }
}

/** Add/remove a path in the selection (used by the checkbox hit area). */
export function toggleSelected(selected: readonly string[], path: string): string[] {
  return selected.includes(path)
    ? selected.filter((p) => p !== path)
    : [...selected, path]
}

/** Row indent, mirroring the Flutter `8 + depth * 24`. */
export function nodeIndentPx(depth: number): number {
  return 8 + depth * 24
}
