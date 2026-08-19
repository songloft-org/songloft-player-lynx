/**
 * The "press back again to exit" window.
 *
 * Module-level and time-based rather than store state, for two reasons:
 *  - It is not renderable — the toast is the whole UI. Same call as
 *    `toast-store`'s dismiss timer and `shell-navigation`'s last-tab memory.
 *  - A timestamp **self-heals**. On Android the second press is handled by the
 *    host itself (see `back-controller`), so JS never learns the app was
 *    backgrounded; anything stateful would stay armed forever. An expiry that is
 *    simply in the past needs no cleanup.
 */

/** How long the second press counts as "again". */
export const EXIT_PROMPT_WINDOW_MS = 2000

let armedUntil = 0

/** Whether a second press at `now` should exit rather than re-prompt. */
export function isExitArmed(now: number): boolean {
  return now > 0 && now < armedUntil
}

/** Start the window at `now`; returns when it expires. */
export function armExitPrompt(now: number): number {
  armedUntil = now + EXIT_PROMPT_WINDOW_MS
  return armedUntil
}

/** Cancel the window (the user navigated away from the tab root). */
export function disarmExitPrompt(): void {
  armedUntil = 0
}

/** Test hook: module state outlives `render()`. */
export function resetExitPromptForTests(): void {
  armedUntil = 0
}
