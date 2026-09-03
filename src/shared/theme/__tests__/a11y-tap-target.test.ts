import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

import { classTokens, openingTags } from '../../testing/jsx-classes.js'

/**
 * HIG §8 Accessibility tap-target gate (plan §11.2).
 *
 * Every tappable element must be ≥ 44×44px (`--tap-target`).
 *
 * The roster of what counts as tappable is **derived from usage**, not written
 * by hand: the gate walks every `.tsx`, finds the elements that actually carry
 * `bindtap` / `catchtap` (plus the `*ClassName` props that hand a class to a
 * component which attaches the handler for you, such as `PopoverMenu`'s
 * `triggerClassName`), and collects the class names they wear. It then checks
 * every CSS rule that styles one of those classes.
 *
 * It used to be a five-entry list of patterns (`.btn`, `.nav-item`,
 * `.subpage__back`, `.popover-menu__item`, `.more-tabs__item`) with a docstring
 * admitting "classes not listed are not checked — the gate is additive, not
 * exhaustive". That is a gate shaped like the bug it is meant to catch, and it
 * was: 31 tappables were under 44px with this test green, including two `⋯`
 * triggers reached only through `triggerClassName`, which the hand-written list
 * had no way to see. The old patterns survive below as a floor, so the gate is
 * strictly stronger than before, never weaker.
 *
 * Still permissive in one direction, unavoidably: a tappable that declares no
 * height at all sizes to its content, which is not knowable statically. Only
 * rules with an explicit `height` / `min-height` are checked.
 */

const SRC = path.resolve(__dirname, '../../..')
const TAP_TARGET = 44

function filesOf(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '__tests__') return []
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return filesOf(full, ext)
    return entry.endsWith(ext) ? [full] : []
  })
}

/*
 * The two JSX scanners live in `shared/testing/jsx-classes.ts` — shared with the
 * glass-surface gate, which derives its own roster the same way. Keeping one copy
 * is deliberate: the interpolation bug its comment records was in this file's
 * copy, and a second copy would have kept it.
 */


/**
 * The old hand-written roster, kept as a floor. These are styled as interactive
 * by shared components that may attach the handler on an inner element or via a
 * lynx-ui wrapper, so usage alone is not guaranteed to reach them.
 *
 * `.app-switch__track` is deliberately absent: it is 51×31px (the iOS UISwitch
 * standard) and is not a standalone tappable — the `SettingsRow` around it
 * provides the 44px target. It carries no tap handler, so the derivation does
 * not pick it up either.
 */
const ALWAYS_CHECKED = ['btn', 'nav-item', 'subpage__back', 'popover-menu__item', 'more-tabs__item']

/** Parse a CSS length into px, or null when it is not a fixed length. */
function parsePx(value: string): number | null {
  const m = value.trim().match(/^(\d+)px$/)
  if (m) return parseInt(m[1]!, 10)
  // Token spellings, so a token cannot be used to smuggle a sub-44 height past
  // the literal check. `--control-height-sm` (36px) is a *control* height, not a
  // tap target; it is legal on non-tappables and a violation on a tappable.
  if (value.includes('var(--tap-target)')) return TAP_TARGET
  if (value.includes('var(--control-height)')) return TAP_TARGET
  if (value.includes('var(--control-height-sm)')) return 36
  return null
}

/*
 * Classes the derivation reaches but that are not tap targets, each with the
 * reason. Only ever slider chrome so far: a `*ClassName` prop hands a class to a
 * component, and not every part a component builds from one is tappable.
 *
 * An exemption may only name a class the derivation found through a prop, never
 * one that carries `bindtap` / `catchtap` itself — see the assertion in the
 * roster test. Otherwise this map would be a hole exactly the size of the
 * hand-written roster it replaced.
 */
