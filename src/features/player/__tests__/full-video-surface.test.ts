import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

const TSX = readFileSync(resolve(__dirname, '../pages/FullVideoPage.tsx'), 'utf8')
const CSS = readFileSync(resolve(__dirname, '../pages/FullVideoPage.css'), 'utf8')

test('FullVideoPage root supplies fixed positioning inline, not via class', () => {
  // `position: fixed` in a class is dead on Lynx — the box collapses to 0×0 and
  // the controls never show. It must arrive through the inline style.
  expect(/\bstyle=\{\{\s*position:\s*'fixed'[\s\S]{0,120}top:\s*0[\s\S]{0,120}bottom:\s*0\s*\}\}/.test(TSX)).toBe(true)

  const root = CSS.match(/\.full-video\s*\{([\s\S]*?)\n\}/)
  expect(root).not.toBeNull()
  expect(root![1]).not.toMatch(/position:\s*fixed/)
})

test('FullVideoPage controls are absolutely anchored inside the fixed page', () => {
  const header = CSS.match(/\.full-video__header\s*\{([\s\S]*?)\n\}/)
  const controls = CSS.match(/\.full-video__controls\s*\{([\s\S]*?)\n\}/)
  const note = CSS.match(/\.full-video__note\s*\{([\s\S]*?)\n\}/)
  expect(header).not.toBeNull()
  expect(header![1]).toMatch(/position:\s*absolute/)
  expect(header![1]).toMatch(/top:\s*0/)
  expect(controls).not.toBeNull()
  expect(controls![1]).toMatch(/position:\s*absolute/)
  expect(controls![1]).toMatch(/bottom:\s*0/)
  expect(note).not.toBeNull()
  expect(note![1]).toMatch(/position:\s*absolute/)
})