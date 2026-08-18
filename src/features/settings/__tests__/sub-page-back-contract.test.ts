import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Source-level gate on how sub-pages hand their back action to `SubPageShell`.
 *
 * The shell shows a back arrow when `!embedded || onBack`, i.e. **an explicit
 * `onBack` survives inside the settings pane**. That is deliberate — About →
 * Licenses is an in-pane sibling swap and there the arrow is real work. But it
 * means `onBack` carries a meaning ("this back still matters in the pane") that a
 * plain route-back does not have.
 *
 * Passing a locally-built `() => navigate({ to: '/settings' })` as `onBack`
 * therefore re-introduces the dead key the shell exists to remove: in the wide
 * layout the settings list is already on screen and the router is already at
 * `/settings`, so the arrow does nothing. That shipped for Cache management and
 * the Equalizer, and was reported from the device.
 *
 * The rule this pins: a page may only forward an `onBack` it received **as a
 * prop** (that one comes from `SettingsDetailPane`, so it really is a pane swap).
 * A route-back belongs in `backTo`, which the shell hides when embedded.
 *
 * Checked against the source rather than by rendering because two of the three
 * offenders have no render test at all (the equalizer needs a NodesRef +
 * zustand harness), and this is exactly the kind of mistake that is invisible
 * until someone opens the pane on a wide screen.
 */

const PAGE_DIRS = [
  'src/features/settings/pages',
  'src/features/library-ops/pages',
  'src/features/jsplugin/pages',
]

function pageFiles(): Array<{ path: string; src: string }> {
  const out: Array<{ path: string; src: string }> = []
  for (const dir of PAGE_DIRS) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.tsx')) continue
      const path = join(dir, name)
      out.push({ path, src: readFileSync(path, 'utf8') })
    }
  }
  return out
}

/** The `<SubPageShell …>` opening tag, or null when the page does not use it. */
function shellProps(src: string): string | null {
  const open = src.indexOf('<SubPageShell')
  if (open === -1) return null
  // Props end at the first `>` that closes the tag. Attribute values here never
  // contain a bare `>`, so scanning to the first `\n    >` / `>` is sufficient.
  const rest = src.slice(open)
  const end = rest.search(/\n\s*>/)
  return end === -1 ? rest.slice(0, 400) : rest.slice(0, end)
}

describe('SubPageShell back-action contract', () => {
  const files = pageFiles().filter(f => f.src.includes('<SubPageShell'))

  test('at least the migrated sub-pages are covered', () => {
    // Guards the glob: if the directories or naming change, this test must not
    // quietly start checking nothing.
    expect(files.length).toBeGreaterThanOrEqual(12)
  })

  for (const { path, src } of files) {
    const props = shellProps(src)
    if (!props || !/\bonBack=/.test(props)) continue

    test(`${path} only forwards an onBack it received as a prop`, () => {
      // Accepted shapes:
      //   onBack={onBack}
      //   onBack={onBack ?? (() => …)}          — prop wins, fallback is the route
      //   onBack={goBack}  *only if* goBack itself dispatches on an `onBack` prop
      const usesPropDirectly = /onBack=\{\s*onBack\b/.test(props)
      const forwarded = /onBack=\{\s*(\w+)\s*\}/.exec(props)?.[1]
      const forwardsPropViaLocal =
        forwarded !== undefined &&
        new RegExp(`const ${forwarded} = \\([^)]*\\) => \\{[\\s\\S]{0,200}?\\bonBack\\b`).test(src)

      expect(
        usesPropDirectly || forwardsPropViaLocal,
        `${path} passes an onBack that is not derived from an \`onBack\` prop. A plain `
        + 'route-back must use `backTo` instead — as `onBack` it keeps the arrow visible '
        + 'inside the settings pane, where it is a dead key.',
      ).toBe(true)
    })
  }
})
