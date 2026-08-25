import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import {
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
 * The constructive affirmative is a SOLID primary fill — the app's
 * primary-action language (login, the info dialog's write-tags pill).
 *
 * Found on device with no theme pack: --primary falls back to the ink colour,
 * so the old ghost hairline rendered "save" as a black-on-white outline nearly
 * identical to cancel's grey one — the primary action carried no emphasis and
 * was reported as broken. --primary-content (never a literal white) is the
 * paired foreground that keeps the label legible in both themes.
 */
describe('the affirmative dialog button reads as the primary action', () => {
  const DIALOG_CSS = path.resolve(__dirname, '../ConfirmDialog.css')

  test('submit is a solid primary fill with the paired foreground', () => {
    const css = readFileSync(DIALOG_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const btn = css.match(/\.confirm-dialog__btn--submit\s*\{([^}]*)\}/)
    expect(btn, '.confirm-dialog__btn--submit rule not found').not.toBeNull()
    expect(btn![1], 'the submit body must be a solid primary fill, not a ghost')
      .toMatch(/background-color:\s*var\(--primary\)/)
    const text = css.match(/\.confirm-dialog__btn-text--submit\s*\{([^}]*)\}/)
    expect(text, '.confirm-dialog__btn-text--submit rule not found').not.toBeNull()
    expect(text![1], 'the label must use --primary-content (legible in both themes)')
      .toMatch(/color:\s*var\(--primary-content\)/)
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
 * `dialogBodyMaxHeight` — the load-bearing clamp's value. 0.75 of the
 * CSS-pixel viewport height: the body plus the card's fixed chrome
 * (title/header + action row + paddings ≈ 130–155px) lands the card ≤ ~90%
 * of the viewport, so the centred top edge — where the title sits — stays
 * on screen. Web is excluded (the flex chain works there and SystemInfo
 * reports the browser screen); absurdly small results (< 200px) are treated
 * as no constraint rather than a degenerate card.
 */
describe('dialogBodyMaxHeight', () => {
  const setSystemInfo = (info: Record<string, unknown> | undefined) => {
    ;(globalThis as Record<string, unknown>).SystemInfo = info
  }

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).SystemInfo
  })

  test('device: 75% of the CSS-pixel viewport height', () => {
    setSystemInfo({ platform: 'Android', pixelHeight: 2400, pixelRatio: 3 })
    // 2400/3 = 800dp × 0.75 = 600px body → card ≤ 600 + ~155 chrome < 800dp
    expect(dialogBodyMaxHeight()).toBe('600px')
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
    // 200/1 × 0.75 = 150px < 200 → refuse the constraint entirely
    setSystemInfo({ platform: 'Android', pixelHeight: 200, pixelRatio: 1 })
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

  test('the shared button rule pins an explicit height', () => {
    const css = readFileSync(path.resolve(__dirname, '../ConfirmDialog.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = css.match(/\.confirm-dialog__btn\s*\{([^}]*)\}/)
    expect(rule, '.confirm-dialog__btn rule not found').not.toBeNull()
    expect(
      rule![1],
      'the explicit height is what makes the pair equal on both platforms — '
        + 'without it the heights are content-driven and drift',
    ).toMatch(/height:\s*36px/)
  })
})
