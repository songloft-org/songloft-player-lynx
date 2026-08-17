import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Every `var(--x)` in the tree must resolve to a declared custom property.
 *
 * An undefined one fails **silently and invisibly**: the declaration is dropped,
 * the element keeps its inherited value, and nothing warns. Batch 51 found
 * `var(--on-primary)` in five places — the token does not exist, the real one is
 * `--primary-content` — and the consequences were not cosmetic:
 *
 * - the playlist grid's selection tick inherited `--content`, i.e. near-black on
 *   the `--primary` black fill, so in select mode you could not see which
 *   playlists you had picked;
 * - Home's empty-state "Browse library" button label was invisible in **both**
 *   themes (`--content` on `--primary` is near-black on black in light, near-white
 *   on white in dark).
 *
 * Screenshots of the wrong theme, or of an unselected state, show nothing amiss —
 * which is why this is a gate and not a review item.
 */

const SRC = path.resolve(__dirname, '../../..')

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return cssFiles(full)
    return entry.endsWith('.css') ? [full] : []
  })
}

/** Custom properties declared anywhere in the tree (tokens + local ones). */
function declaredProperties(files: string[]): Set<string> {
  const declared = new Set<string>()
  for (const file of files) {
    const css = readFileSync(file, 'utf8')
    for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) declared.add(m[1]!)
  }
  return declared
}

test('no stylesheet reads a custom property nobody declares', () => {
  const files = cssFiles(SRC)
  const declared = declaredProperties(files)

  const missing = new Set<string>()
  for (const file of files) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
      // `var(--x, fallback)` is fine even when `--x` is absent — that is what the
      // fallback is for — so only bare reads are flagged.
      const at = m.index! + m[0].length
      const rest = css.slice(at, css.indexOf(')', at))
      if (!rest.includes(',') && !declared.has(m[1]!)) missing.add(m[1]!)
    }
  }
  expect([...missing].sort()).toEqual([])
})

test('the theme really declares the token the invisible-tick bug should have used', () => {
  // Guards the fix itself: if `--primary-content` were ever renamed, the gate
  // above would still pass (the new name would be declared *and* used) while
  // every call site silently moved to a different colour.
  const tokens = readFileSync(path.join(SRC, 'shared/theme/tokens.css'), 'utf8')
  expect(tokens).toMatch(/--primary-content:/)
  expect(tokens).not.toMatch(/--on-primary:/)
})
