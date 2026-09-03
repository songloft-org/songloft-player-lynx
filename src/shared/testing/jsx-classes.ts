/**
 * Test-only JSX scanners: which class names does a source file actually apply?
 *
 * Imported by the gates that derive their rosters from usage rather than from a
 * hand-written list — `theme/__tests__/a11y-tap-target.test.ts` (every tappable
 * meets the 44px target) and `ui/__tests__/glass-surface.test.ts` (nothing paints
 * an opaque fill over a glass panel). Nothing in the app imports it.
 *
 * It lives here, shared, for the reason `features/library/widgets/SongRow.css`
 * documents at length: this repo has already paid for one parser copy-pasted into
 * three files that then stopped being equivalent. The scanner below is subtle
 * enough (brace depth, quote state, template interpolation) that two copies would
 * drift the same way — and the interpolation bug recorded in `classTokens` was
 * found in the first copy while chasing something else entirely.
 */

/**
 * Every JSX opening tag in a source file, as raw text.
 *
 * Brace- and quote-aware, because attribute values are arbitrary expressions:
 * a naive `/<[^>]*>/` stops at the first `>` inside `{() => cond > 0}` and
 * would split one tag into two, losing whichever attribute straddles the cut.
 */
export function openingTags(src: string): string[] {
  const tags: string[] = []
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '<' || !/[a-zA-Z]/.test(src[i + 1] ?? '')) continue
    let depth = 0
    let quote: string | null = null
    let j = i + 1
    for (; j < src.length; j++) {
      const c = src[j]!
      if (quote !== null) {
        if (c === quote && src[j - 1] !== '\\') quote = null
      } else if (c === '"' || c === '\'' || c === '`') quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    tags.push(src.slice(i, j + 1))
    i = j
  }
  return tags
}

/**
 * Class names worn by one opening tag — from `className` and from every
 * `somethingClassName` prop, whether the value is a literal or an expression
 * (`{cond ? 'a' : 'b'}`, a template, a concatenation). Every string literal in
 * the expression is taken: a class applied only conditionally is still applied.
 */
export function classTokens(tag: string): string[] {
  const out: string[] = []
  for (const m of tag.matchAll(/\w*lassName\s*=/g)) {
    let k = m.index + m[0].length
    while (k < tag.length && /\s/.test(tag[k]!)) k++
    const open = tag[k]
    if (open === '\'' || open === '"') {
      const end = tag.indexOf(open, k + 1)
      if (end > 0) out.push(...tag.slice(k + 1, end).split(/\s+/))
    } else if (open === '{') {
      let depth = 0
      let e = k
      for (; e < tag.length; e++) {
        if (tag[e] === '{') depth++
        else if (tag[e] === '}' && --depth === 0) break
      }
      /*
       * Two passes, because one alternation cannot do both. A template literal
       * has to have its `${…}` holes removed BEFORE splitting — the naive
       * version matched `` `song-row${isCurrentSong ? ' song-row--current' : ''}` ``
       * as a single fragment, whose first word came out as `song-row${isCurrentSong`
       * and was dropped by the filter. That silently cost the roster every class
       * written as `` {`base${cond ? ' mod' : ''}`} ``, `.song-row` among them —
       * a `bindtap` row. Found while chasing an unrelated bug, which is the point:
       * a derived roster is only as wide as its parser.
       */
      const expr = tag.slice(k, e + 1)
      for (const s of expr.matchAll(/`([^`]*)`/g)) {
        out.push(...(s[1] ?? '').replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ' ').split(/\s+/))
      }
      // Second pass over the whole expression, so quoted class names *inside* an
      // interpolation (the ` mod` above, ternary branches) are picked up too.
      for (const s of expr.matchAll(/'([^']*)'|"([^"]*)"/g)) {
        out.push(...(s[1] ?? s[2] ?? '').split(/\s+/))
      }
    }
  }
  return out.filter((token) => /^[a-z][\w-]*$/.test(token))
}

/** Every class name a source file applies, from all of its opening tags. */
export function fileClasses(src: string): Set<string> {
  return new Set(openingTags(src).flatMap(classTokens))
}
