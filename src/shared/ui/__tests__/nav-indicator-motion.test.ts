import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Flow-indicator gate: the bottom-bar and segmented-control sliding indicators
 * use the jelly spring (bottom bar) or token-based transitions (segmented).
 * Both honor reduce-motion. The indicators also
 * carry the correct selection token (`--tint-fill` for the nav capsule,
 * `--tertiary-system-background` + `--shadow-sm` for the segmented thumb).
 */

const SRC = path.resolve(__dirname, '../../..')

function rules(relPath: string): string {
  return readFileSync(path.join(SRC, relPath), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
}

test('.nav-indicator delegates motion to the jelly spring without a competing CSS transition', () => {
  const css = rules('shared/layouts/ShellLayout.css')
  const body = ruleBody(css, '.nav-indicator')
  expect(body).toBeTruthy()
  expect(body).not.toMatch(/transition:/)
  expect(body).toMatch(/overflow:\s*visible/)
  expect(body).toMatch(/pointer-events:\s*none/)
  // Without a stacking context native negative blur/tint layers leave the
  // capture root, producing an opaque accent-colored moving lens.
  expect(ruleBody(css, '.shell__tab-backdrop')).toMatch(/z-index:\s*0/)
  const shell = rules('shared/layouts/ShellLayout.tsx')
  expect(shell).toMatch(/<LiquidTabIndicator\s+key=\{indicatorSlotCount\}/)
})

test('.nav-indicator__pill carries the selection tint and pill metrics', () => {
  const css = rules('shared/layouts/ShellLayout.css')
  const body = ruleBody(css, '.nav-indicator__pill')
  expect(body, '.nav-indicator__pill must use --tint-fill').toMatch(/background-color:\s*var\(--tint-fill\)/)
  expect(body, '.nav-indicator__pill must use --nav-pill-height').toMatch(/height:\s*var\(--nav-pill-height\)/)
  expect(body, '.nav-indicator__pill must use --radius-pill').toMatch(/border-radius:\s*var\(--radius-pill\)/)
  // Must NOT use the decorative glass glow — selection is accent, not decoration.
  expect(body, '.nav-indicator__pill must not use --material-glow-faint').not.toMatch(/var\(--material-glow-faint\)/)
})

test('.segmented__indicator transitions transform with motion tokens', () => {
  const css = rules('features/settings/widgets/SegmentedControl.css')
  const body = ruleBody(css, '.segmented__indicator')
  expect(body, '.segmented__indicator must exist with a transition rule').toBeTruthy()
  expect(body, '.segmented__indicator transition must use --duration and --ease tokens').toMatch(
    /transition:\s*transform\s+var\(--duration-normal\)\s+var\(--ease-spring-bounce\)/,
  )
})

test('.segmented__indicator carries the raised thumb style', () => {
  const css = rules('features/settings/widgets/SegmentedControl.css')
  const body = ruleBody(css, '.segmented__indicator')
  expect(body).toMatch(/background-color:\s*var\(--tertiary-system-background\)/)
  expect(body).toMatch(/box-shadow:\s*var\(--shadow-sm\)/)
})
