import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Apple HIG Motion consumer gate (plan §10).
 *
 * `motion-tokens.test.ts` checks the tokens EXIST and that reduce-motion
 * zeroes them. This one checks the other half: that consumer CSS actually USES
 * them. A `transition:` / `animation:` declaration that names a bare duration
 * (`0.16s`, `200ms`) or a bare easing keyword (`ease`, `linear`,
 * `cubic-bezier(...)`) instead of `var(--duration-*)` / `var(--ease-*)` is a
 * regression — the app's motion language stops being uniform and reduce-motion
 * stops governing it (the class only zeroes the tokens, not raw values).
 *
 * The ONE exempted category is decorative infinite loops whose timing is
 * bespoke geometry, not a UI transition: tokenising them would alter the
 * intended motion (an equalizer's per-bar desync, a linear indeterminate
 * sweep). They are allowlisted by file below, and each allowlisted file is
 * asserted to contain ONLY its documented keyframe so the exemption cannot
 * silently cover a future UI transition added to the same file.
 */

const SRC = path.resolve(__dirname, '../../..')

const BESPOKE_LOOPS: Record<string, string[]> = {
  // Each bar runs a different duration so the bars desynchronise; a single
  // --duration token would homogenise them.
  'features/playlist/widgets/PlaylistsView.css': ['eq-bounce'],
  // `linear` is the deliberate curve for a constant-speed indeterminate sweep.
  'features/library-ops/pages/LibraryOpsPage.css': ['libops-indeterminate'],
}

function filesOf(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '__tests__') return []
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return filesOf(full, ext)
    return entry.endsWith(ext) ? [full] : []
  })
}

const PROPS = ['transition', 'animation', 'animation-duration', 'animation-timing-function']

/** Strip `var(--…)` references so a duration/keyword inside a token is ignored. */
function stripVars(value: string): string {
  // Repeat to handle nested var(), though consumer CSS never nests here.
  let prev = value
  let next = value.replace(/var\(--[\w-]+\)/g, '')
  while (next !== prev) {
    prev = next
    next = next.replace(/var\(--[\w-]+\)/g, '')
  }
  return next
}

const DURATION = /\b\d+(?:\.\d+)?m?s\b/
// `ease` is tested last so `ease-in`/`ease-out`/`ease-in-out` are matched
// literally first; every one of them is a violation on its own, so the order
// only affects the message, not the verdict.
const EASING = /\b(ease-in-out|ease-in|ease-out|ease|linear|step-start|step-end|cubic-bezier)\b/

function declarations(css: string): { prop: string, value: string }[] {
  // Drop comments, then split on `;`/`}` boundaries and keep prop:value pairs.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: { prop: string, value: string }[] = []
  for (const m of clean.matchAll(/([A-Za-z-]+)\s*:\s*([^;{}]+)/g)) {
    out.push({ prop: m[1]!, value: m[2]!.trim() })
  }
  return out
}

test('UI transitions/animations use --duration/--ease tokens, not bare values', () => {
  const violations: string[] = []

  for (const file of filesOf(SRC, '.css')) {
    const rel = path.relative(SRC, file).replaceAll(path.sep, '/')
    const css = readFileSync(file, 'utf8')
    const allowlistedKeyframes = BESPOKE_LOOPS[rel]
    if (allowlistedKeyframes) {
      // The exemption is narrow: the file may only contain its documented
      // keyframes. Any other keyframe here would widen the hole silently.
      const keyframesInFile = [...css.matchAll(/@(?:-[\w-]+-)?keyframes\s+([\w-]+)/g)].map((m) => m[1]!)
      const undocumented = keyframesInFile.filter((k) => !allowlistedKeyframes.includes(k))
      expect(undocumented, `${rel} is allowlisted for ${allowlistedKeyframes.join('/')} only; found other keyframes: ${undocumented.join(', ')}`).toEqual([])
    }

    for (const { prop, value } of declarations(css)) {
      if (!PROPS.includes(prop)) continue
      const stripped = stripVars(value)
      const rawDuration = DURATION.test(stripped)
      const rawEase = EASING.test(stripped)
      if (!rawDuration && !rawEase) continue
      // Exempt only the declared bespoke loops, and only on their own files.
      if (allowlistedKeyframes) continue
      violations.push(`${rel}: ${prop}: ${value}`)
    }
  }

  expect(
    violations,
    'raw motion timing found — use var(--duration-*) / var(--ease-*):\n' + violations.join('\n'),
  ).toEqual([])
})
