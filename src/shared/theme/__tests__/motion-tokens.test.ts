import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Apple HIG Motion gate (plan §10).
 *
 * Verifies the duration/easing tokens landed in tokens.css and that the
 * reduce-motion class zeroes them — the CSS-side preparation for the host's
 * reduce-motion signal (not wired yet, but the class is ready).
 */

const TOKENS = readFileSync(
  path.resolve(__dirname, '../tokens.css'),
  'utf8',
)

const THEME_ROOT = TOKENS.match(/\.theme-root\s*\{([\s\S]*?)\n\}/)![1]!

function parseDeclarations(block: string): Record<string, string> {
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Record<string, string> = {}
  for (const m of clean.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]!] = m[2]!.trim()
  }
  return out
}

const decl = parseDeclarations(THEME_ROOT)

test('HIG motion duration tokens are present', () => {
  expect(decl['--duration-fast']).toBe('150ms')
  expect(decl['--duration-normal']).toBe('250ms')
  expect(decl['--duration-slow']).toBe('350ms')
})

test('HIG motion easing tokens are present', () => {
  expect(decl['--ease-default']).toBe('cubic-bezier(0.25, 0.1, 0.25, 1)')
  expect(decl['--ease-in']).toBe('cubic-bezier(0.42, 0, 1, 1)')
  expect(decl['--ease-out']).toBe('cubic-bezier(0, 0, 0.58, 1)')
  expect(decl['--ease-spring']).toBe('cubic-bezier(0.32, 0.72, 0, 1)')
})

test('reduce-motion class zeroes all three durations', () => {
  const rm = TOKENS.match(/\.theme-root\.reduce-motion\s*\{([\s\S]*?)\n\}/)
  expect(rm, '.theme-root.reduce-motion block not found').not.toBeNull()
  const rmDecl = parseDeclarations(rm![1]!)
  expect(rmDecl['--duration-fast']).toBe('0ms')
  expect(rmDecl['--duration-normal']).toBe('0ms')
  expect(rmDecl['--duration-slow']).toBe('0ms')
})
