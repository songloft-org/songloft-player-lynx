/**
 * Test stub for `@lynx-js/motion`.
 *
 * The real package's dist uses import attributes (`with { runtime: 'shared' }`)
 * that Node's ESM loader rejects, so any test transitively importing a component
 * that marquees would fail to collect. Marquee animation is a host-side concern
 * (like the lynx invoke bridge) — under Vitest `animate` is a no-op whose
 * controls only record `stop()` calls.
 */
export interface StubAnimationControls {
  stop: () => void
}

export function animate(
  _target: unknown,
  _keyframes: unknown,
  _options?: unknown,
): StubAnimationControls {
  const controls = { stop: () => {} }
  return controls
}