const NOT_A_TAP_TARGET: Record<string, string> = {
  'player-volume__thumb':
    'the 14px knob of a VerticalSlider, passed as `thumbClassName`. The gesture belongs to '
    + 'the drag surface around it (`.player-volume__slider`, 132px); the knob is a bare '
    + '<view> with no handler, and sizing it to 44px would make the knob the slider.',
  'eq-page__band-thumb':
    'same — the EQ band slider’s knob, 16px, `thumbClassName` on the same component.',
}

/**
 * The tappable roster, split by how each class was reached: `handler` for the
 * elements that carry `bindtap` / `catchtap` themselves, `viaProp` for classes
 * handed to a component through a `*ClassName` prop. Both are checked; only the
 * second may be exempted.
 */
function tappableClasses(): { handler: Set<string>, viaProp: Set<string>, all: Set<string> } {
  const handler = new Set<string>()
  const viaProp = new Set<string>()
  for (const file of filesOf(SRC, '.tsx')) {
    for (const tag of openingTags(readFileSync(file, 'utf8'))) {
      const direct = /\b(bindtap|catchtap)\s*=/.test(tag)
      if (!direct && !/\w+ClassName\s*=/.test(tag)) continue
      for (const token of classTokens(tag)) (direct ? handler : viaProp).add(token)
    }
  }
  for (const cls of ALWAYS_CHECKED) handler.add(cls)
  return { handler, viaProp, all: new Set([...handler, ...viaProp]) }
}

/** Each `{ selector, prop, value }` height declaration in the stylesheets. */
function heightDeclarations(): { file: string, selector: string, prop: string, value: string }[] {
  const out: { file: string, selector: string, prop: string, value: string }[] = []
  for (const file of filesOf(SRC, '.css')) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const selector of rule[1]!.split(',')) {
        for (const prop of ['height', 'min-height']) {
          const m = rule[2]!.match(new RegExp(String.raw`(?<![-\w])${prop}:\s*([^;]+)`))
          if (m) out.push({ file: path.relative(SRC, file), selector: selector.trim(), prop, value: m[1]!.trim() })
        }
      }
    }
  }
  return out
}

test('derives the tappable roster from usage instead of a hand-written list', () => {
  const { handler, all: tappable } = tappableClasses()

  // An exemption must not be able to excuse something that is plainly tapped.
  for (const [cls, why] of Object.entries(NOT_A_TAP_TARGET)) {
    expect(tappable, `${cls} is exempted but nothing renders it: ${why}`).toContain(cls)
    expect(handler, `${cls} carries a tap handler — it cannot be exempted: ${why}`)
      .not.toContain(cls)
  }

  // A parser regression (a changed JSX idiom, a bad brace walk) would empty the
  // roster and leave the gate below vacuously green. Pin the shape: the app has
  // a couple of hundred tappables, and each of these is reached by a DIFFERENT
  // route, so a regression in any one branch of the extractor shows up here
  // rather than as a silently narrower roster.
  expect(tappable.size).toBeGreaterThan(150)
  for (const cls of [
    'song-row__action', // bindtap, plain literal
    'mini-player__play-hit', // catchtap
    'plugin-manager__row-more', // triggerClassName only — invisible to the old gate
    'confirm-dialog__btn', // literal with a modifier alongside it
    'nav-item', // the floor
    // The literal head of an interpolated template — `{`song-row${…}`}`. This
    // one was MISSING until the interpolation-aware pass was added: the naive
    // fragment scanner returned `song-row${isCurrentSong` and the filter dropped
    // it, so a `bindtap` row was outside the roster while the gate was green.
    'song-row',
  ]) {
    expect(tappable, `${cls} missing from the derived roster`).toContain(cls)
  }
})

