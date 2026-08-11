import { describe, expect, test } from 'vitest'

import type { DirEntry } from '../../../models/library-ops.js'
import {
  ROOT_KEY,
  childrenOf,
  initialTreeState,
  isExpanded,
  isLoading,
  needsLoad,
  nodeIndentPx,
  toggleSelected,
  withChildren,
  withExpandToggled,
  withLoadFailure,
  withLoading,
  withRootError,
  withRootLoaded,
} from '../domain/directory-tree.js'

const entry = (name: string, hasChildren = false): DirEntry => ({
  name,
  path: `/m/${name}`,
  hasChildren,
})

describe('root loading', () => {
  test('starts in the loading state with nothing cached', () => {
    const state = initialTreeState()
    expect(state.rootStatus).toBe('loading')
    expect(childrenOf(state, ROOT_KEY)).toEqual([])
  })

  test('withRootLoaded stores entries under the root key', () => {
    const state = withRootLoaded(initialTreeState(), [entry('rock')], '/m')
    expect(state.rootStatus).toBe('ready')
    expect(state.root).toBe('/m')
    expect(childrenOf(state, ROOT_KEY)).toEqual([entry('rock')])
  })

  test('withRootError only flips the status', () => {
    expect(withRootError(initialTreeState()).rootStatus).toBe('error')
  })
})

describe('needsLoad', () => {
  test('a leaf never loads', () => {
    expect(needsLoad(initialTreeState(), '/m/rock', false)).toBe(false)
  })

  test('a branch with nothing cached loads', () => {
    expect(needsLoad(initialTreeState(), '/m/rock', true)).toBe(true)
  })

  test('a branch already cached does not reload', () => {
    const state = withChildren(initialTreeState(), '/m/rock', [entry('60s')])
    expect(needsLoad(state, '/m/rock', true)).toBe(false)
  })

  test('a branch in flight does not double-load', () => {
    const state = withLoading(initialTreeState(), '/m/rock')
    expect(needsLoad(state, '/m/rock', true)).toBe(false)
  })

  /**
   * A failed load caches an empty array, which also makes `needsLoad` false —
   * so a permanently broken directory cannot spin in a retry loop.
   */
  test('a failed branch caches empty and does not retry', () => {
    const state = withLoadFailure(withLoading(initialTreeState(), '/m/rock'), '/m/rock')
    expect(childrenOf(state, '/m/rock')).toEqual([])
    expect(isLoading(state, '/m/rock')).toBe(false)
    expect(needsLoad(state, '/m/rock', true)).toBe(false)
  })
})

describe('loading bookkeeping', () => {
  test('withLoading is idempotent', () => {
    const once = withLoading(initialTreeState(), '/m/a')
    const twice = withLoading(once, '/m/a')
    expect(twice.loadingPaths).toEqual(['/m/a'])
    expect(twice).toBe(once)
  })

  test('withChildren clears the loading marker', () => {
    const state = withChildren(withLoading(initialTreeState(), '/m/a'), '/m/a', [entry('x')])
    expect(isLoading(state, '/m/a')).toBe(false)
    expect(childrenOf(state, '/m/a')).toEqual([entry('x')])
  })
})

describe('expansion', () => {
  test('toggles open and closed', () => {
    let state = initialTreeState()
    expect(isExpanded(state, '/m/a')).toBe(false)
    state = withExpandToggled(state, '/m/a')
    expect(isExpanded(state, '/m/a')).toBe(true)
    state = withExpandToggled(state, '/m/a')
    expect(isExpanded(state, '/m/a')).toBe(false)
  })

  /**
   * The Flutter version kept children in each node's widget state, so collapsing
   * destroyed the cache and re-expanding refetched. A flat cache makes
   * "lazy-load on *first* expand" literally true.
   */
  test('collapsing keeps the cached children', () => {
    let state = withChildren(initialTreeState(), '/m/a', [entry('x')])
    state = withExpandToggled(state, '/m/a')
    state = withExpandToggled(state, '/m/a')
    expect(childrenOf(state, '/m/a')).toEqual([entry('x')])
    expect(needsLoad(state, '/m/a', true)).toBe(false)
  })

  test('sibling branches expand independently', () => {
    let state = withExpandToggled(initialTreeState(), '/m/a')
    state = withExpandToggled(state, '/m/b')
    state = withExpandToggled(state, '/m/a')
    expect(isExpanded(state, '/m/a')).toBe(false)
    expect(isExpanded(state, '/m/b')).toBe(true)
  })
})

describe('toggleSelected', () => {
  test('adds, removes and never duplicates', () => {
    expect(toggleSelected([], '/m/a')).toEqual(['/m/a'])
    expect(toggleSelected(['/m/a'], '/m/b')).toEqual(['/m/a', '/m/b'])
    expect(toggleSelected(['/m/a', '/m/b'], '/m/a')).toEqual(['/m/b'])
    expect(toggleSelected(['/m/a'], '/m/a')).toEqual([])
  })

  test('does not mutate the input', () => {
    const input = ['/m/a']
    toggleSelected(input, '/m/b')
    expect(input).toEqual(['/m/a'])
  })
})

describe('nodeIndentPx', () => {
  test('mirrors the Flutter 8 + depth * 24 ramp', () => {
    expect(nodeIndentPx(0)).toBe(8)
    expect(nodeIndentPx(1)).toBe(32)
    expect(nodeIndentPx(2)).toBe(56)
  })
})
