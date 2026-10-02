import { readSystemInfo } from '../../native/native-modules.js'
import { isWebPlatform } from '../../native/web-platform.js'

/**
 * The one preferred width both song dialogs share — they must render at the
 * SAME width or switching between them (the info dialog's "edit" button does
 * a single-slot swap) visibly jumps the card (reported from device: "some
 * song dialogs wide, some narrow").
 *
 * Lives here next to its helper so the CSS halves (both stylesheets' 440px
 * caps) and the TSX halves can be asserted against the one constant's value
 * in confirm-dialog-overlay.test.ts.
 */
export const SONG_DIALOG_WIDTH_PX = 440

/** Shared form/confirmation card width, also used by plugin dialogs. */
export const DIALOG_WIDTH_PX = 440

/** Padding, two title lines at the largest font scale, and up to three 44px
 * action rows with their gaps. Keep the shared body's CSS clamp in sync. */
export const DIALOG_CHROME_PX = 280

/** Direct body clamp for dialogs whose actions can wrap onto multiple rows. */
export function dialogContentMaxHeight(): string | undefined {
  const cardHeight = dialogCardMaxHeight()
  if (cardHeight == null) return undefined
  return `${Math.max(1, parseFloat(cardHeight) - DIALOG_CHROME_PX)}px`
}

/** The dialog cards' margin on each side — `--space-6` (tokens.css) in px. */
const CARD_MARGIN_PX = 32

/**
 * The height of a dialog's action row, in px — `.confirm-dialog__btn`'s height,
 * which is the whole row's height: `.confirm-dialog__actions` adds no padding of
 * its own and the buttons carry no vertical margin.
 *
 * Exported only so `confirm-dialog-overlay.test.ts` can assert it still equals
 * the stylesheet's value. It has to be duplicated from CSS at all because the
 * chrome below feeds a native-only inline style computed in JS, which cannot read
 * a custom property — and the point of that gate is that the duplicate cannot
 * drift. It read 36 until the HIG tap-target pass took the button to
 * `--tap-target`, which is precisely the drift AGENTS.md warns about.
 */
export const ACTION_ROW_PX = 44

/**
 * The tall song cards' fixed chrome ABOVE the action row, in px: the card's two
 * `--space-5` paddings + hairlines, the pinned title/header row and its margin,
 * and the body's own bottom margin.
 *
 * Measured on Web (`card.height − body.height − action row`): 96 for the edit
 * dialog's one-line title, 118 for the info dialog's 44px cover header. The
 * constant is the larger case rounded up, so the body clamp under-shoots rather
 * than over-shoots — an unused sliver at the bottom of a short card is
 * invisible, whereas over-shooting crops the action row.
 */
const CARD_CHROME_ABOVE_ACTIONS_PX = 124

/**
 * The tall song cards' whole fixed chrome — everything the scrolling body has to
 * leave room for.
 *
 * Derived rather than written as one literal because the action row's height is a
 * design decision that has already changed once, and AGENTS.md warns what happens
 * when it changes without this constant following: the card still clamps at 0.85H
 * but `chrome + body` now exceeds it, the difference comes off the BOTTOM, and the
 * action row is cropped — the known 「卡片钳制与 body 钳制不自洽」 bug. Splitting
 * the measured part from the button height makes that sync a single number, and
 * the gate in `confirm-dialog-overlay.test.ts` makes it fail loudly if skipped.
 */
export const CARD_CHROME_PX = CARD_CHROME_ABOVE_ACTIONS_PX + ACTION_ROW_PX

/**
 * The viewport-based `max-height` for a tall dialog card, in px — or undefined
 * when the stylesheet should own it.
 *
 * Why not CSS alone: the card's clamp has to survive every backend, and the
 * percentage AND `vh` flavours both failed on device — a percentage resolves
 * against the containing block (unreliable under the fixed dialog layer), and
 * `vh` resolution fared no better there. With the clamp silently ineffective
 * the remote edit form (scrollHeight ~850) centre-overflowed the card past the
 * top of the screen, cropping the pinned title row under the status bar
 * (reported twice from device). A measured px value is the only flavour no
 * layout engine can reinterpret.
 *
 * Web is excluded: there `SystemInfo` reports the browser *screen*, not the
 * lynx-view (measured 800×600 against a 420×900 view — see
 * `anchored-overlay.ts`), so the computed value would be wrong in either
 * direction. The stylesheet's `85vh` is a real browser unit on that platform
 * and already does the job.
 *
 * The share is 0.85 to match the stylesheet's `85vh` — keep the two in sync
 * (they are asserted together in `confirm-dialog-overlay.test.ts`).
 */
