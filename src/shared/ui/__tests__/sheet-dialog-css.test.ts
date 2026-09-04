import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

import { expect, test } from 'vitest'

/**
 * P8a dialog / sheet / menu migrations + the codebase-wide alias sweep, pinned.
 * P8b (Apple alert geometry) is deliberately deferred — the dialog magic numbers
 * (124/168/440) are untouched, gated by `confirm-dialog-overlay.test.ts`.
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

test('the three drawer handles are unified to 36×5, radius 2.5', () => {
  for (const [rel, sel] of [
    ['features/player/widgets/SheetShell.css', '.drawer__handle'],
    ['features/playlist/widgets/AddToPlaylistSheet.css', '.atp__handle'],
    ['shared/nav/MoreTabsSheet.css', '.more-tabs__handle'],
  ] as const) {
    const body = ruleFor(css(rel), sel)
    expect(body, `${rel} ${sel} width`).toMatch(/width:\s*36px/)
    expect(body, `${rel} ${sel} height`).toMatch(/height:\s*5px/)
    expect(body, `${rel} ${sel} radius`).toMatch(/border-radius:\s*2\.5px/)
  }
})

test('sheet / drawer top corners use --radius-sheet, not the 28px xl', () => {
  // A bottom sheet's top corners are the one place the large 28 was used; P8a
  // shrank it to 10 (--radius-sheet, flagged for device visual review). No CSS
  // should still reference var(--radius-xl) — the token stays declared (it is
  // pinned in tokens-hig and may be reused), just unconsumed.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name)
      return e.isDirectory() ? walk(full) : e.name.endsWith('.css') ? [full] : []
    })
  const offenders = walk(join(SRC, 'features'))
    .concat(walk(join(SRC, 'shared')))
    .map((f) => [f, readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')] as const)
    .filter(([, c]) => /var\(--radius-xl\)/.test(c))
    .map(([f]) => f.split('/src/')[1])
  expect(offenders.sort(), 'no sheet should still use --radius-xl').toEqual([])
})

test('slider / progress tracks and page dots use a fill, not the opaque separator', () => {
  // The blanket --rule→--opaque-separator sweep preserved values but left tracks
  // on the separator colour; tracks are on-material fills (the ProgressBar
  // precedent from P6). --opaque-separator is for hairlines/dividers only.
  for (const [rel, sel] of [
    ['features/settings/widgets/SizeLimitSlider.css', '.size-limit-slider__track'],
    ['features/player/widgets/VolumeControl.css', '.player-volume__track'],
    ['features/player/widgets/PageDots.css', '.page-dots__dot'],
    ['features/library-ops/pages/LibraryOpsPage.css', '.libops-progress'],
  ] as const) {
    expect(
      ruleFor(css(rel), sel),
      `${rel} ${sel} must be a fill, not --opaque-separator`,
    ).toMatch(/background-color:\s*var\(--tertiary-system-fill\)/)
  }
})

test('no Muse colour aliases survive anywhere except EqualizerPage + PlayerBackdrop', () => {
  // The codebase-wide sweep in P8 migrated every other CSS file. EqualizerPage
  // is P9 (zero tokens, whole-file), PlayerBackdrop is the protected scrim.
  const ALIAS = /var\(--(?:content|content-2|content-muted|paper|line|neutral-faint|primary|primary-content|primary-faint|danger|rule|fill-faint)\)/
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name)
      return e.isDirectory() ? walk(full) : e.name.endsWith('.css') ? [full] : []
    })
  const offenders = walk(SRC)
    .map((f) => [f, readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')] as const)
    .filter(([, c]) => ALIAS.test(c))
    .filter(([f]) => !/(EqualizerPage|PlayerBackdrop)\.css$/.test(f))
    .map(([f]) => f.split('/src/')[1])
  expect(offenders.sort(), 'unmigrated Muse colour aliases').toEqual([])
})
