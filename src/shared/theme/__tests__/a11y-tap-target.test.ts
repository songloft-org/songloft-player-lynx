import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * HIG §8 Accessibility tap-target gate (plan §11.2).
 *
 * All interactive elements must be ≥ 44×44px (--tap-target). This static gate
 * scans every CSS file for height/min-height declarations on interactive
 * classes (.btn, .nav-item, .subpage__back, .popover-menu__item, etc.) and
 * asserts they meet the floor. It catches the regression where a future edit
 * shrinks a button or row below the HIG minimum.
 *
 * The gate is intentionally permissive about *which* rules it checks: it looks
 * for known interactive class names and verifies their height-related
 * declarations resolve to ≥ 44px. Classes not listed are not checked — the
 * gate is additive, not exhaustive.
 */

const SRC = path.resolve(__dirname, '../../..')
const TAP_TARGET = 44

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return cssFiles(full)
    return entry.endsWith('.css') ? [full] : []
  })
}

/** Parse a CSS value like "44px" or "var(--tap-target)" into px or null. */
function parsePx(value: string): number | null {
  const m = value.match(/^(\d+)px$/)
  if (m) return parseInt(m[1]!, 10)
  if (value.includes('var(--tap-target)')) return TAP_TARGET
  if (value.includes('var(--control-height)')) return TAP_TARGET
  return null
}

/** Interactive classes known to carry a height/min-height. */
const INTERACTIVE_PATTERNS = [
  /\.btn\b/,
  /\.nav-item\b/,
  /\.subpage__back\b/,
  /\.popover-menu__item\b/,
  /\.more-tabs__item\b/,
  // .app-switch__track is 51×31px (iOS UISwitch standard) — the parent
  // SettingsRow provides the 44px tap target, the track is a compound
  // control, not a standalone tappable.
]

test('all interactive elements with explicit height meet 44px tap target', () => {
  const files = cssFiles(SRC).filter((f) => !f.includes('node_modules'))
  const violations: string[] = []

  for (const file of files) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

    for (const pattern of INTERACTIVE_PATTERNS) {
      // Find each rule block for matching selectors
      const re = new RegExp(
        `(${pattern.source})\\s*\\{([^}]*)\\}`,
        'g',
      )
      for (const m of css.matchAll(re)) {
        const selector = m[1]!
        const body = m[2]!

        // Check height declarations
        const heightMatch = body.match(/(?:^|\s)height:\s*([^;]+);/)
        if (heightMatch) {
          const px = parsePx(heightMatch[1]!.trim())
          if (px !== null && px < TAP_TARGET && !body.includes('var(--tap-target)')) {
            violations.push(
              `${path.relative(SRC, file)}: ${selector} height=${heightMatch[1]!.trim()} < 44px`,
            )
          }
        }

        const minHeightMatch = body.match(/min-height:\s*([^;]+);/)
        if (minHeightMatch) {
          const px = parsePx(minHeightMatch[1]!.trim())
          if (px !== null && px < TAP_TARGET) {
            violations.push(
              `${path.relative(SRC, file)}: ${selector} min-height=${minHeightMatch[1]!.trim()} < 44px`,
            )
          }
        }
      }
    }
  }

  expect(violations, violations.join('\n')).toEqual([])
})
