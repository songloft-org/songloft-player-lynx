import { describe, expect, test } from 'vitest'

import type { JSPlugin } from '../../../models/jsplugin.js'
import { applyPluginOrder } from '../data/plugin-order.js'

function fakePlugin(id: number, entryPath: string): JSPlugin {
  return {
    id,
    entryPath,
    name: entryPath,
    displayName: entryPath,
    isActive: true,
    icon: undefined,
  } as unknown as JSPlugin
}

/**
 * Ordering rules for the home plugin grid (songloft-org/songloft#463):
 *  - `order` is the persisted list of entry_paths (drag-drop result).
 *  - Any active plugin absent from `order` (fresh install) goes to the tail.
 *  - Empty `order` means "server has no preference yet" — fall back to the
 *    plugin list's natural order.
 *  - Duplicate or unknown entries in `order` do not crash the grid.
 */
describe('applyPluginOrder', () => {
  test('preserves natural order when the persisted list is empty', () => {
    const plugins = [fakePlugin(1, 'a'), fakePlugin(2, 'b'), fakePlugin(3, 'c')]
    expect(applyPluginOrder(plugins, []).map((p) => p.entryPath)).toEqual(['a', 'b', 'c'])
  })

  test('reorders to match the persisted list', () => {
    const plugins = [fakePlugin(1, 'a'), fakePlugin(2, 'b'), fakePlugin(3, 'c')]
    expect(applyPluginOrder(plugins, ['c', 'a', 'b']).map((p) => p.entryPath)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  test('appends plugins missing from the persisted list at the tail (fresh installs)', () => {
    const plugins = [fakePlugin(1, 'a'), fakePlugin(2, 'b'), fakePlugin(3, 'c'), fakePlugin(4, 'd')]
    // Only c/a are pinned; b/d were installed after the last drag — they land
    // at the end in their natural order rather than being dropped from view.
    expect(applyPluginOrder(plugins, ['c', 'a']).map((p) => p.entryPath)).toEqual([
      'c',
      'a',
      'b',
      'd',
    ])
  })

  test('ignores unknown entry_paths in the persisted list (uninstall races)', () => {
    // Between GET /jsplugins and GET /settings/plugin-order the user may have
    // uninstalled a plugin; the client must not crash before the backend
    // prunes on next PUT.
    const plugins = [fakePlugin(1, 'a'), fakePlugin(2, 'b')]
    expect(applyPluginOrder(plugins, ['ghost', 'a', 'b']).map((p) => p.entryPath)).toEqual([
      'a',
      'b',
    ])
  })

  test('deduplicates repeated entries in the persisted list', () => {
    const plugins = [fakePlugin(1, 'a'), fakePlugin(2, 'b')]
    expect(applyPluginOrder(plugins, ['a', 'a', 'b']).map((p) => p.entryPath)).toEqual(['a', 'b'])
  })
})
