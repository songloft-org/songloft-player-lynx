import { beforeEach, describe, expect, test } from 'vitest'

import {
  EXIT_PROMPT_WINDOW_MS,
  armExitPrompt,
  disarmExitPrompt,
  isExitArmed,
  resetExitPromptForTests,
} from '../exit-prompt.js'

beforeEach(() => {
  resetExitPromptForTests()
})

const T0 = 1_000_000

describe('the window', () => {
  test('nothing is armed until the first press', () => {
    expect(isExitArmed(T0)).toBe(false)
  })

  test('a press arms it for the whole window', () => {
    armExitPrompt(T0)
    expect(isExitArmed(T0 + 1)).toBe(true)
    expect(isExitArmed(T0 + EXIT_PROMPT_WINDOW_MS - 1)).toBe(true)
  })

  /**
   * Expiry is exclusive: at exactly the boundary the prompt is gone, so a slow second
   * press re-prompts rather than exiting. Erring that way is deliberate — exiting the
   * app by accident is much worse than one extra toast.
   */
  test('it expires at the boundary, not after it', () => {
    armExitPrompt(T0)
    expect(isExitArmed(T0 + EXIT_PROMPT_WINDOW_MS)).toBe(false)
    expect(isExitArmed(T0 + EXIT_PROMPT_WINDOW_MS + 5000)).toBe(false)
  })

  test('re-arming extends from the newer press', () => {
    armExitPrompt(T0)
    armExitPrompt(T0 + 1500)
    expect(isExitArmed(T0 + EXIT_PROMPT_WINDOW_MS + 500)).toBe(true)
  })

  test('arming reports when it expires', () => {
    expect(armExitPrompt(T0)).toBe(T0 + EXIT_PROMPT_WINDOW_MS)
  })

  test('navigating away disarms it', () => {
    armExitPrompt(T0)
    disarmExitPrompt()
    expect(isExitArmed(T0 + 1)).toBe(false)
  })
})

/**
 * On Android the *second* press is executed by the host itself (JS lowers the
 * `consumable` flag while armed), so JS is never told the app was backgrounded. A
 * timestamp is what makes that safe: the state cannot be left stale, because an
 * expiry in the past is indistinguishable from never having been armed.
 */
describe('self-healing after the host handled the exit', () => {
  test('a much later press is not treated as the second one', () => {
    armExitPrompt(T0)
    expect(isExitArmed(T0 + 60_000)).toBe(false)
  })

  test('a zero clock reads as unarmed rather than as inside the window', () => {
    // `Date.now()` is never 0 in practice, but a mocked or unavailable clock must not
    // turn the first press into an exit.
    armExitPrompt(T0)
    expect(isExitArmed(0)).toBe(false)
  })
})
