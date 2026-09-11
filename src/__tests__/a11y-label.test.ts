import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { classTokens } from '../shared/testing/jsx-classes.js'
import { jsxElements } from '../shared/testing/jsx-elements.js'

/**
 * Every control that shows only an icon must have an accessible name.
 *
 * The mechanism is Lynx's, not the web's, and this gate exists because the
 * difference is invisible: **`aria-label` does nothing in Lynx.** A search of
 * `@lynx-js/types` finds no ARIA attribute at all; the properties are hyphenated
 * — `accessibility-label`, `accessibility-element`, `accessibility-traits`
 * (`types/common/props.d.ts`). `docs/` said nothing about it either. Two
 * `aria-label`s had been written in `src` and read as correct for as long as they
 * existed, because a dead attribute on a Lynx element is not an error anywhere:
 * it typechecks (JSX allows unknown props), it bundles, and it renders.
 *
 * **A label alone is still not enough, which is the half that is easy to miss.**
 * On iOS a `<view>` is not an accessibility element — `LynxUIView
 * -enableAccessibilityByDefault` returns NO; only `LynxUIText` returns YES — so
 * `accessibility-label` writes a label onto a view that VoiceOver never focuses.
 * Measured on the simulator by attaching lldb and walking the live UIView tree of
 * the full player: **10 accessibility elements, all `LynxTextView`**, and the
 * heart button — the one carrying an `aria-label` — absent from the tree
 * entirely. `accessibility-element` is what turns the view into an element
 * (iOS `isAccessibilityElement`, Android `setImportantForAccessibility`), and
 * both properties are declared for Android / iOS / Harmony / PC.
 *
 * So the three rules below are one contract, and each is a defect that shipped:
 *
 *   1. no ARIA attribute anywhere in `src` (there were two);
 *   2. `accessibility-label` implies `accessibility-element` on the same non-text
 *      element, or the label is written to something nothing can focus;
 *   3. every tappable element that renders an icon and no text carries both.
 *
 * Rule 3's roster is derived from usage, never listed here: a hand-written list
 * would have gone stale the first time a button was added, and the point of the
 * gate is the button nobody has written yet.
 */

const ROOT = path.resolve(__dirname, '..', '..')
const SRC = path.join(ROOT, 'src')

function filesWith(ext: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        // Test files are excluded wholesale: this gate reads business code, and
        // its own source quotes the attribute names it forbids.
        if (entry !== '__tests__') walk(full)
      } else if (entry.endsWith(ext)) out.push(full)
    }
  }
  walk(SRC)
  return out.sort()
}

/**
 * Controls whose accessible name cannot be derived from the source, keyed by
 * `file :: className`, with the reason they are exempt from rule 3.
 *
 * Both entries are labels the scanner cannot *see the need for*, not labels it
 * asked for and did not find — each already carries one.
 */
const NOT_DERIVABLE: Record<string, string> = {
  // Renders an ellipsis `<text>` while buffering, so the scanner reads the button
  // as having text. Its normal state is an icon.
  'features/player/widgets/PlayControls.tsx :: player-controls__btn player-controls__btn--primary':
    'play/pause, labelled by hand',
}

/** Static `className` of a tag, for keying and for failure messages. */
function classNameOf(tag: string): string {
  const m = /\bclassName=('([^']*)'|"([^"]*)")/.exec(tag)
  return m?.[2] ?? m?.[3] ?? classTokens(tag).join(' ') ?? ''
}

describe('accessibility names on icon-only controls', () => {
  const tsx = filesWith('.tsx')

  test('no source file uses an ARIA attribute (Lynx has none)', () => {
    const offenders: string[] = []
    for (const file of filesWith('.tsx').concat(filesWith('.ts'))) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        const m = /\baria-[a-z]+=/.exec(line)
        if (m) offenders.push(`${path.relative(ROOT, file)}:${i + 1} ${m[0]}`)
      })
    }
    expect(offenders).toEqual([])
  })

  test('`accessibility-label` is paired with `accessibility-element`', () => {
    const offenders: string[] = []
    for (const file of tsx) {
      for (const el of jsxElements(readFileSync(file, 'utf8'))) {
        if (!el.tag.includes('accessibility-label=')) continue
        // `<text>` is already an accessibility element (LynxUIText returns YES),
        // so the pairing is only required where the element type is not.
        if (el.name === 'text') continue
        if (!el.tag.includes('accessibility-element=')) {
          offenders.push(`${path.relative(ROOT, file)} <${el.name} ${classNameOf(el.tag)}>`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  test('every icon-only tappable element carries an accessible name', () => {
    const offenders: string[] = []
    for (const file of tsx) {
      const rel = path.relative(SRC, file)
      for (const el of jsxElements(readFileSync(file, 'utf8'))) {
        if (el.body === null) continue
        if (!/\b(bind|catch)tap=/.test(el.tag)) continue
        if (!el.body.includes('<Icon')) continue
        if (/<text[\s>]/.test(el.body)) continue
        if (Object.hasOwn(NOT_DERIVABLE, `${rel} :: ${classNameOf(el.tag)}`)) continue
        if (!el.tag.includes('accessibility-element=') || !el.tag.includes('accessibility-label=')) {
          offenders.push(`${rel} <${el.name} ${classNameOf(el.tag)}>`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
