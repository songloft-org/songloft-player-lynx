import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import {
  isFullVideoActive,
  setFullVideoActive,
  subscribeFullVideoActive,
} from '../video-surface-model.js'

const TOKENS = readFileSync(resolve(__dirname, '../tokens.css'), 'utf8')

describe('video surface model', () => {
  afterEach(() => setFullVideoActive(false))

  test('toggles once and notifies subscribers', () => {
    const seen: boolean[] = []
    const unsubscribe = subscribeFullVideoActive(seen.push.bind(seen))
    expect(isFullVideoActive()).toBe(false)

    setFullVideoActive(true)
    expect(isFullVideoActive()).toBe(true)
    expect(seen).toEqual([true])

    // Repeated same value is a no-op — no extra re-renders.
    setFullVideoActive(true)
    expect(seen).toEqual([true])

    unsubscribe()
    setFullVideoActive(false)
    expect(seen).toEqual([true])
  })
})

test('full-video class stops the theme-root background from covering the host surface', () => {
  const block = TOKENS.match(/\.theme-root\.full-video\s*\{([\s\S]*?)\n\}/)
  expect(block).not.toBeNull()
  expect(block![1]).toMatch(/background-color:\s*transparent/)
  expect(block![1]).not.toMatch(/var\(--system-background\)/)
})