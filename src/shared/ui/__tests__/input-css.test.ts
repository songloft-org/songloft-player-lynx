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
 * from a `--placeholder-color` custom property instead, so Web placeholders are
 * still the library's `grey`. Tracked in `docs/tracking/bug.md`; fixing it means
 * adding the second property everywhere, not changing this gate.
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
 * Class names carried by every text field in the tree.
 *
 * The lowercase `input` / `textarea` alternatives are not redundant: `LyricEditPage`
 * renders a **raw** `<textarea>` rather than the lynx-ui component, and a gate that
 * only knew about the components would have skipped it silently — the same shape of
 * blind spot as a contract gate that only reads one of two hosts.
 *
 * Only static string literals are matched. That is all the tree currently uses, and
 * a dynamic className would slip past this gate — so if one ever appears, give it a
 * static base class rather than loosening the pattern.
 */
function inputClassNames(): string[] {
  const found = new Set<string>()
  for (const file of filesWithExt(SRC, '.tsx')) {
    if (file.includes('__tests__')) continue
    const src = readFileSync(file, 'utf8')
    for (
      const m of src.matchAll(
        /<(?:Input|TextArea|input|textarea)\b[^>]*?className='([^']+)'/g,
      )
    ) {
      // The first class is the styled base; modifiers only tweak it.
      found.add(m[1]!.split(/\s+/)[0]!)
    }
  }
  return [...found].sort()
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

test('every text field sets -x-placeholder-color', () => {
  const css = allCss()
  const missing = inputClassNames().filter(
    (cls) => !/-x-placeholder-color\s*:/.test(ruleFor(cls, css)),
  )
  expect(missing).toEqual([])
})

/**
 * The next two lock the two field tokens `DESIGN.md` assigns, both of which had
 * drifted by batch 51 — six fields were filled with `--paper` (the *card* token,
 * "浮于 canvas 上的卡片/面板") or `--canvas` (the bottom-layer background), and
 * every field rounded itself with `--radius-md` (the *card* radius).
 *
 * The fill one is not cosmetic: those six sat borderless on a transparent page, so
 * light theme put #fafafa on #ffffff — about 1.04:1, no perceivable field edge.
 */
test('every text field is filled with --neutral-faint', () => {
  const css = allCss()
  const wrong = inputClassNames()
    .map((cls) => [cls, /background-color:\s*([^;\n]+)/.exec(ruleFor(cls, css))?.[1]?.trim()])
    .filter(([, fill]) => fill !== 'var(--neutral-faint)')
  expect(wrong).toEqual([])
})

test('every text field uses the --radius-sm corner', () => {
  const css = allCss()
  const wrong = inputClassNames()
    .map((cls) => [cls, /border-radius:\s*([^;\n]+)/.exec(ruleFor(cls, css))?.[1]?.trim()])
    .filter(([, radius]) => radius !== 'var(--radius-sm)')
  expect(wrong).toEqual([])
})

test('the raw <textarea> on the lyric editor is in scope', () => {
  // It is the one text field not built from the lynx-ui component, and the only
  // reason the pattern above matches lowercase tag names. If this page ever moves
  // to `<TextArea>`, delete this case rather than the lowercase alternatives —
  // a raw element can reappear at any time.
  expect(inputClassNames()).toContain('lyric-edit__textarea')
})
