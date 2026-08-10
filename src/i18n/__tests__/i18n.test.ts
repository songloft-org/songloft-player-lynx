import { describe, expect, test } from 'vitest'

import { createMemoryStorage } from '../../core/storage/index.js'
import { en, resources, zh } from '../resources.js'
import {
  changeAppLanguage,
  coerceAppLanguage,
  initI18n,
  PREF_LANGUAGE,
  readSavedLanguage,
  resolveLanguage,
} from '../index.js'

/** Recursively collect dotted leaf keys of a nested string tree. */
function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      flattenKeys(v, prefix ? `${prefix}.${k}` : k),
    )
  }
  return [prefix]
}

describe('resource completeness', () => {
  test('en and zh expose the exact same key set (no missing/extra keys)', () => {
    const enKeys = flattenKeys(en).sort()
    const zhKeys = flattenKeys(zh).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  test('every leaf in both languages is a non-empty string', () => {
    for (const tree of [en, zh]) {
      for (const key of flattenKeys(tree)) {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], tree)
        expect(typeof value, key).toBe('string')
        expect((value as string).length, key).toBeGreaterThan(0)
      }
    }
  })

  test('resources map wires each language under the default `translation` namespace', () => {
    expect(resources.en.translation).toBe(en)
    expect(resources.zh.translation).toBe(zh)
  })
})

describe('language coercion + resolution (pure)', () => {
  test('coerceAppLanguage accepts supported codes, else falls back to system', () => {
    expect(coerceAppLanguage('en')).toBe('en')
    expect(coerceAppLanguage('zh')).toBe('zh')
    expect(coerceAppLanguage(null)).toBe('system')
    expect(coerceAppLanguage(undefined)).toBe('system')
    expect(coerceAppLanguage('')).toBe('system')
    expect(coerceAppLanguage('fr')).toBe('system')
  })

  test('resolveLanguage maps system → default (en), else itself', () => {
    expect(resolveLanguage('system')).toBe('en')
    expect(resolveLanguage('en')).toBe('en')
    expect(resolveLanguage('zh')).toBe('zh')
  })
})

describe('changeAppLanguage (persists + switches i18next)', () => {
  test('a concrete language switches i18next and persists the choice', async () => {
    const storage = createMemoryStorage()
    initI18n()

    const resolved = await changeAppLanguage('zh', storage)
    expect(resolved).toBe('zh')
    // i18next now serves zh copy.
    expect(initI18n().t('nav.home')).toBe(zh.nav.home)
    // The choice is persisted.
    expect(await storage.prefs.get(PREF_LANGUAGE)).toBe('zh')
    expect(await readSavedLanguage(storage)).toBe('zh')

    // Switch back to English for later tests / assertions.
    await changeAppLanguage('en', storage)
    expect(initI18n().t('nav.home')).toBe(en.nav.home)
    expect(await storage.prefs.get(PREF_LANGUAGE)).toBe('en')
  })

  test('system removes the pref and applies the default language', async () => {
    const storage = createMemoryStorage()
    await storage.prefs.set(PREF_LANGUAGE, 'zh')

    const resolved = await changeAppLanguage('system', storage)
    expect(resolved).toBe('en')
    expect(await storage.prefs.get(PREF_LANGUAGE)).toBeNull()
    expect(await readSavedLanguage(storage)).toBe('system')
  })

  test('t interpolates the manual song-count keys (no Intl plural rules)', () => {
    const i18n = initI18n()
    void i18n.changeLanguage('en')
    expect(i18n.t('common.songCountOne', { count: 1 })).toBe('1 song')
    expect(i18n.t('common.songCountOther', { count: 5 })).toBe('5 songs')
  })
})
