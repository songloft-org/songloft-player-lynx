import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { computeSurfaceRect } from '../pages/FullVideoPage.js'

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

test('FullVideoPage chrome (header + bottom + note) is anchored inside the fixed page', () => {
  const chrome = CSS.match(/\.full-video__chrome\s*\{([\s\S]*?)\n\}/)
  const header = CSS.match(/\.full-video__header\s*\{([\s\S]*?)\n\}/)
  const bottom = CSS.match(/\.full-video__bottom\s*\{([\s\S]*?)\n\}/)
  const note = CSS.match(/\.full-video__note\s*\{([\s\S]*?)\n\}/)
  expect(chrome).not.toBeNull()
  expect(chrome![1]).toMatch(/position:\s*absolute/)
  expect(header).not.toBeNull()
  expect(header![1]).toMatch(/position:\s*absolute/)
  expect(header![1]).toMatch(/top:\s*0/)
  expect(bottom).not.toBeNull()
  expect(bottom![1]).toMatch(/position:\s*absolute/)
  expect(bottom![1]).toMatch(/bottom:\s*0/)
  expect(note).not.toBeNull()
  expect(note![1]).toMatch(/position:\s*absolute/)
})

test('FullVideoPage chrome fades via opacity so the auto-hide transition is animatable', () => {
  const chrome = CSS.match(/\.full-video__chrome\s*\{([\s\S]*?)\n\}/)
  const hidden = CSS.match(/\.full-video__chrome--hidden\s*\{([\s\S]*?)\n\}/)
  expect(chrome![1]).toMatch(/opacity:\s*1/)
  expect(chrome![1]).toMatch(/transition:\s*opacity/)
  expect(hidden).not.toBeNull()
  expect(hidden![1]).toMatch(/opacity:\s*0/)
})

test('computeSurfaceRect letterboxes when fit, crops when zoomed', () => {
  // 1920×1080 landscape into a 400×800 portrait container.
  const fit = computeSurfaceRect({ width: 1920, height: 1080 }, { width: 400, height: 800 }, 'fit')
  expect(fit.width).toBeCloseTo(400)
  expect(fit.height).toBeCloseTo(225)
  expect(fit.x).toBeCloseTo(0)
  expect(fit.y).toBeCloseTo((800 - 225) / 2)

  const zoom = computeSurfaceRect({ width: 1920, height: 1080 }, { width: 400, height: 800 }, 'zoom')
  // zoom keeps the height matching and overflows horizontally.
  expect(zoom.height).toBeCloseTo(800)
  expect(zoom.width).toBeCloseTo(1422.22, 1)
  expect(zoom.y).toBeCloseTo(0)
  expect(zoom.x).toBeLessThan(0)
})

test('computeSurfaceRect degrades safely when inputs are zero', () => {
  const rect = computeSurfaceRect({ width: 0, height: 0 }, { width: 400, height: 800 }, 'fit')
  expect(rect).toEqual({ x: 0, y: 0, width: 400, height: 800 })
})
