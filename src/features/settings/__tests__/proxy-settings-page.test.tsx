import { expect, test, vi } from 'vitest'

import { AI_PROMPT } from '../pages/ProxySettingsPage.js'

/**
 * The "copy prompt to ask AI" affordance under the GitHub proxy field.
 *
 * Working GitHub mirrors come and go, which is why the Flutter reference offers a
 * prompt rather than a preset list that would rot. Two things have to hold: the
 * prompt must still ask for what makes an answer usable, and the copy must reach a
 * real clipboard — Lynx has none of its own, so this is the first consumer of the
 * platform module's `setClipboard` (whose presence on both native hosts is
 * enforced by `native-module-contract.test.ts`).
 *
 * There is no render test for the button: this page loads its four settings with
 * raw `fetch` inside an effect, and that loading gate never flushes in the
 * ReactLynx harness. Every other settings page goes through the api + query layer,
 * which mocks cleanly — see `docs/project/bugs.md`.
 */

test('the prompt asks for the things that make an answer usable', () => {
  // Ported verbatim from `github_proxy_dialog.dart`; these are the constraints
  // that separate a usable answer from a list of dead domains.
  expect(AI_PROMPT).toContain('raw.githubusercontent.com')
  expect(AI_PROMPT).toContain('github.com')
  // The shape the field actually needs: a prefix you concatenate, not an API.
  expect(AI_PROMPT).toContain('https://')
  expect(AI_PROMPT).toContain('免费')
})

test('copyToClipboard hands the text to the platform module', async () => {
  const setClipboard = vi.fn()
  const mods = { SongloftPlatform: { openURL: () => {}, setClipboard } }
  vi.stubGlobal('NativeModules', mods)

  const { copyToClipboard } = await import('../../../native/native-platform.js')
  copyToClipboard(AI_PROMPT)

  expect(setClipboard).toHaveBeenCalledWith(AI_PROMPT)
  vi.unstubAllGlobals()
  vi.resetModules()
})
