import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import {
  ACTION_ROW_PX,
  CARD_CHROME_PX,
  SONG_DIALOG_WIDTH_PX,
  dialogBodyMaxHeight,
  dialogCardMaxHeight,
  dialogCardWidth,
} from '../dialog-viewport.js'

/**
 * The four overlay properties of `ConfirmDialog` that no render test can see.
 *
 * The Vitest env has no layout engine and the shared lynx-ui Dialog stand-in
 * (`mockLynxUiDialog`) passes `DialogBackdrop` / `DialogContent` straight
 * through — it drops `style` and `dialogContentProps` — so the scrim's box and
 * the outside-tap wiring are invisible to rendering. Same reason
 * `popover-menu-css.test.ts` is a static assertion.
 *
 * What these pin, all four found by browser verification:
 *
 *  1. The dialog needs its modal z-index on the **fixed children** — the scrim
 *     (`.confirm-dialog__backdrop`) and the content layer
 *     (`.confirm-dialog__content`) — not on `DialogView`. On Lynx a
 *     `position: fixed` box re-stacks at the page root by its own z-index, and
 *     both children are fixed, so they escape `DialogView`'s stacking context;
 *     a z-index on the wrapper orders nothing. Left at auto the dialog paints at
 *     level 0, below every overlay (z-index 100) — opening "new playlist" over
 *     the add-to-playlist sheet showed nothing, the card laid out behind the
 *     sheet's own backdrop. (Raising only `DialogView` fixed this on Web, where
 *     fixed does escape to a top layer, but not on Android.)
 *  2. The scrim needs `position: fixed` from the **inline style**. lynx-ui
 *     hard-codes `position: absolute; width: 100%; height: 100%` inline, which
 *     beats the stylesheet, and its parent (`DialogView`) is a dimensionless
 *     fixed wrapper — so the class's `fixed` was dead and the scrim resolved to
 *     0×0: no visible dim, and `clickToClose` unreachable.
 *  3. Outside-tap cancel must sit on the **content** layer. That layer is
 *     `fixed; inset: 0` with `event-through={false}`, so it covers the scrim
 *     entirely; a tap outside the card can only ever reach the content view.
 *  4. The card must `catchtap`. Otherwise a tap on the confirm button bubbles to
 *     the content layer and fires `onCancel` right after `onConfirm`.
 */

const SRC = path.resolve(__dirname, '../ConfirmDialog.tsx')

/*
 * Every dialog that shares the ConfirmDialog chrome: the two shared ones
 * here, plus the two song dialogs under features/library (they import the
 * same `.confirm-dialog__*` classes, so the modal z-index rule applies to
 * them unchanged — see their component docs).
 */
const DIALOG_COMPONENTS = [
  '../ConfirmDialog.tsx',
  '../PromptDialog.tsx',
  '../../../features/library/widgets/SongInfoDialog.tsx',
  '../../../features/library/widgets/SongEditDialog.tsx',
]

/** Source with comments stripped — the prose above each fix explains it and
 *  must not be what satisfies these assertions. */
