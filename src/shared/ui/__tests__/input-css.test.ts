import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Every text field must style its own placeholder.
 *
 * `-x-placeholder-color` is the only channel for it: the hosts draw the
 * placeholder in their own default colour, which is near-black on Android and iOS
 * — invisible on the dark theme. That was the very first device bug on the manual
 * list ("暗色很多地方看不清,比如输入框提示文字"), fixed across five files in batch
 * 19 and recorded as done, yet by batch 51 **three** later fields had shipped
 * without it (`proxy-settings__input`, `server-edit__input`,
 * `libops-exclude__input`). Nothing read those stylesheets, so nothing noticed.
 *
 * No render test can see a missing CSS declaration, so this derives the
 * requirement from the source instead of hard-coding a list: find every
 * `<Input>` / `<TextArea>` className in the tree, then require a matching rule
 * that sets the property. A new field is covered the moment it is written.
 *
 * Note this only holds on the native hosts. On Web the property reaches the DOM
 * verbatim and the browser drops it — `@lynx-js/web-elements` drives the colour
 * from a `--placeholder-color` custom property on the input part instead, and that
 * part hard-codes `grey`. Fixed by patching web-core's bundled default from `grey`
 * to `var(--content-muted,grey)` (scripts/patch-web-core-client.mjs, Fix 3), so the
 * Web placeholder follows the same `--content-muted` the native side uses — verified
 * via Chrome CDP in both themes. This gate still only checks the native channel; the
 * Web channel is the patch, not a per-field declaration.
 */

const SRC = path.resolve(__dirname, '../../..')

function filesWithExt(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return filesWithExt(full, ext)
    return entry.endsWith(ext) ? [full] : []
  })
}

/** Stylesheet text with comments stripped — prose must not satisfy a gate. */
function allCss(): string {
  return filesWithExt(SRC, '.css')
    .map((f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n')
}

/**
 * Every text field in the tree, one entry per distinct `className` string.
 *
 * Deliberately **not** keyed by the base class: `proxy-settings__input` is worn by
 * two `<Input>`s *and* by the allowlist `<TextArea>` (which adds a `--tall`
 * modifier). A first-wins map keyed on the base class recorded that field as
 * single-line and quietly excluded it from the multi-line gate below — caught only
 * because the reverse-verification of that gate refused to go red.
 *
 * The lowercase `input` / `textarea` alternatives are a deliberate safety net:
 * the lyric editor used to render a **raw** `<textarea>` instead of the lynx-ui
 * component (a gate that only knew the component names skipped it silently),
 * and a raw element can reappear at any time.
 *
 * Only static string literals are matched. That is all the tree currently uses, and
 * a dynamic className would slip past — so if one ever appears, give it a static
 * base class rather than loosening the pattern.
 */
function textFields(): { classes: string[]; multiline: boolean }[] {
  const found = new Map<string, { classes: string[]; multiline: boolean }>()
  for (const file of filesWithExt(SRC, '.tsx')) {
    if (file.includes('__tests__')) continue
    const src = readFileSync(file, 'utf8')
    for (
      const m of src.matchAll(
        /<(Input|TextArea|input|textarea)\b[^>]*?className='([^']+)'/g,
      )
    ) {
      const key = m[2]!
      if (!found.has(key)) {
        found.set(key, {
          classes: key.split(/\s+/),
          multiline: m[1]!.toLowerCase() === 'textarea',
        })
      }
    }
  }
  return [...found.values()]
}

/** Distinct styled base classes — the first class of each field. */
function inputClassNames(): string[] {
  return [...new Set(textFields().map((f) => f.classes[0]!))].sort()
}

test('the tree actually has text fields to check', () => {
  // Guards against the regex silently matching nothing and the gate below
  // passing on an empty set.
  expect(inputClassNames().length).toBeGreaterThanOrEqual(10)
})

/** The declaration block of `.cls`, or `''` if the class has no rule at all. */
function ruleFor(cls: string, css: string): string {
  return new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
}

