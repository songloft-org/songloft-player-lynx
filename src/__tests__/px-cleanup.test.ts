import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

import { expect, test } from 'vitest'

/**
 * P9 hardcoded-px cleanup. The three formerly-zero-token files (EqualizerPage,
 * ServerEditPage, ServerListPage) now tokenise their chrome; EqualizerPage's
 * band-graph drawing geometry is kept hardcoded on purpose (same call as the eq
 * bars / slider ticks / progress bars). The blanket `margin-top: 2px` is gone.
 */
const SRC = resolve(process.cwd(), 'src')

function css(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function ruleFor(cssStr: string, selector: string): string {
  const escaped = selector.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(cssStr)
  expect(m, `no rule for \`${selector}\``).not.toBeNull()
  return m![1]!
}

const EQ = css('features/player/pages/EqualizerPage.css')
const EDIT = css('features/settings/pages/ServerEditPage.css')
const LIST = css('features/settings/pages/ServerListPage.css')

test('the three formerly-zero-token files tokenise their chrome', () => {
  // EqualizerPage chrome: card radius, padding, gap, label fonts all tokenised.
  expect(ruleFor(EQ, '.eq-page__toggle-row')).toMatch(/border-radius:\s*var\(--radius-md\)/)
  expect(ruleFor(EQ, '.eq-page__toggle-row')).toMatch(/padding:\s*var\(--space-3\)\s+var\(--space-4\)/)
  expect(ruleFor(EQ, '.eq-page__toggle-label')).toMatch(/font-size:\s*var\(--font-body\)/)
  expect(ruleFor(EQ, '.eq-page__chip')).toMatch(/border-radius:\s*var\(--radius-pill\)/)
  // ServerEditPage / ServerListPage: spacing + radius + fonts tokenised.
  expect(ruleFor(EDIT, '.server-edit__card')).toMatch(/border-radius:\s*var\(--radius-md\)/)
  expect(ruleFor(EDIT, '.server-edit__label')).toMatch(/font-size:\s*var\(--font-footnote\)/)
  expect(ruleFor(LIST, '.server-list__empty')).toMatch(/padding:\s*var\(--space-10\)\s+var\(--space-4\)/)
})

test('EqualizerPage keeps its band-graph drawing geometry hardcoded', () => {
  // These are drawing parameters of the EQ graph, not design tokens — tokenising
  // them would only add indirection (P9 plan: keep eq/drawing geometry hardcoded).
  const thumb = ruleFor(EQ, '.eq-page__band-thumb')
  expect(thumb).toMatch(/width:\s*16px/)
  expect(thumb).toMatch(/height:\s*16px/)
  expect(ruleFor(EQ, '.eq-page__band-track')).toMatch(/width:\s*6px/)
  expect(ruleFor(EQ, '.eq-page__bands')).toMatch(/height:\s*200px/)
})

test('the three files carry no Muse colour aliases (EqualizerPage migrated in P9)', () => {
  const ALIAS = /var\(--(?:content|content-2|content-muted|paper|line|neutral-faint|primary|primary-content|primary-faint|danger|rule|fill-faint|canvas)\)/
  for (const c of [EQ, EDIT, LIST]) {
    expect(ALIAS.test(c), 'a formerly-zero-token file still carries a Muse alias').toBe(false)
  }
})

test('no stylesheet hardcodes margin-top: 2px (it is --space-half everywhere)', () => {
  // margin-top is layout spacing, never drawing geometry — so 2px here is always
  // a missed tokenisation. (gap/padding 2px can be drawing, so they are not gated.)
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name)
      return e.isDirectory() ? walk(full) : e.name.endsWith('.css') ? [full] : []
    })
  const offenders = walk(SRC)
    .map((f) => [f, readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')] as const)
    .filter(([, c]) => /margin-top:\s*2px/.test(c))
    .map(([f]) => f.split('/src/')[1])
  expect(offenders.sort(), 'hardcoded margin-top: 2px survives').toEqual([])
})

test('CacheManage control heights + ProxySettings radius are tokenised', () => {
  const cache = css('features/settings/pages/CacheManagePage.css')
  expect(ruleFor(cache, '.cache-manage__input')).toMatch(/height:\s*var\(--control-height\)/)
  expect(ruleFor(cache, '.cache-manage__save')).toMatch(/height:\s*var\(--control-height\)/)
  const proxy = css('features/settings/pages/ProxySettingsPage.css')
  expect(ruleFor(proxy, '.proxy-settings__save-btn')).toMatch(/border-radius:\s*var\(--radius-sm\)/)
})
