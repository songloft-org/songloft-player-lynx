import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { createMemoryStorage } from '../../core/storage/index.js'
import {
  applySystemAppearance,
  setSystemAppearanceForTests,
} from '../../native/system-appearance.js'
import { en, resources, zh } from '../resources.js'
import {
  changeAppLanguage,
  coerceAppLanguage,
  DEFAULT_LANGUAGE,
  initI18n,
  languageFromLocale,
  PREF_LANGUAGE,
  readSavedLanguage,
  resolveLanguage,
} from '../index.js'

afterEach(() => {
  setSystemAppearanceForTests(null)
})

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

  /**
   * The two checks above only prove en and zh agree with *each other*. A key that
   * exists in neither slips through both, and i18next renders the key name — so
   * the logout dialog's cancel button literally read `common.cancel` on screen,
   * in both languages, until an audit spotted it.
   *
   * This walks the source for literal `t('…')` calls and requires each key to
   * exist. Template-literal keys (built at runtime) cannot be resolved statically
   * and are listed in `DYNAMIC_KEY_PREFIXES`; their leaves are covered by the
   * shape tests above.
   */
  test('every literal t() key in src/ exists in the resource tree', () => {
    const DYNAMIC_KEY_PREFIXES = ['settings.quality_', 'eq.preset_']
    const defined = new Set(flattenKeys(en))
    const srcDir = path.resolve(__dirname, '..', '..')

    const files: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.tsx?$/.test(entry.name)) files.push(full)
      }
    }
    walk(srcDir)

    const missing: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        const key = match[1]!
        if (defined.has(key)) continue
        if (DYNAMIC_KEY_PREFIXES.some((p) => key.startsWith(p))) continue
        missing.push(`${path.relative(srcDir, file)}: t('${key}')`)
      }
    }

    expect(files.length, 'no sources scanned — the walk is broken').toBeGreaterThan(100)
    expect(missing, 'these keys render as their own name in the UI').toEqual([])
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

  test('languageFromLocale matches on the primary subtag, case-insensitively', () => {
    expect(languageFromLocale('zh')).toBe('zh')
    expect(languageFromLocale('zh-CN')).toBe('zh')
    expect(languageFromLocale('zh-Hans-CN')).toBe('zh')
    expect(languageFromLocale('ZH-cn')).toBe('zh')
    // Android's legacy underscore form, in case a host reports it that way.
    expect(languageFromLocale('zh_TW')).toBe('zh')
    expect(languageFromLocale('en-US')).toBe('en')
    // A language we do not ship must not be invented — caller falls back.
    expect(languageFromLocale('fr-FR')).toBeNull()
    expect(languageFromLocale('')).toBeNull()
    expect(languageFromLocale(null)).toBeNull()
    expect(languageFromLocale(undefined)).toBeNull()
  })

  test('resolveLanguage returns an explicit choice unchanged', () => {
    setSystemAppearanceForTests({ theme: null, locale: 'zh-CN' })
    expect(resolveLanguage('en')).toBe('en')
    setSystemAppearanceForTests({ theme: null, locale: 'en-US' })
    expect(resolveLanguage('zh')).toBe('zh')
  })

  test('resolveLanguage("system") follows the host locale', () => {
    setSystemAppearanceForTests({ theme: null, locale: 'zh-CN' })
    expect(resolveLanguage('system')).toBe('zh')

    setSystemAppearanceForTests({ theme: null, locale: 'en-GB' })
    expect(resolveLanguage('system')).toBe('en')
  })

  test('resolveLanguage("system") falls back for an unshipped or absent locale', () => {
    setSystemAppearanceForTests({ theme: null, locale: 'fr-FR' })
    expect(resolveLanguage('system')).toBe(DEFAULT_LANGUAGE)

    setSystemAppearanceForTests({ theme: null, locale: null })
    expect(resolveLanguage('system')).toBe(DEFAULT_LANGUAGE)
  })
})

describe('following the host locale (bug.md: 语言跟随系统没效果)', () => {
  test('choosing "system" applies the host locale immediately, not the default', async () => {
    const storage = createMemoryStorage()
    setSystemAppearanceForTests({ theme: null, locale: 'zh-CN' })

    const resolved = await changeAppLanguage('system', storage)

    expect(resolved).toBe('zh')
    expect(initI18n().t('nav.home')).toBe(zh.nav.home)
    // Still stored as "follow the system", i.e. no pref.
    expect(await storage.prefs.get(PREF_LANGUAGE)).toBeNull()
  })

  test('a host locale change re-applies while the choice is system', async () => {
    const storage = createMemoryStorage()
    setSystemAppearanceForTests({ theme: null, locale: 'en-US' })
    await changeAppLanguage('system', storage)
    expect(initI18n().t('nav.home')).toBe(en.nav.home)

    applySystemAppearance({ theme: null, locale: 'zh-CN' })
    // changeLanguage resolves on a microtask.
    await Promise.resolve()

    expect(initI18n().t('nav.home')).toBe(zh.nav.home)
  })

  test('a host locale change is ignored while the user picked a language', async () => {
    const storage = createMemoryStorage()
    setSystemAppearanceForTests({ theme: null, locale: 'en-US' })
    await changeAppLanguage('en', storage)

    applySystemAppearance({ theme: null, locale: 'zh-CN' })
    await Promise.resolve()

    expect(initI18n().t('nav.home')).toBe(en.nav.home)
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
    expect(resolved).toBe(DEFAULT_LANGUAGE)
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
