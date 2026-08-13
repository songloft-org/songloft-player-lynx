import type { E2EDriver } from './types.js'

let stepCounter = 0

/**
 * Take a step screenshot with an auto-incrementing prefix for ordering.
 * Produces files like: `001-login-page.png`, `002-playing-state.png`
 *
 * Use in scenarios to document each meaningful step for human review.
 */
export async function stepScreenshot(
  driver: E2EDriver,
  description: string,
): Promise<string> {
  stepCounter++
  const prefix = String(stepCounter).padStart(3, '0')
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const name = `${prefix}-${slug}`
  return driver.screenshot(name)
}

/**
 * Reset the step counter (call in beforeAll of each scenario file).
 */
export function resetStepCounter(): void {
  stepCounter = 0
}