function source(): string {
  return readFileSync(SRC, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The JSX attributes of `<Tag …>`, up to the closing `>` of the open tag. */
function openTag(src: string, tag: string): string {
  const start = src.indexOf(`<${tag}`)
  expect(start, `<${tag}> not found in ConfirmDialog.tsx`).toBeGreaterThan(-1)
  const end = src.indexOf('>', start)
  return src.slice(start, end)
}

describe('ConfirmDialog overlay wiring', () => {
  test('the scrim is pinned to the viewport through the inline style', () => {
    const backdrop = openTag(source(), 'DialogBackdrop')
    expect(
      backdrop,
      'DialogBackdrop needs style={{ position: \'fixed\', … }} — its own inline '
        + '`position: absolute` overrides the class, leaving a 0×0 scrim',
    ).toMatch(/style=\{\{[^}]*position:\s*'fixed'/)
    // Offsets too: a fixed box with auto offsets resolves to its static
    // position, which is inside the dimensionless DialogView wrapper.
    for (const side of ['top', 'left', 'right', 'bottom']) {
      expect(backdrop, `the scrim must declare ${side}`).toMatch(
        new RegExp(`style=\\{\\{[^}]*${side}:\\s*0`),
      )
    }
  })

  test('outside taps cancel through the content layer', () => {
    expect(
      openTag(source(), 'DialogContent'),
      'DialogContent needs dialogContentProps={{ bindtap: onCancel }} — the '
        + 'backdrop it covers can never receive the tap',
    ).toMatch(/dialogContentProps=\{\{\s*bindtap:\s*onCancel\s*\}\}/)
  })

  test('the card swallows taps so confirm does not also cancel', () => {
    expect(
      openTag(source(), 'view className=\'confirm-dialog\''),
      'the .confirm-dialog card must catchtap, or button taps bubble into the '
        + 'outside-tap cancel above it',
    ).toMatch(/catchtap=/)
  })
})

/**
 * The modal layer sits above every overlay layer.
 *
 * Asserted against the *actual* z-index values in the app's stylesheets rather
 * than a copy of them: the failure this guards is someone raising an overlay
 * (or adding one at a higher level) and sinking every dialog opened from it,
 * which a hard-coded expectation here would not notice.
 */
describe('dialogs paint above the overlays that open them', () => {
  const DIALOG_CSS = path.resolve(__dirname, '../ConfirmDialog.css')

  /** Every `z-index: <n>` declared in `src`, per stylesheet, comments stripped. */
  function zIndexesByFile(): { file: string, levels: number[] }[] {
    const found: { file: string, levels: number[] }[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (entry.name.endsWith('.css')) {
          const css = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
          const levels: number[] = []
          const pattern = /z-index:\s*(-?\d+)/g
          let match: RegExpExecArray | null
          while ((match = pattern.exec(css)) !== null) levels.push(Number(match[1]))
          if (levels.length > 0) found.push({ file: full, levels })
        }
      }
    }
    walk(path.resolve(__dirname, '../../..'))
    return found
  }

  test('DialogView carries the shared overlay class, in every dialog', () => {
    for (const file of DIALOG_COMPONENTS) {
      const src = readFileSync(path.resolve(__dirname, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      expect(
        src,
        `${file}: <DialogView> must carry className='confirm-dialog__view' so the `
          + 'scrim and content it wraps get the modal stylesheet.',
      ).toMatch(/<DialogView\s+className='confirm-dialog__view'/)
    }
  })

  test('the modal level beats every other declared level', () => {
    const byFile = zIndexesByFile()
    const dialogEntry = byFile.find((e) => e.file === DIALOG_CSS)
    expect(dialogEntry, 'ConfirmDialog.css must declare a modal z-index').toBeDefined()
    const modal = Math.max(...dialogEntry!.levels)

    for (const { file, levels } of byFile) {
      if (file === DIALOG_CSS) continue
      expect(
        Math.max(...levels),
        `${path.basename(file)} declares a z-index at or above the modal layer (${modal}). `
          + 'A dialog opened from that surface would render behind it — raise '
          + 'the dialog scrim/content instead of leaving them tied.',
      ).toBeLessThan(modal)
    }
  })

  /*
   * The z-index has to be on the two *fixed* children AND on the `DialogView`
   * wrapper — the two platforms order fixed descendants differently, so either
   * half alone fixes exactly one platform:
   *
   * Android re-stacks a `position: fixed` box at the page root by its own
   * z-index (auto = 0), so the fixed scrim and content escape the wrapper's
   * stacking context — a z-index on `.confirm-dialog__view` orders nothing
   * there. With the level left off the children the dialog sank behind the
   * sheet (z-index 100) / player (z-index 1) that opened it on Android; it only
   * "worked" on Web (fixed escapes to a top layer there) and over the bare page
   * (level-0 content, DOM order).
   *
   * Web (web-elements) is the mirror image: every Lynx element is an isolated
   * stacking context, so the children's 200/201 do NOT pierce an `auto` wrapper
   * — the wrapper itself ranks at 0 and sinks below any z-index: 100 overlay it
   * was opened beside. That is how the play-history panel's clear-confirm
   * dialog stayed fully hidden under the panel on Web while the same markup
   * worked on Android (browser-verified: a level on the wrapper alone brought
   * it back). Content sits one above its own scrim so the card and its
   * outside-tap layer cover the dim.
   */
  test('the fixed scrim and content carry the modal z-index, above the overlays', () => {
    const css = readFileSync(DIALOG_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const zOf = (selector: string): number => {
      const rule = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))
      expect(rule, `${selector} rule not found in ConfirmDialog.css`).not.toBeNull()
      const z = rule![1].match(/z-index:\s*(-?\d+)/)
      expect(
        z,
        `${selector} must declare a z-index: it is position: fixed, so on Android it `
          + 're-stacks at the page root and would otherwise sink behind any overlay '
          + 'it is opened over. A z-index on the DialogView wrapper does not help — '
          + 'these fixed children escape it.',
      ).not.toBeNull()
      return Number(z![1])
    }

    const backdrop = zOf('.confirm-dialog__backdrop')
    const content = zOf('.confirm-dialog__content')
    // Above the app's overlay layer (100/101), and content above its own scrim so
    // the card and outside-tap layer are not dimmed by it.
    expect(backdrop, 'the scrim must clear the app overlay layer (101)').toBeGreaterThan(101)
    expect(content, 'the content/card layer must sit above its own scrim').toBeGreaterThan(backdrop)
  })

  /* The other half of the pair — see the block above for why a level on the
   * wrapper is what makes Web order the dialog above the overlay that opened
   * it. Without it the children's 200/201 are trapped inside an `auto` wrapper
   * ranked at 0. */
  test('the DialogView wrapper carries the modal z-index too (Web ordering)', () => {
    const css = readFileSync(DIALOG_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = css.match(/\.confirm-dialog__view\s*\{([^}]*)\}/)
    expect(rule, '.confirm-dialog__view rule not found in ConfirmDialog.css').not.toBeNull()
    const z = rule![1].match(/z-index:\s*(-?\d+)/)
    expect(
      z,
      '.confirm-dialog__view must declare a z-index: on Web every Lynx element is an '
        + 'isolated stacking context, so the fixed children cannot pierce an `auto` '
        + 'wrapper — it ranks at 0 and sinks below the z-index: 100 overlay the '
        + 'dialog was opened beside.',
    ).not.toBeNull()
    expect(Number(z![1]), 'the wrapper must clear the app overlay layer (101)').toBeGreaterThan(101)
  })
})

/**
 * The dialog closes as soon as its fade ends, not after a fixed stall.
 *
 * lynx-ui-presence keeps a dialog mounted while it "leaves" and, with no
 * animation to end that state, spins its fallback for MAX_WAIT_FRAMES (24) — the
 * dialog froze on screen ~a second after cancel/confirm before disappearing.
 * Opting the scrim and content into the presence `transition` classes and fading
 * `opacity` on `ui-leaving` fires `transitionend`, which lets presence tear the
 * dialog down the moment the fade completes. None of this is observable in the
 * render env (no layout, the Dialog stand-in drops these props), so it is pinned
 * statically — the same reason as the block above.
 */
describe('dialogs close on the fade, not on the presence fallback stall', () => {
  const DIALOG_CSS = path.resolve(__dirname, '../ConfirmDialog.css')

  test('both dialog views opt their scrim and content into the transition classes', () => {
    for (const file of DIALOG_COMPONENTS) {
      const src = readFileSync(path.resolve(__dirname, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      for (const tag of ['DialogBackdrop', 'DialogContent']) {
        expect(
          openTag(src, tag),
          `${file}: <${tag}> must set \`transition\` so presence adds \`ui-leaving\` and `
            + 'the exit fade can fire transitionend — without it the dialog lingers '
            + 'for presence\'s 24-frame fallback after cancel/confirm.',
        ).toMatch(/\btransition\b/)
      }
    }
  })

  test('the scrim and content fade out on ui-leaving', () => {
    const css = readFileSync(DIALOG_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const base of ['.confirm-dialog__backdrop', '.confirm-dialog__content']) {
      const rule = css.match(new RegExp(`\\${base}\\s*\\{([^}]*)\\}`))
      expect(rule, `${base} rule not found`).not.toBeNull()
      expect(
        rule![1],
        `${base} must declare a \`transition\` on opacity so the leave animates and `
          + 'presence unmounts on transitionend.',
      ).toMatch(/transition:[^;]*opacity/)
    }
    // The leave is what animates; opening stays instant because nothing else
    // touches opacity.
    const leaving = css.match(/\.ui-leaving[^{]*\{([^}]*)\}/)
    expect(leaving, 'a .ui-leaving rule must fade the dialog out').not.toBeNull()
    expect(leaving![1]).toMatch(/opacity:\s*0/)
  })
})

/*
 * The constructive affirmative is a SOLID accent fill — the app's
 * primary-action language (login, the info dialog's write-tags pill).
 *
 * Found on device with no theme pack: --accent falls back to the ink colour,
 * so the old ghost hairline rendered "save" as a black-on-white outline nearly
 * identical to cancel's grey one — the primary action carried no emphasis and
 * was reported as broken. --accent-content (never a literal white) is the
 * paired foreground that keeps the label legible in both themes. (P8 renamed
 * the --primary/--primary-content aliases to --accent/--accent-content.)
 */
describe('the affirmative dialog button reads as the primary action', () => {
  const DIALOG_CSS = path.resolve(__dirname, '../ConfirmDialog.css')

  test('submit is a solid accent fill with the paired foreground', () => {
    const css = readFileSync(DIALOG_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const btn = css.match(/\.confirm-dialog__btn--submit\s*\{([^}]*)\}/)
    expect(btn, '.confirm-dialog__btn--submit rule not found').not.toBeNull()
    expect(btn![1], 'the submit body must be a solid accent fill, not a ghost')
      .toMatch(/background-color:\s*var\(--accent\)/)
    const text = css.match(/\.confirm-dialog__btn-text--submit\s*\{([^}]*)\}/)
    expect(text, '.confirm-dialog__btn-text--submit rule not found').not.toBeNull()
    expect(text![1], 'the label must use --accent-content (legible in both themes)')
      .toMatch(/color:\s*var\(--accent-content\)/)
  })
})

/*
 * The tall song dialogs keep their title/header row on screen — and the
 * clamp that does it is the one on the scrolling BODY, not the card.
 *
 * Three rounds of device reports proved the card-level max-height (% → vh →
 * measured px) cannot do it alone: the card clamps, but the body's flex
 * shrink (`flex-shrink: 1` + `min-height: 0` on a scroll-view flex child)
 * does not propagate on the native engines, so the body kept its content
 * height (~850px on the remote form), re-stretched the card past the clamp
 * and off the top of the screen — the pinned title row sat cropped under
 * the status bar every time. Constraining the scroll-view DIRECTLY removes
 * the whole flex-propagation chain (a max-height on the scroll-view itself
 * is its core sizing semantics — every list page relies on it).
 *
 * Both levels are asserted: the body clamp is load-bearing, the card-level
 * one (stylesheet vh + inline px) stays as a belt-and-braces cap.
 */
describe('the tall song dialogs clamp their scrolling body directly', () => {
  const TALL_DIALOGS = [
    { tsx: '../../../features/library/widgets/SongInfoDialog.tsx', css: '../../../features/library/widgets/SongInfoDialog.css' },
    { tsx: '../../../features/library/widgets/SongEditDialog.tsx', css: '../../../features/library/widgets/SongEditDialog.css' },
  ]

  test('the scrolling body carries the inline px clamp (load-bearing)', () => {
    for (const { tsx } of TALL_DIALOGS) {
      const src = readFileSync(path.resolve(__dirname, tsx), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      expect(
        src,
        `${tsx}: the scroll-view body must set style={{ maxHeight: dialogBodyMaxHeight() }} `
          + '— the card-level clamp alone leaves the body at content height on the '
          + 'native engines and the title row off the screen',
      ).toMatch(/<scroll-view[\s\S]*?style=\{\{\s*maxHeight:\s*dialogBodyMaxHeight\(\)\s*\}\}/)
    }
  })

  test('the stylesheet card clamp reads the viewport (vh), never a percentage', () => {
    for (const { css } of TALL_DIALOGS) {
      const text = readFileSync(path.resolve(__dirname, css), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      const cap = text.match(/max-height:\s*([^;]+);/)
      expect(cap, `${css}: the card must declare a max-height clamp`).not.toBeNull()
      expect(
        cap![1].trim(),
        `${css}: the stylesheet clamp is the Web half — vh, not a percentage`,
      ).toMatch(/^85vh$/)
    }
  })

  test('the card-level inline px clamp is still there (belt and braces)', () => {
    for (const { tsx } of TALL_DIALOGS) {
      const src = readFileSync(path.resolve(__dirname, tsx), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      expect(
        src,
        `${tsx}: the card view keeps its inline maxHeight as the outer cap`,
      ).toMatch(/maxHeight:\s*dialogCardMaxHeight\(\)/)
    }
  })

  /*
   * The pinned chrome must not shrink. Flex spreads a clamped container's
   * overflow across EVERY child with a non-zero shrink factor, weighted by
   * basis — and these bodies use `flex-basis: auto` (a zero basis would
   * collapse them while the card is un-clamped), so the weighting does not
   * spare the small rows. Measured on Web with the remote edit form (body
   * content 848px, card clamped to 624px): the title resolved to 13.4px
   * against a 22px content height and, since every Lynx element carries
   * `overflow: clip`, rendered with its top half cut off — reported as "the
   * dialog title is covered". The action row went to 21.8px of its 36px while
   * `.confirm-dialog__btn` kept its fixed 36px, so the buttons spilled past
   * the card's content box.
   *
   * The three sheets that also pair a column flex box with a percentage
   * max-height (`play-history` / `more-tabs` / `playlist-desc`) are immune
   * without this: their scroll areas use `flex: 1`, i.e. basis 0, so the
   * weighted shrink of the list is 0 and the grow factor absorbs the slack
   * instead. Only these two cards use basis auto.
   */
  test('the pinned title/header and action rows never shrink', () => {
    const CHROME = [
      { css: '../../../features/library/widgets/SongInfoDialog.css', rule: 'song-info-dialog__header' },
      { css: '../../../features/library/widgets/SongEditDialog.css', rule: 'song-edit-dialog__title' },
      { css: '../ConfirmDialog.css', rule: 'confirm-dialog__actions' },
    ]
    for (const { css, rule } of CHROME) {
      const text = readFileSync(path.resolve(__dirname, css), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      const block = text.match(new RegExp(`\\.${rule}\\s*\\{([^}]*)\\}`))
      expect(block, `${css}: .${rule} rule not found`).not.toBeNull()
      expect(
        block![1],
        `${css}: .${rule} must declare flex-shrink: 0 — the card's height clamp `
          + 'otherwise squeezes this row and Lynx\'s overflow: clip crops it',
      ).toMatch(/flex-shrink:\s*0\b/)
    }
  })

  test('the scrolling body is the one child allowed to shrink', () => {
    for (const { css } of TALL_DIALOGS) {
      const text = readFileSync(path.resolve(__dirname, css), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      const block = text.match(/\.song-(?:info|edit)-dialog__body\s*\{([^}]*)\}/)
      expect(block, `${css}: the body rule not found`).not.toBeNull()
      expect(
        block![1],
        `${css}: the body must keep flex-shrink: 1 — with the chrome pinned it is `
          + 'the only child that can absorb the overflow',
      ).toMatch(/flex-shrink:\s*1\b/)
    }
  })
})

/*
 * Every song dialog renders at the SAME fixed width.
 *
 * The cards used to be content-driven up to a max-width, so long-metadata
 * songs got wide cards and short ones narrow cards — and the info→edit
 * single-slot swap jumped the card's width (reported from device). The width
 * is now fixed per platform with the same two-halves split as the height
 * clamp above: the stylesheet (`width: calc(100vw - 64px)` capped at
 * SONG_DIALOG_WIDTH_PX) on Web, an inline measured px on the native engines.
 */
describe('every song dialog renders at the same fixed width', () => {
  const SONG_DIALOGS = [
    { tsx: '../../../features/library/widgets/SongInfoDialog.tsx', css: '../../../features/library/widgets/SongInfoDialog.css' },
    { tsx: '../../../features/library/widgets/SongEditDialog.tsx', css: '../../../features/library/widgets/SongEditDialog.css' },
  ]

  test('the stylesheet pins the width — one calc, one cap, in both files', () => {
    for (const { css } of SONG_DIALOGS) {
      const text = readFileSync(path.resolve(__dirname, css), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      expect(
        text,
        `${css}: the card must be width: calc(100vw - 64px) (64 = the two --space-6 `
          + 'margins) so narrow screens shrink it instead of clipping',
      ).toMatch(/width:\s*calc\(100vw - 64px\)/)
      expect(
        text,
        `${css}: the cap must equal SONG_DIALOG_WIDTH_PX (${SONG_DIALOG_WIDTH_PX}px)`,
      ).toMatch(new RegExp(`max-width:\\s*${SONG_DIALOG_WIDTH_PX}px`))
    }
  })

  test('the components pass the one shared preferred width', () => {
    for (const { tsx } of SONG_DIALOGS) {
      const src = readFileSync(path.resolve(__dirname, tsx), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      expect(
        src,
        `${tsx}: both song dialogs must pass SONG_DIALOG_WIDTH_PX — a literal per `
          + 'file is how the two cards drift apart again',
      ).toMatch(new RegExp(`width:\\s*dialogCardWidth\\(SONG_DIALOG_WIDTH_PX\\)`))
    }
  })
})

/*
 * `dialogCardMaxHeight` — the native half of the clamp above.
 *
 * Web MUST be excluded: SystemInfo reports the browser *screen* there, not
 * the lynx-view (measured 800×600 against a 420×900 view), so a computed
 * value would be wrong in either direction — Web keeps the stylesheet vh.
 * On device the px value is viewport-height × 0.85 (matching the 85vh),
 * divided through pixelRatio because SystemInfo reports physical pixels.
 */
describe('dialogCardMaxHeight', () => {
  const setSystemInfo = (info: Record<string, unknown> | undefined) => {
    ;(globalThis as Record<string, unknown>).SystemInfo = info
  }

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).SystemInfo
  })

  test('device: 85% of the CSS-pixel viewport height', () => {
    setSystemInfo({ platform: 'Android', pixelHeight: 2400, pixelRatio: 3 })
    expect(dialogCardMaxHeight()).toBe(`${Math.round((2400 / 3) * 0.85)}px`)
  })

  test('web: undefined — the stylesheet vh owns the clamp there', () => {
    setSystemInfo({ platform: 'web', pixelHeight: 600, pixelRatio: 1 })
    expect(dialogCardMaxHeight()).toBeUndefined()
  })

  test('no host SystemInfo: undefined, never a crash', () => {
    setSystemInfo(undefined)
    expect(dialogCardMaxHeight()).toBeUndefined()
  })
})

/*
 * `dialogCardWidth` — the native half of the width fix. Wide screens get the
 * preferred width verbatim; narrow ones shrink to viewport minus the card
 * margins (2 × --space-6 = 64), never wider than the screen. Web is excluded
 * for the same reason as the height (SystemInfo reports the browser screen
 * there, not the lynx-view).
 */
describe('dialogCardWidth', () => {
  const setSystemInfo = (info: Record<string, unknown> | undefined) => {
    ;(globalThis as Record<string, unknown>).SystemInfo = info
  }

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).SystemInfo
  })

  test('wide device: the preferred width verbatim', () => {
    setSystemInfo({ platform: 'iOS', pixelWidth: 2048, pixelRatio: 2 })
    expect(dialogCardWidth(440)).toBe('440px')
  })

  test('narrow device: viewport minus the two card margins', () => {
    setSystemInfo({ platform: 'Android', pixelWidth: 1080, pixelRatio: 3 })
    // 1080/3 = 360dp viewport − 64px margins = 296px
    expect(dialogCardWidth(440)).toBe('296px')
  })

  test('web: undefined — the stylesheet calc owns the width there', () => {
    setSystemInfo({ platform: 'web', pixelWidth: 800, pixelRatio: 1 })
    expect(dialogCardWidth(440)).toBeUndefined()
  })

  test('no host SystemInfo: undefined, never a crash', () => {
    setSystemInfo(undefined)
    expect(dialogCardWidth(440)).toBeUndefined()
  })
})

/*
 * `dialogBodyMaxHeight` — the load-bearing clamp's value: the CARD clamp
 * (0.85 of the CSS-pixel viewport height) minus the card's fixed chrome, so
 * `chrome + body` can never exceed the cap the card itself carries.
 *
 * It was a flat 0.75 share, which cannot co-exist with the 0.85 cap:
 * `0.75H + chrome > 0.85H` for every viewport below ~1240dp, so on any phone a
 * long form made the card want 0.9H, get capped at 0.85H, and lose the
 * difference off the BOTTOM — cropping the action row. Deriving the value keeps
 * the two clamps consistent by construction.
 *
 * Web is excluded (the flex chain works there and SystemInfo reports the
 * browser screen); absurdly small results (< 200px) are treated as no
 * constraint rather than a degenerate card.
 */
describe('dialogBodyMaxHeight', () => {
  const setSystemInfo = (info: Record<string, unknown> | undefined) => {
    ;(globalThis as Record<string, unknown>).SystemInfo = info
  }

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).SystemInfo
  })

  test('device: the card clamp minus the card chrome', () => {
    setSystemInfo({ platform: 'Android', pixelHeight: 2400, pixelRatio: 3 })
    // 2400/3 = 800dp × 0.85 = 680px card − 168px chrome = 512px body
    expect(dialogBodyMaxHeight()).toBe('512px')
  })

  test('body + chrome never exceeds the card clamp on any plausible viewport', () => {
    for (const dp of [560, 640, 720, 800, 900, 1024, 1366]) {
      setSystemInfo({ platform: 'Android', pixelHeight: dp * 2, pixelRatio: 2 })
      const body = dialogBodyMaxHeight()
      const card = dialogCardMaxHeight()
      expect(body, `${dp}dp: expected a body clamp`).toBeDefined()
      expect(card, `${dp}dp: expected a card clamp`).toBeDefined()
      expect(
        Number.parseInt(body!, 10) + CARD_CHROME_PX,
        `${dp}dp: body + chrome must fit inside the card clamp, or the overflow `
          + 'comes off the bottom and crops the action row',
      ).toBeLessThanOrEqual(Number.parseInt(card!, 10))
    }
  })

  test('web: undefined — the stylesheet chain owns the body size there', () => {
    setSystemInfo({ platform: 'web', pixelHeight: 600, pixelRatio: 1 })
    expect(dialogBodyMaxHeight()).toBeUndefined()
  })

  test('no host SystemInfo: undefined, never a crash', () => {
    setSystemInfo(undefined)
    expect(dialogBodyMaxHeight()).toBeUndefined()
  })

  test('a degenerate viewport yields no clamp rather than a broken one', () => {
    // 400/1 × 0.85 − 168 = 172px < 200 → refuse the constraint entirely
    setSystemInfo({ platform: 'Android', pixelHeight: 400, pixelRatio: 1 })
    expect(dialogBodyMaxHeight()).toBeUndefined()
  })
})

/*
 * The two action buttons of every dialog are structurally identical views.
 *
 * The cancel button used to sit inside lynx-ui's DialogClose, which renders a
 * full lynx-ui Button — its own default padding/min-height wrapped our view,
 * and the pair was NEVER the same height (reported from device, visible on
 * Web too: cancel 38px vs save 32px). The wrapper also fired a redundant
 * second close on every cancel tap. The fix removed the wrapper everywhere
 * and gave `.confirm-dialog__btn` an explicit height; these two assertions
 * keep both halves from regressing.
 */
describe('the dialog action buttons are one structural pair', () => {
  test('no dialog wraps a button in DialogClose any more', () => {
    for (const file of DIALOG_COMPONENTS) {
      const src = readFileSync(path.resolve(__dirname, file), 'utf8')
      expect(
        src,
        `${file}: DialogClose renders a lynx-ui Button around its child, which `
          + 'made the cancel/confirm buttons unequal in height — use the bare '
          + 'view (its bindtap already closes the dialog)',
      ).not.toContain('<DialogClose')
    }
  })

  /*
   * Pins that the height is *explicit*, not what it is. It read `36px` until the
   * HIG tap-target pass took it to `--tap-target`, and pinning the literal made
   * this test fail for a change that was strictly correct — the same stale-literal
   * trap as the global menu's `--paper` gate. What has to hold is that some fixed
   * height is declared here, since that is what makes the pair equal; the floor it
   * has to clear belongs to `a11y-tap-target.test.ts`, which derives it.
   */
  test('the shared button rule pins an explicit height', () => {
    const css = readFileSync(path.resolve(__dirname, '../ConfirmDialog.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = css.match(/\.confirm-dialog__btn\s*\{([^}]*)\}/)
    expect(rule, '.confirm-dialog__btn rule not found').not.toBeNull()
    expect(
      rule![1],
      'the explicit height is what makes the pair equal on both platforms — '
        + 'without it the heights are content-driven and drift',
    ).toMatch(/height:\s*(\d+px|var\(--tap-target\)|var\(--control-height\))/)
  })

  /*
   * The action row's height is duplicated in `dialog-viewport.ts`, because the
   * body clamp it feeds is an inline px style computed in JS on the native
   * engines and JS cannot read a custom property. AGENTS.md warns what a drift
   * between the two costs: `CARD_CHROME_PX` includes this height, so a button
   * that grows without the constant following makes `chrome + body` exceed the
   * card's own 0.85H clamp, the overflow comes off the BOTTOM, and the action
   * row is cropped — 「卡片钳制与 body 钳制不自洽」.
   *
   * That drift is not hypothetical: the HIG tap-target pass took this button
   * from 36px to `--tap-target` and the whole suite stayed green, because
   * nothing tied the two numbers together. This is that tie. It resolves the
   * token through tokens.css rather than hard-coding 44, so the gate keeps
   * holding if the token itself is ever retuned.
   */
  test('the action row height in dialog-viewport matches the stylesheet', () => {
    const css = readFileSync(path.resolve(__dirname, '../ConfirmDialog.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const declared = css.match(/\.confirm-dialog__btn\s*\{[^}]*height:\s*([^;]+);/)
    expect(declared, '.confirm-dialog__btn declares no height').not.toBeNull()

    const raw = declared![1].trim()
    let px: number
    const token = raw.match(/^var\(\s*(--[\w-]+)\s*\)$/)
    if (token != null) {
      const tokens = readFileSync(path.resolve(__dirname, '../../theme/tokens.css'), 'utf8')
      const value = tokens.match(new RegExp(`${token[1]}:\\s*(\\d+)px`))
      expect(value, `${token[1]} is not defined in tokens.css`).not.toBeNull()
      px = Number.parseInt(value![1], 10)
    } else {
      const literal = raw.match(/^(\d+)px$/)
      expect(literal, `cannot resolve the button height \`${raw}\` to px`).not.toBeNull()
      px = Number.parseInt(literal![1], 10)
    }

    expect(
      ACTION_ROW_PX,
      `.confirm-dialog__btn is ${px}px but ACTION_ROW_PX says ${ACTION_ROW_PX} — update `
        + 'dialog-viewport.ts, or the song dialogs\' body clamp leaves the wrong room '
        + 'for the action row and crops it (AGENTS.md: 卡片钳制与 body 钳制不自洽)',
    ).toBe(px)
  })
})