export function dialogCardMaxHeight(): string | undefined {
  if (isWebPlatform()) return undefined
  const info = readSystemInfo()
  if (info == null) return undefined
  const { pixelHeight, pixelRatio } = info
  if (typeof pixelHeight !== 'number' || typeof pixelRatio !== 'number') return undefined
  if (!Number.isFinite(pixelHeight) || !Number.isFinite(pixelRatio) || pixelHeight <= 0
    || pixelRatio <= 0) {
    return undefined
  }
  return `${Math.round((pixelHeight / pixelRatio) * 0.85)}px`
}

/**
 * The max-height for a song dialog's scrolling BODY, in px — or undefined when
 * the stylesheet should own it.
 *
 * This is the clamp that actually keeps the title row on screen. Three rounds
 * of device reports proved the CARD-level max-height (% → vh → measured px)
 * cannot do it alone: the card clamps, but the body shrink — `flex-shrink: 1`
 * + `min-height: 0` on a scroll-view flex child — does not propagate on the
 * native engines, so the body kept its content height (~850px on the remote
 * form), re-stretched the card past the clamp and off the top of the screen.
 * The card-level value is kept only as a belt-and-braces cap.
 *
 * Constraining the scroll-view DIRECTLY removes the whole chain: a max-height
 * on the scroll-view itself is its core sizing semantics (every list page
 * relies on it), so no flex propagation is involved.
 *
 * The value is the CARD's clamp minus the card's fixed chrome, NOT an
 * independent share of the viewport. It used to be a flat 0.75, which cannot
 * co-exist with the 0.85 card cap: `0.75H + chrome > 0.85H` holds for every
 * viewport below ~1240dp, i.e. every phone. Whenever the form was long enough
 * to use the whole body clamp, the card wanted 0.9H, got capped at 0.85H, and
 * the overflow came off the BOTTOM — cropping the action row. Deriving the body
 * clamp from the card clamp makes the two agree by construction.
 *
 * Web is excluded as in {@link dialogCardMaxHeight}: the whole chain works
 * there, and SystemInfo reports the browser screen rather than the lynx-view.
 */
export function dialogBodyMaxHeight(): string | undefined {
  if (isWebPlatform()) return undefined
  const info = readSystemInfo()
  if (info == null) return undefined
  const { pixelHeight, pixelRatio } = info
  if (typeof pixelHeight !== 'number' || typeof pixelRatio !== 'number') return undefined
  if (!Number.isFinite(pixelHeight) || !Number.isFinite(pixelRatio) || pixelHeight <= 0
    || pixelRatio <= 0) {
    return undefined
  }
  const px = Math.round((pixelHeight / pixelRatio) * 0.85) - CARD_CHROME_PX
  return px < 200 ? undefined : `${px}px`
}

/**
 * The FIXED width for a song dialog card, in px — or undefined when the
 * stylesheet should own it.
 *
 * Why fixed at all: the cards used to be content-driven up to a max-width, so
 * a song with long metadata got a wide card and one with short fields a narrow
 * one (and the info/edit pair rendered at different widths even for the same
 * song). A fixed width makes every song dialog identical.
 *
 * Same platform split as {@link dialogCardMaxHeight}: Web keeps the stylesheet
 * (`width: calc(100vw - 64px)` capped at the preferred px — a real browser
 * viewport unit there), the native engines get the measured px value inline
 * because the viewport-relative CSS units proved unreliable under the fixed
 * dialog layer. The value is the preferred width or the viewport minus the
 * card margins, whichever is smaller — never wider than the screen.
 */
export function dialogCardWidth(preferredPx: number): string | undefined {
  if (isWebPlatform()) return undefined
  const info = readSystemInfo()
  if (info == null) return undefined
  const { pixelWidth, pixelRatio } = info
  if (typeof pixelWidth !== 'number' || typeof pixelRatio !== 'number') return undefined
  if (!Number.isFinite(pixelWidth) || !Number.isFinite(pixelRatio) || pixelWidth <= 0
    || pixelRatio <= 0) {
    return undefined
  }
  const available = pixelWidth / pixelRatio - 2 * CARD_MARGIN_PX
  if (available < 1) return undefined
  return `${Math.round(Math.min(preferredPx, available))}px`
}