test('every tappable element declaring a height meets the 44px tap target', () => {
  const { all: tappable } = tappableClasses()
  const violations: string[] = []

  for (const { file, selector, prop, value } of heightDeclarations()) {
    const classes = [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]!)
    // The *last* class decides whose rule this is: `.shell--wide .song-row__action`
    // styles the action, `.song-row__action-text` styles something else entirely.
    // Modifiers inherit their base's roster membership (`.btn--sm` is a `.btn`).
    const own = classes.at(-1)
    if (own === undefined) continue
    if (!tappable.has(own) && !tappable.has(own.split('--')[0]!)) continue
    if (own in NOT_A_TAP_TARGET || own.split('--')[0]! in NOT_A_TAP_TARGET) continue

    const px = parsePx(value)
    if (px !== null && px < TAP_TARGET) {
      violations.push(`${file}: ${selector} ${prop}=${value} < ${TAP_TARGET}px`)
    }
  }

  expect(violations, violations.join('\n')).toEqual([])
})

test('keeps the painted glyph small where a 44px box would swallow the artwork', () => {
  const { all: tappable } = tappableClasses()
  const css = Object.fromEntries(
    filesOf(SRC, '.css').map((f) => [path.relative(SRC, f), readFileSync(f, 'utf8')]),
  )
  const rule = (file: string, cls: string) => {
    const m = css[file]!.match(new RegExp(String.raw`^\.${cls}\s*\{([^{}]*)\}`, 'm'))
    expect(m, `no .${cls} rule in ${file}`).not.toBeNull()
    return m![1]!
  }

  /*
   * HIG's 44pt is the size of the *touch target*, not of the glyph, and at these
   * four sites the two have to differ: the cards' covers are 104px, so a 44px
   * play disc (plus a 44px `⋯` disc beside it) would paint over most of the
   * artwork, and the mini-player's row is a fixed 48px, so a 44px disc would
   * fill the capsule. Each keeps its painted disc and wears a `__*-hit` wrapper
   * that carries the target — the same pattern `.libops-tree__check-hit` has
   * used all along for its checkbox rows.
   *
   * This is the assertion that stops the pattern from being quietly undone by
   * moving the handler back onto the disc. Without it, that edit leaves the disc
   * tappable at 28px and the wrapper an unused 44px box — and the gate above
   * would catch it only because the disc is small, with no hint of what broke.
   */
  const SITES = [
    { file: 'features/playlist/widgets/PlaylistsView.css', hit: 'playlist-card__play-hit', paint: 'playlist-card__play-btn' },
    { file: 'features/playlist/widgets/PlaylistsView.css', hit: 'playlist-card__more-hit', paint: 'playlist-card__more-btn' },
    { file: 'features/library/pages/LibraryPage.css', hit: 'facet-card__play-hit', paint: 'facet-card__play-btn' },
    { file: 'features/player/widgets/MiniPlayer.css', hit: 'mini-player__play-hit', paint: 'mini-player__play' },
  ]

  for (const { file, hit, paint } of SITES) {
    expect(tappable, `${hit} should be the tappable`).toContain(hit)
    expect(tappable, `${paint} should not carry the handler — the wrapper does`).not.toContain(paint)

    for (const prop of ['width', 'height']) {
      expect(rule(file, hit), `${hit} ${prop}`).toMatch(
        new RegExp(String.raw`${prop}:\s*var\(--tap-target\)`),
      )
    }
    // The paint stays smaller, and stays *painted* — a disc with no fill would
    // mean the wrapper swallowed the button rather than wrapped it.
    const paintBody = rule(file, paint)
    const size = paintBody.match(/(?<![-\w])height:\s*(\d+)px/)
    expect(size, `${paint} should keep an explicit sub-44 height`).not.toBeNull()
    expect(parseInt(size![1]!, 10)).toBeLessThan(TAP_TARGET)
    expect(paintBody, `${paint} fill`).toMatch(/background-color:\s*var\(--/)
    // …and no longer positions itself: the wrapper owns the corner inset now.
    expect(paintBody, `${paint} should not still be positioned`).not.toMatch(/position:\s*absolute/)
  }
})
