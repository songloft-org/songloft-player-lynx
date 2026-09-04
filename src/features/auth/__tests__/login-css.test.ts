import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

/**
 * P7 login/register migration + the later full-bleed white redesign, pinned
 * where they silently regress. The card is now a transparent width-column on
 * the white page (fields' tertiary-fill is the structure) and the inputs are
 * borderless-filled — both regress to a hairline/grey card with no layout break.
 */
const CSS = readFileSync(
  resolve(process.cwd(), 'src/features/auth/pages/LoginPage.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS)
  expect(m, `no rule for \`${selector}\``).not.toBeNull()
  return m![1]!
}

test('the brand logo aligns with SplashScreen (80×80, 18px radius)', () => {
  const logo = ruleFor('.login__logo')
  expect(logo).toMatch(/width:\s*80px/)
  expect(logo).toMatch(/height:\s*80px/)
  expect(logo).toMatch(/border-radius:\s*18px/)
})

test('the card is a transparent width-column on the white page (Apple full-bleed login)', () => {
  const card = ruleFor('.login__card')
  expect(card).toMatch(/max-width:\s*var\(--login-card-width\)/)
  expect(card, 'no chrome: no grey fill, no radius, no border — fields sit on white').not.toMatch(/background-color/)
  expect(card).not.toMatch(/border-radius/)
  expect(card).not.toMatch(/border(?!-radius)/)
})

test('the inputs are the Apple control height, filled and borderless', () => {
  const input = ruleFor('.login__input')
  expect(input).toMatch(/height:\s*var\(--control-height\)/)
  expect(input).toMatch(/background-color:\s*var\(--tertiary-system-fill\)/)
  expect(input).toMatch(/font-size:\s*var\(--font-body\)/)
  expect(input, 'no hairline on a filled field').not.toMatch(/border(?!-radius)/)
})

test('the typography + button took the Apple roles', () => {
  expect(ruleFor('.login__label')).toMatch(/font-size:\s*var\(--font-footnote\)/)
  expect(ruleFor('.login__toggle-title')).toMatch(/font-size:\s*var\(--font-subhead\)/)
  expect(ruleFor('.login__error')).toMatch(/font-size:\s*var\(--font-footnote\)/)
  expect(ruleFor('.login__error')).toMatch(/color:\s*var\(--system-red\)/)
  // The title stays at title1 (Apple onboarding form) — it must not drift.
  expect(ruleFor('.login__title')).toMatch(/font-size:\s*var\(--font-title1\)/)
  // Button: control height, body + semibold (the plan's ".btn base" values,
  // applied directly — .btn itself has no verified consumer yet).
  expect(ruleFor('.login__button')).toMatch(/height:\s*var\(--control-height\)/)
  const btnText = ruleFor('.login__button-text')
  expect(btnText).toMatch(/font-size:\s*var\(--font-body\)/)
  expect(btnText).toMatch(/font-weight:\s*var\(--weight-semibold\)/)
})

test('no Muse colour aliases survive in the login CSS', () => {
  const ALIAS = /var\(--(?:content|content-2|content-muted|paper|line|neutral-faint|primary|primary-content|primary-faint|danger)\)/
  expect(ALIAS.test(CSS), 'LoginPage.css still carries a Muse colour alias').toBe(false)
})
