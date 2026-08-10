import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('useDebounce hook contract', () => {
  test('module exports useDebounce as a function', async () => {
    const mod = await import('../data/use-debounce.js')
    expect(typeof mod.useDebounce).toBe('function')
  })

  test('useDebounce relies on setTimeout for debouncing', () => {
    const source = readFileSync(
      resolve(__dirname, '../data/use-debounce.ts'),
      'utf-8',
    )
    expect(source).toContain('setTimeout')
    expect(source).toContain('clearTimeout')
  })
})

describe('debounce integration: search keyword passes through buildSongsQuery', () => {
  test('debounced keyword "jazz" appears in query', async () => {
    const { buildSongsQuery } = await import('../api/songs-api.js')
    const q = buildSongsQuery({ keyword: 'jazz', sort: 'added_at', order: 'desc' })
    expect(q.keyword).toBe('jazz')
  })

  test('empty debounced keyword is omitted from query', async () => {
    const { buildSongsQuery } = await import('../api/songs-api.js')
    const q = buildSongsQuery({ sort: 'added_at', order: 'desc' })
    expect(q).not.toHaveProperty('keyword')
  })

  test('debounce delay constant is between 300-500ms', () => {
    const source = readFileSync(
      resolve(__dirname, '../pages/LibraryPage.tsx'),
      'utf-8',
    )
    const match = source.match(/DEBOUNCE_MS\s*=\s*(\d+)/)
    expect(match).not.toBeNull()
    const ms = Number(match![1])
    expect(ms).toBeGreaterThanOrEqual(300)
    expect(ms).toBeLessThanOrEqual(500)
  })
})
