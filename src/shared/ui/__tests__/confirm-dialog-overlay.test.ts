import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

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
