/**
 * ReactLynx-backed implementation of `useSyncExternalStoreWithSelector`.
 *
 * `@tanstack/react-store` (pulled in by TanStack Router) imports this from the
 * `use-sync-external-store` package, whose CJS internals `require('react')` and
 * therefore drag in a second, real React 19 whose hooks have no dispatcher
 * under ReactLynx's Preact reconciler. In tests we alias
 * `use-sync-external-store/shim/with-selector` to this module so the selector
 * store runs entirely on ReactLynx hooks.
 *
 * The algorithm mirrors React's own reference implementation of the shim.
 */
import {
  useDebugValue,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from '@lynx-js/react'

export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot: (() => Snapshot) | undefined,
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (a: Selection, b: Selection) => boolean,
): Selection {
  const instRef = useRef<{ hasValue: boolean; value: Selection | null } | null>(
    null,
  )
  let inst: { hasValue: boolean; value: Selection | null }
  if (instRef.current === null) {
    inst = { hasValue: false, value: null }
    instRef.current = inst
  } else {
    inst = instRef.current
  }

  const [getSelection, getServerSelection] = useMemo(() => {
    let hasMemo = false
    let memoizedSnapshot: Snapshot
    let memoizedSelection: Selection
    const memoizedSelector = (nextSnapshot: Snapshot): Selection => {
      if (!hasMemo) {
        hasMemo = true
        memoizedSnapshot = nextSnapshot
        const nextSelection = selector(nextSnapshot)
        if (isEqual !== undefined && inst.hasValue) {
          const currentSelection = inst.value as Selection
          if (isEqual(currentSelection, nextSelection)) {
            memoizedSelection = currentSelection
            return currentSelection
          }
        }
        memoizedSelection = nextSelection
        return nextSelection
      }

      const prevSnapshot = memoizedSnapshot
      const prevSelection = memoizedSelection
      if (Object.is(prevSnapshot, nextSnapshot)) {
        return prevSelection
      }

      const nextSelection = selector(nextSnapshot)
      if (isEqual !== undefined && isEqual(prevSelection, nextSelection)) {
        memoizedSnapshot = nextSnapshot
        return prevSelection
      }

      memoizedSnapshot = nextSnapshot
      memoizedSelection = nextSelection
      return nextSelection
    }

    const maybeGetServerSnapshot = getServerSnapshot === undefined
      ? null
      : getServerSnapshot
    const getSnapshotWithSelector = () => memoizedSelector(getSnapshot())
    const getServerSnapshotWithSelector = maybeGetServerSnapshot === null
      ? undefined
      : () => memoizedSelector(maybeGetServerSnapshot())
    return [getSnapshotWithSelector, getServerSnapshotWithSelector] as const
  }, [getSnapshot, getServerSnapshot, selector, isEqual])

  const value = useSyncExternalStore(
    subscribe,
    getSelection,
    getServerSelection,
  )

  useEffect(() => {
    inst.hasValue = true
    inst.value = value
  }, [value])

  useDebugValue(value)
  return value
}
