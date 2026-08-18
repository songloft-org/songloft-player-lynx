import { expect, test } from 'vitest'

import { activeNavPath, navPathOwns, showsMiniPlayer } from '../shell-navigation.js'

/**
 * Regression for the reported device bug: on every sub-page the whole nav bar went
 * dark, because the shell compared `pathname === dest.path`. The Flutter reference
 * (`shell_layout.dart:_getCurrentIndex`) matches by prefix and always resolves to
 * *some* tab; these pin that behaviour down.
 */

/** The three built-ins plus one enabled plugin tab, as the shell passes them. */
const NAV = ['/', '/library', '/settings', '/plugin/miot']

test('a tab root lights its own tab', () => {
  expect(activeNavPath('/', NAV)).toBe('/')
  expect(activeNavPath('/library', NAV)).toBe('/library')
  expect(activeNavPath('/settings', NAV)).toBe('/settings')
  expect(activeNavPath('/plugin/miot', NAV)).toBe('/plugin/miot')
})

test('settings sub-pages keep the settings tab lit', () => {
  // The reported case, plus the deepest route in the tree.
  expect(activeNavPath('/settings/plugins', NAV)).toBe('/settings')
  expect(activeNavPath('/settings/plugins/registry', NAV)).toBe('/settings')
  expect(activeNavPath('/settings/servers/edit/7', NAV)).toBe('/settings')
  // The groups split out of the settings list — each is its own route now.
  for (const p of ['/settings/appearance', '/settings/playback', '/settings/lyrics',
                   '/settings/data', '/settings/about', '/settings/diagnostics']) {
    expect(activeNavPath(p, NAV), p).toBe('/settings')
  }
})

test('library sub-pages and playlists keep the library tab lit', () => {
  expect(activeNavPath('/library/category/artist', NAV)).toBe('/library')
  expect(activeNavPath('/library/song/42', NAV)).toBe('/library')
  expect(activeNavPath('/library/add', NAV)).toBe('/library')
  // Playlists were folded into the library tab, mirroring the reference — even
  // though a playlist can be opened from Home.
  expect(activeNavPath('/playlists/7', NAV)).toBe('/library')
})

test('a plugin sub-route keeps its own plugin tab lit', () => {
  expect(activeNavPath('/plugin/miot/settings', NAV)).toBe('/plugin/miot')
})

test('Home does not own everything just by being a prefix', () => {
  // `/` is a prefix of every path, so it must not win by prefix matching.
  expect(navPathOwns('/', '/settings')).toBe(false)
  expect(navPathOwns('/', '/library/category/artist')).toBe(false)
})

test('an unrecognised route falls back to Home rather than lighting nothing', () => {
  // The old exact-match comparison left the bar dark here; the reference returns
  // index 0.
  expect(activeNavPath('/somewhere-new', NAV)).toBe('/')
})

test('the longest matching destination wins', () => {
  // Guards the sort: a shorter sibling must not shadow a nested plugin path.
  expect(activeNavPath('/plugin/miot', ['/', '/plugin', '/plugin/miot'])).toBe('/plugin/miot')
})

test('a tab that is not rendered cannot be lit', () => {
  // Plugin tabs come from config, so the shell may not render one at all.
  expect(activeNavPath('/plugin/miot', ['/', '/library', '/settings'])).toBe('/')
})

/**
 * `showsMiniPlayer` had no assertions at all until now. It is a whitelist, so a new
 * route is excluded by default — which is the wanted behaviour for settings, but
 * only by omission. These pin both directions so neither can drift silently.
 */
test('settings and its sub-pages never show the mini player', () => {
  for (const p of ['/settings', '/settings/appearance', '/settings/playback',
                   '/settings/lyrics', '/settings/data', '/settings/about',
                   '/settings/diagnostics', '/settings/eq', '/settings/library']) {
    expect(showsMiniPlayer(p), p).toBe(false)
  }
})

test('the browsing surfaces still show the mini player', () => {
  for (const p of ['/', '/library', '/library/category/artist', '/playlists/7']) {
    expect(showsMiniPlayer(p), p).toBe(true)
  }
})
