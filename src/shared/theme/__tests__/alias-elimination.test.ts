import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

import { expect, test } from 'vitest'

/**
 * P10's hard checkpoint: no stylesheet references a deleted Muse colour alias.
 *
 * `tokens-hig.test.ts` proves the declarations are gone from `tokens.css`; this
 * proves no CSS still *consumes* one. Lynx drops an unrecognised custom-property
 * reference silently (the element inherits), so a reintroduced `var(--content)`
 * would render with the parent's colour and no test would notice except this one.
 *
 * The legacy `--font-*` scale is NOT gated here — those tokens are still
 * declared and consumed (a font-role sweep is the next retirement, not done in
 * P10). Only the colour aliases are gone.
 */
const SRC = resolve(process.cwd(), 'src')

const DELETED_ALIASES = [
  'canvas', 'paper', 'paper-clear',
  'content', 'content-2', 'content-muted',
  'primary', 'primary-content', 'primary-faint',
  'danger', 'danger-content', 'danger-2',
  'neutral-faint', 'line', 'rule', 'fill-faint',
] as const

function walkCss(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    return e.isDirectory() ? walkCss(full) : e.name.endsWith('.css') ? [full] : []
  })
}

test('no stylesheet references a deleted Muse colour alias', () => {
  const pattern = new RegExp(`var\\(--(?:${DELETED_ALIASES.join('|')})\\b`)
  const offenders = walkCss(SRC)
    .map((f) => [f, readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')] as const)
    .filter(([, css]) => pattern.test(css))
    .map(([f]) => f.split('/src/')[1])
  expect(
    offenders.sort(),
    'a stylesheet still consumes a Muse colour alias deleted in P10',
  ).toEqual([])
})

test('no stylesheet uses --primary-2 (deleted in P0, never aliased)', () => {
  // P0 deleted --primary-2 outright (zero consumers, identical to --primary).
  // It never had an alias, so a reference now resolves to nothing.
  const offenders = walkCss(SRC)
    .map((f) => [f, readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')] as const)
    .filter(([, css]) => /var\(--primary-2\b/.test(css))
    .map(([f]) => f.split('/src/')[1])
  expect(offenders.sort(), 'a stylesheet references the deleted --primary-2').toEqual([])
})
