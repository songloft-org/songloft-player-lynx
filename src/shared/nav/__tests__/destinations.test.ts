import { expect, test } from 'vitest'

import type { PluginTabEntry } from '../../../features/jsplugin/data/tab-config.js'
import {
  buildNavDestinations,
  NAV_DESTINATIONS,
  NAV_MAX_VISIBLE,
  NAV_REAL_SLOTS,
} from '../destinations.js'

/**
 * `buildNavDestinations` assembles the live tab list the shell renders. It
 * mirrors the Flutter `ActiveDestinations.compute` order — Home first, Library
 * when enabled, one per plugin tab, Settings last — because that order is what
 * decides which tabs survive the narrow-bar fold (the first NAV_REAL_SLOTS) and
 * which land in the More sheet.
 */

function tab(entryPath: string, name = entryPath): PluginTabEntry {
  return { pluginId: 1, entryPath, name }
}

test('the built-ins alone keep the classic three-tab bar', () => {
  expect(buildNavDestinations(true, []).map((d) => d.path)).toEqual(['/', '/library', '/settings'])
})

test('settings is always the tail anchor, plugins sit before it', () => {
  const paths = buildNavDestinations(true, [tab('miot'), tab('weather')]).map((d) => d.path)
  expect(paths).toEqual(['/', '/library', '/plugin/miot', '/plugin/weather', '/settings'])
  expect(paths[paths.length - 1]).toBe('/settings')
})

test('showLibrary=false drops the library tab without touching the others', () => {
  expect(buildNavDestinations(false, [tab('miot')]).map((d) => d.path))
    .toEqual(['/', '/plugin/miot', '/settings'])
})

test('plugin destinations carry their tab entry; built-ins do not', () => {
  const miot = tab('miot', 'MIoT')
  const dests = buildNavDestinations(true, [miot])
  expect(dests[2]!.plugin).toBe(miot)
  expect(dests[0]!.plugin).toBeUndefined()
  expect(dests[1]!.plugin).toBeUndefined()
  expect(dests[3]!.plugin).toBeUndefined()
})

/**
 * The fold thresholds mirror `adaptive_scaffold.dart`'s `_mobileMaxVisible = 5`
 * and `_mobileRealSlots = 4`. They gate the shell's collapse, so a change here
 * is a product decision, not a refactor.
 */
test('the fold thresholds match the Flutter scaffold', () => {
  expect(NAV_MAX_VISIBLE).toBe(5)
  expect(NAV_REAL_SLOTS).toBe(4)
})

test('at most five tabs fit the narrow bar without folding', () => {
  // Exactly five: home + library + two plugins + settings.
  const five = buildNavDestinations(true, [tab('a'), tab('b')])
  expect(five).toHaveLength(5)
  expect(five.length > NAV_MAX_VISIBLE).toBe(false)
})

test('six or more tabs fold: the bar keeps the first four, the rest overflow', () => {
  const six = buildNavDestinations(true, [tab('a'), tab('b'), tab('c')])
  expect(six).toHaveLength(6)
  expect(six.length > NAV_MAX_VISIBLE).toBe(true)
  // What the bar still shows...
  expect(six.slice(0, NAV_REAL_SLOTS).map((d) => d.path))
    .toEqual(['/', '/library', '/plugin/a', '/plugin/b'])
  // ...and what the More sheet lists.
  expect(six.slice(NAV_REAL_SLOTS).map((d) => d.path))
    .toEqual(['/plugin/c', '/settings'])
})

test('without the library tab, a single plugin still fits five exactly', () => {
  const five = buildNavDestinations(false, [tab('a'), tab('b'), tab('c')])
  expect(five.map((d) => d.path))
    .toEqual(['/', '/plugin/a', '/plugin/b', '/plugin/c', '/settings'])
  expect(five.length).toBe(NAV_MAX_VISIBLE)
})

/** NAV_DESTINATIONS remains the seed `shell-navigation.ts` reads at import time. */
test('NAV_DESTINATIONS still lists the three built-ins', () => {
  expect(NAV_DESTINATIONS.map((d) => d.path)).toEqual(['/', '/library', '/settings'])
})
