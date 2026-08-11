import { useEffect, useRef, useState } from '@lynx-js/react'

import { getScanApi } from '../api/index.js'
import {
  initialTreeState,
  withChildren,
  withExpandToggled,
  withLoadFailure,
  withLoading,
  withRootError,
  withRootLoaded,
  type DirectoryTreeState,
} from '../domain/directory-tree.js'

export interface DirectoryTreeActions {
  /** Toggle a branch; triggers a one-time fetch on first expand. */
  toggleExpand: (path: string, hasChildren: boolean) => void
  reloadRoot: () => void
}

/**
 * Imperative loader for the directory tree — batch 19.
 *
 * Deliberately **not** `useQuery` per node: the node count is unbounded, so
 * per-node hooks would mean an unbounded number of observers, and the global
 * `staleTime: 30_000` + `refetchOnMount` would refetch on every re-expand. The
 * desired failure semantics are also un-query-like — "silently cache an empty
 * array, never retry" — so a plain effect (same `let cancelled` shape as
 * `settings/pages/LogsPage.tsx`) is the better fit.
 *
 * All state transitions go through the pure reducers in
 * `domain/directory-tree.js`; this hook only sequences the async calls. Requests
 * are fired from the event handler, never from inside a `setState` updater (an
 * updater may run more than once and would duplicate the fetch), and in-flight
 * paths are tracked in a ref so a double tap cannot race past a stale closure.
 */
export function useDirectoryTree(): {
  tree: DirectoryTreeState
  actions: DirectoryTreeActions
} {
  const [tree, setTree] = useState<DirectoryTreeState>(initialTreeState)
  const [rootReloadKey, setRootReloadKey] = useState(0)
  const inFlight = useRef<string[]>([])

  useEffect(() => {
    let cancelled = false
    setTree((state) => ({ ...state, rootStatus: 'loading' }))
    void getScanApi()
      .getDirectories()
      .then((list) => {
        if (cancelled) return
        setTree((state) => withRootLoaded(state, list.directories, list.root))
      })
      .catch(() => {
        if (cancelled) return
        setTree(withRootError)
      })
    return () => {
      cancelled = true
    }
  }, [rootReloadKey])

  const toggleExpand = (path: string, hasChildren: boolean) => {
    const willOpen = !tree.expandedPaths.includes(path)
    setTree((state) => withExpandToggled(state, path))

    // Collapsing keeps the cache; only a first open needs a fetch.
    if (!willOpen || !hasChildren) return
    if (tree.childrenByPath[path] !== undefined) return
    if (inFlight.current.includes(path)) return

    inFlight.current = [...inFlight.current, path]
    setTree((state) => withLoading(state, path))

    const settle = () => {
      inFlight.current = inFlight.current.filter((p) => p !== path)
    }
    void getScanApi()
      .getDirectories(path)
      .then((list) => {
        settle()
        setTree((state) => withChildren(state, path, list.directories))
      })
      .catch(() => {
        settle()
        setTree((state) => withLoadFailure(state, path))
      })
  }

  const reloadRoot = () => {
    inFlight.current = []
    setTree(initialTreeState)
    setRootReloadKey((n) => n + 1)
  }

  return { tree, actions: { toggleExpand, reloadRoot } }
}
