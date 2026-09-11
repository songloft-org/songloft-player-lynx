import { openingTags } from './jsx-classes.js'

/**
 * Test-only JSX scanner: an element's *children*, not just its opening tag.
 *
 * `jsx-classes.ts` answers "which classes does this file apply" from the opening
 * tags alone. The accessibility gate (`src/__tests__/a11y-label.test.ts`) needs
 * the next question — "does this tappable element render any visible text, or
 * only an icon" — and that lives in the tag's body, which is not an opening tag.
 *
 * **The brace/quote/comment scanner is not duplicated here.** `openingTags` owns
 * that and has already been debugged twice (see its docstring); this module only
 * adds the two things it cannot express: offsets, and nesting.
 *
 * Offsets are the reason for `elideComments`. `openingTags` returns comment-free
 * text, so a tag whose attributes hold a comment is not a substring of the
 * original source and `indexOf` would miss it. Blanking comments *in place*
 * (space for character, same length, newlines kept) gives a string whose offsets
 * equal the original's, so every slice below is also valid in the original — and
 * a `bindtap` or a class name named in prose is still not read as usage.
 */

/**
 * `src` with every comment replaced by spaces, including the comment's own
 * newlines' worth of columns but not the newlines themselves. Same length as
 * `src`, so offsets align; comments are unreadable to every caller below.
 */
export function elideComments(src: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ')
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? src.length : end + 2
      out += blank(src.slice(i, stop))
      i = stop
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      // A line comment ends at the newline. `//` inside a string literal is not a
      // comment, and this scanner cannot tell — so it only treats `//` as a
      // comment when the line's `//` is outside quotes, which is what the
      // conservative check below approximates: a URL in an attribute
      // (`src='https://…'`) is on a line whose text before `//` holds an
      // unclosed quote, and such a line is left alone.
      const lineStart = src.lastIndexOf('\n', i) + 1
      const before = src.slice(lineStart, i)
      const quotes = (before.match(/'/g) ?? []).length + (before.match(/"/g) ?? []).length
      if (quotes % 2 === 0) {
        const nl = src.indexOf('\n', i)
        const stop = nl < 0 ? src.length : nl
        out += blank(src.slice(i, stop))
        i = stop
        continue
      }
    }
    out += c
    i++
  }
  return out
}

export interface JsxElement {
  /** Opening tag, comments blanked, `<` through `>`. */
  tag: string
  /** `view`, `text`, `Icon`, … */
  name: string
  /**
   * Source between this element's opening and closing tag, comments blanked.
   * `null` when the tag is self-closing (`<Icon … />`) and therefore has none.
   */
  body: string | null
}

const NAME_RE = /^<([A-Za-z][\w.:-]*)/

/**
 * Every JSX element in a source file, in document order, with its body.
 *
 * Nesting is tracked per element *name*: a `<view>` ends at the first unmatched
 * `</view>`, so a `<text>` inside it — or a self-closing `<view … />` — does not
 * cut it short. That is not a detail: an earlier version of this scanner closed
 * an element at the first `</view>` **anywhere** in the remaining source, which
 * ended a settings row at its own icon wrapper and reported the row as text-free.
 * It cost a roster of eleven false "icon-only" controls.
 */
export function jsxElements(src: string): JsxElement[] {
  const code = elideComments(src)
  const tags = openingTags(code)

  // `openingTags` returns text, not positions. Walking a cursor forward is exact
  // because both strings are comment-free and the tags appear in document order.
  const starts: number[] = []
  let cursor = 0
  for (const tag of tags) {
    const at = code.indexOf(tag, cursor)
    starts.push(at)
    cursor = at + tag.length
  }

  return tags.map((tag, i) => {
    const name = NAME_RE.exec(tag)?.[1] ?? ''
    const selfClosing = /\/\s*>$/.test(tag)
    if (selfClosing) return { tag, name, body: null }

    const tagEnd = starts[i]! + tag.length
    const closeRe = new RegExp(`</\\s*${name.replace(/[.:]/g, '\\$&')}\\s*>`, 'g')
    let depth = 1
    let from = tagEnd
    for (let k = i + 1; ; k++) {
      const nextStart = k < tags.length ? starts[k]! : code.length
      const segment = code.slice(from, nextStart)
      for (const _ of segment.matchAll(closeRe)) {
        if (--depth === 0) return { tag, name, body: code.slice(tagEnd, nextStart) }
      }
      if (k >= tags.length) return { tag, name, body: code.slice(tagEnd) }
      if (tags[k]!.startsWith(`<${name}`) && !/\/\s*>$/.test(tags[k]!)) depth++
      from = starts[k]! + tags[k]!.length
    }
  })
}