/**
 * The `width` / `height` a field ends up with, given all the classes it wears.
 *
 * Every one of these rules is a single class, so they all have equal specificity
 * and the **last one declared wins** — which is why a modifier that comes later in
 * the stylesheet can neutralise a `width: 100%` on its base class. Resolving that
 * matters here: `.proxy-settings__input` legitimately keeps `width: 100%` for the
 * two single-line inputs that share it, and only the `--tall` modifier overrides it.
 */
function effectiveSize(classes: string[], css: string): { width: string; height: string } {
  const out = { width: '', height: '' }
  for (const prop of ['width', 'height'] as const) {
    let bestAt = -1
    for (const cls of classes) {
      const at = css.search(new RegExp(`\\.${cls}\\s*\\{`))
      const value = new RegExp(`(?:^|;|\\n)\\s*${prop}:\\s*([^;\\n]+)`).exec(ruleFor(cls, css))?.[1]
      if (value !== undefined && at > bestAt) {
        bestAt = at
        out[prop] = value.trim()
      }
    }
  }
  return out
}

test('every text field sets -x-placeholder-color', () => {
  const css = allCss()
  const missing = inputClassNames().filter(
    (cls) => !/-x-placeholder-color\s*:/.test(ruleFor(cls, css)),
  )
  expect(missing).toEqual([])
})

/**
 * The field fill: Apple backs text fields with a translucent fill rather than an
 * opaque surface, which is also why it reads correctly on a glass panel. Six
 * fields had drifted by batch 51 (filled with `--paper`/`--canvas`, the card /
 * bottom-layer tokens — light theme put #fafafa on #ffffff, ~1.04:1, no edge).
 *
 * P10 deleted the `--neutral-faint` alias that pointed at this token, so the
 * single accepted fill is the real Apple name. (While the alias bridge lived,
 * both names were accepted and a second test checked the alias resolved to the
 * same colour — that guard is gone with the alias.)
 */
const FIELD_FILLS = ['var(--tertiary-system-fill)']

test('every text field is filled with the Apple field fill', () => {
  const css = allCss()
  const wrong = inputClassNames()
    .map((cls) => [cls, /background-color:\s*([^;\n]+)/.exec(ruleFor(cls, css))?.[1]?.trim()])
    .filter(([, fill]) => !FIELD_FILLS.includes(fill as string))
  expect(wrong).toEqual([])
})

test('every text field uses the --radius-sm corner', () => {
  const css = allCss()
  const wrong = inputClassNames()
    .map((cls) => [cls, /border-radius:\s*([^;\n]+)/.exec(ruleFor(cls, css))?.[1]?.trim()])
    .filter(([, radius]) => radius !== 'var(--radius-sm)')
  expect(wrong).toEqual([])
})

/**
 * Multi-line fields must not size themselves with a percentage width.
 *
 * `@lynx-js/web-elements` styles the real control through `::part()`, and
 * `x-textarea.css` forwards `width` and `padding` to it but **not `box-sizing`* —
 * where `x-input.css` forwards both. So a `<textarea>` keeps the UA's
 * `content-box` while inheriting the percentage, and its border box ends up
 * `padding + border` wider than its container: measured in headless Chrome, the
 * allowlist field's right edge sat at 417px against a 383px card, visibly poking
 * out. Flex stretch / `flex: 1` size the *outer* box, so they are correct under
 * either box model. Native is unaffected (Lynx defaults to border-box), which is
 * exactly why this only ever shows up in a browser.
 *
 * `<input>` is deliberately not covered: it *does* inherit `box-sizing`, and seven
 * fields rely on `width: 100%`.
 */
test('multi-line fields are sized by flex, not by a percentage width', () => {
  const css = allCss()
  const offenders = textFields()
    .filter((f) => f.multiline)
    .map((f) => [f.classes.join(' '), effectiveSize(f.classes, css)] as const)
    .filter(([, size]) => /%/.test(size.width) || /%/.test(size.height))
  expect(offenders).toEqual([])
})
