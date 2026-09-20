import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * iOS Liquid Glass platform-override gate.
 *
 * `BackdropBlur` opts iOS into the native iOS-26 `UIGlassEffect` material
 * (`blur-effect: 'glass'`). For that material to actually show, the CSS fill
 * above the blur layer has to come down — the 0.85/0.72 baseline would cover it
 * to 15–28%. The override lives in `tokens.css` as `.theme-root.theme-<name>
 * .platform-ios` blocks that lower `--material-fill*` (and the rim/highlight that
 * a thinner glass needs), mirroring the `ultra-thin` row of
 * `material-tokens.ts`.
 *
 * What this gate pins, and why each is a silent failure otherwise:
 *
 *  - **The override exists for both themes.** Drop one and iOS renders half the
 *    app at the baseline fill — the dark bar bright, the light bar correct,
 *    with no error.
 *  - **The override's alpha is below the baseline.** A value that drifts back up
 *    to 0.85 hides the native material again, which is the exact bug opting into
 *    it was meant to fix, and the CSS stays valid while it happens.
 *  - **The baseline is unchanged.** The non-iOS platforms (Android/Web/Harmony)
 *    still render the baseline fills, which `contrast.test.ts` derives its
 *    worst case from. If the override accidentally landed *in* the base block,
 *    every non-iOS surface would lose contrast with no signal here.
 *
 * What is deliberately NOT asserted here: contrast. On iOS the surface behind
 * text is a native vibrancy layer, not a CSS composite, so `contrast.test.ts`'s
 * uniform-extreme model does not apply — readability is the native material's
 * job and is verified on-device. This gate is the structural contract that
 * carries that split; the iOS-native track is exempt from CSS contrast by
 * design, not by omission.
 */

const TOKENS_CSS = readFileSync(
  path.resolve(__dirname, '../tokens.css'),
  'utf8',
)

/** Parse the rgba(...) alpha tail of a declaration value, or 1 for a hex. */
function alpha(value: string): number {
  const m = value.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/)
  return m ? Number(m[1]!) : 1
}

/** One `.theme-root.theme-<name>.platform-ios` block's colour declarations. */
function platformBlock(theme: 'light' | 'dark'): Record<string, string> {
  const re = new RegExp(
    `\\.theme-root\\.theme-${theme}\\.platform-ios\\s*\\{([\\s\\S]*?)\\}`,
  )
  const m = TOKENS_CSS.match(re)
  expect(m, `theme-${theme}.platform-ios block exists`).not.toBeNull()
  const out: Record<string, string> = {}
  for (const line of m![1]!.split('\n')) {
    const d = line.match(/^\s*(--[\w-]+):\s*([^;]+);/)
    if (d) out[d[1]!] = d[2]!.trim()
  }
  return out
}

/** The baseline `.theme-root.theme-<name>` block's declaration for a token. */
function baselineDecl(theme: 'light' | 'dark', token: string): string {
  const re = new RegExp(
    `\\.theme-root\\.theme-${theme}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
  )
  const m = TOKENS_CSS.match(re)
  expect(m, `theme-${theme} baseline block exists`).not.toBeNull()
  const d = m![1]!.match(new RegExp(`(${token}):\\s*([^;]+);`))
  expect(d, `--${token} declared in baseline theme-${theme}`).not.toBeNull()
  return d![2]!.trim()
}

const GLASS_FILL_KEYS = ['--material-fill', '--material-fill-elevated'] as const

test.each(['light', 'dark'] as const)(
  '%s: the platform-ios override lowers every glass fill below its baseline',
  (theme) => {
    const ios = platformBlock(theme)
    for (const key of GLASS_FILL_KEYS) {
      const iosAlpha = alpha(ios[key]!)
      const baseAlpha = alpha(baselineDecl(theme, key))
      expect(
        iosAlpha,
        `iOS ${key} (a${iosAlpha}) must be below the baseline (a${baseAlpha})`,
      ).toBeLessThan(baseAlpha)
    }
  },
)

test.each(['light', 'dark'] as const)(
  '%s: the platform-ios override carries the full thinner-material texture',
  (theme) => {
    const ios = platformBlock(theme)
    for (const key of [
      '--material-fill',
      '--material-fill-elevated',
      '--material-border',
      '--material-highlight',
    ] as const) {
      expect(ios[key], `${key} declared in theme-${theme}.platform-ios`).toBeTruthy()
    }
  },
)

test.each(['light', 'dark'] as const)(
  '%s: the baseline glass fill is untouched (non-iOS stays gated)',
  (theme) => {
    // The non-iOS platforms render the baseline. If the override leaked into
    // the base block, contrast.test.ts would still pass its own model while
    // the real Android/Web fill quietly dropped.
    expect(alpha(baselineDecl(theme, '--material-fill'))).toBeGreaterThanOrEqual(0.8)
    expect(alpha(baselineDecl(theme, '--material-fill-elevated'))).toBeGreaterThanOrEqual(0.7)
  },
)
