import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Structural gate: the plugin grid's drag-sort mode must prevent the outer
 * scroll-view from scrolling on both Lynx native (via `consume-slide-event`)
 * and Web (via CSS `touch-action: none`).
 *
 * **Why.** `@lynx-js/lynx-ui-draggable` uses `main-thread:bindtouchmove`,
 * which does not stop touch events from bubbling. Without explicit gesture
 * ownership the outer `<scroll-view>` on `HomePage` captures the vertical
 * swipe and scrolls the entire page while the user is trying to reorder
 * plugin cards.
 *
 * - **Lynx native**: `consume-slide-event={[[-180, 180]]}` tells the native
 *   gesture system to give this surface ownership of all slide directions.
 * - **Web**: `touch-action: none` prevents the browser from initiating a
 *   native pan gesture inside the drag area.
 */

const repoRoot = path.resolve(__dirname, '..', '..')
const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), 'utf8')

describe('PluginGrid drag-sort scroll prevention', () => {
  const gridTsx = read('src/features/jsplugin/widgets/PluginGrid.tsx')
  const gridCss = read('src/features/jsplugin/widgets/PluginGrid.css')

  test('EditableGrid container has consume-slide-event for Lynx native', () => {
    // The EditableGrid (rendered only during sort mode) must declare
    // `consume-slide-event` on its items container to claim gesture ownership
    // from the outer scroll-view on Lynx native platforms.
    expect(
      gridTsx,
      'EditableGrid must set consume-slide-event on its items container',
    ).toMatch(/consume-slide-event=\{?\[?\[?\s*-180\s*,\s*180\s*\]/)
  })

  test('sort-active class applies touch-action: none for Web', () => {
    // When the grid is in sort/edit mode, `touch-action: none` must cover the
    // entire grid area (not just the 40×40 drag handle) so that touch drags
    // anywhere on the grid do not trigger the browser's native pan/scroll.
    expect(
      gridCss,
      '.plugin-grid__items--sort-active must set touch-action: none',
    ).toMatch(/\.plugin-grid__items--sort-active\s*\{[^}]*touch-action:\s*none/)
  })

  test('EditableGrid items view has the sort-active class', () => {
    // The sort-active CSS class must actually be applied to the items container
    // in the EditableGrid component so the CSS rule takes effect.
    expect(
      gridTsx,
      'EditableGrid must apply plugin-grid__items--sort-active class',
    ).toContain('plugin-grid__items--sort-active')
  })
})
