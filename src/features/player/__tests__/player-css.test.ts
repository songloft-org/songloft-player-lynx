import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

/**
 * P6 player migrations, pinned where they silently regress. The capsule glass
 * form, the scrim alphas, the z-index stack and the inline play-button sizing
 * are all intentionally untouched (AGENTS / plan: don't move them); this gates
 * the typography / radius / colour changes that did land.
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

const FULL = css('features/player/pages/FullPlayerPage.css')
const PLAY = css('features/player/widgets/PlayControls.css')
const PROG = css('features/player/widgets/ProgressBar.css')
const MINI = css('features/player/widgets/MiniPlayer.css')

test('the full-player cover and meta moved to Apple Music form', () => {
  expect(ruleFor(FULL, '.full-player__cover')).toMatch(/border-radius:\s*var\(--radius-md\)/)
  expect(ruleFor(FULL, '.full-player__cover-img')).toMatch(/border-radius:\s*var\(--radius-md\)/)
  // Title down to title2; artist UP to title2 regular + accent (a link, not dim).
  expect(ruleFor(FULL, '.full-player__title')).toMatch(/font-size:\s*var\(--font-title2\)/)
  const artist = ruleFor(FULL, '.full-player__artist')
  expect(artist).toMatch(/font-size:\s*var\(--font-title2\)/)
  expect(artist).toMatch(/font-weight:\s*var\(--weight-regular\)/)
  expect(artist).toMatch(/color:\s*var\(--accent\)/)
  // Album & eyebrow: footnote / caption1, semibold (not bold) eyebrow.
  expect(ruleFor(FULL, '.full-player__album')).toMatch(/font-size:\s*var\(--font-footnote\)/)
  expect(ruleFor(FULL, '.full-player__eyebrow')).toMatch(/font-weight:\s*var\(--weight-semibold\)/)
})

test('the video badge / note geometry is tokenized, not hardcoded', () => {
  for (const sel of ['.full-player__video-badge', '.full-player__video-note']) {
    const body = ruleFor(FULL, sel)
    expect(body, `${sel} no hardcoded 8px`).not.toMatch(/:\s*8px/)
  }
  expect(ruleFor(FULL, '.full-player__video-badge-text')).toMatch(
    /font-size:\s*var\(--font-footnote\)/,
  )
  expect(ruleFor(FULL, '.full-player__video-note')).toMatch(
    /font-size:\s*var\(--font-caption1\)/,
  )
})

test('the mode label is caption2 + space-half, not hardcoded 10/2px', () => {
  const label = ruleFor(PLAY, '.player-controls__mode-label')
  expect(label).toMatch(/font-size:\s*var\(--font-caption2\)/)
  expect(label).toMatch(/margin-top:\s*var\(--space-half\)/)
  expect(label, 'no leftover hardcoded 10px/2px').not.toMatch(/:\s*(10|2)px/)
})

test('the progress rail + thumb use the Apple fills, the thumb white', () => {
  expect(ruleFor(PROG, '.player-progress__track')).toMatch(
    /background-color:\s*var\(--tertiary-system-fill\)/,
  )
  // Thumb is white on the accent indicator (a knob, not accent-on-accent).
  expect(ruleFor(PROG, '.player-progress__thumb')).toMatch(/background-color:\s*#ffffff/)
  expect(ruleFor(PROG, '.player-progress__thumb')).toMatch(/box-shadow:\s*var\(--shadow-sm\)/)
  // The played indicator rides the accent.
  expect(ruleFor(PROG, '.player-progress__indicator')).toMatch(/background-color:\s*var\(--accent\)/)
})

test('the mini-player typography + cover radius + progress rail migrated', () => {
  const title = ruleFor(MINI, '.mini-player__title')
  expect(title).toMatch(/font-size:\s*var\(--font-subhead\)/)
  expect(title).toMatch(/font-weight:\s*var\(--weight-regular\)/)
  expect(ruleFor(MINI, '.mini-player__subtitle')).toMatch(/margin-top:\s*var\(--space-half\)/)
  expect(ruleFor(MINI, '.mini-player__cover')).toMatch(/border-radius:\s*var\(--radius-xs\)/)
  expect(ruleFor(MINI, '.mini-player__progress')).toMatch(
    /background-color:\s*var\(--quaternary-system-fill\)/,
  )
})

test('no Muse colour aliases survive in the four player files (Equalizer/Backdrop excluded)', () => {
  // EqualizerPage is P9 (zero tokens) and PlayerBackdrop is the scrim the plan
  // protects; the four P6 files plus the swept player widgets must be clean.
  const ALIAS = /var\(--(?:content|content-2|content-muted|paper|line|neutral-faint|primary|primary-content|primary-faint|danger|rule)\)/
  for (const rel of [
    'features/player/pages/FullPlayerPage.css',
    'features/player/widgets/PlayControls.css',
    'features/player/widgets/ProgressBar.css',
    'features/player/widgets/MiniPlayer.css',
  ]) {
    expect(ALIAS.test(css(rel)), `${rel} still carries a Muse colour alias`).toBe(false)
  }
})
