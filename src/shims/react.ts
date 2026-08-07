/**
 * `react` alias target for third-party libraries (TanStack Router).
 *
 * Re-exports ReactLynx's compat entry (which adds `startTransition` /
 * `useTransition` on top of the base runtime) and additionally provides a `use`
 * export. React 19's `use` is not implemented in ReactLynx, but TanStack Router
 * performs a namespace lookup `React["use"]` at module scope; without the named
 * export present, the bundler fails ESM linking. TanStack only *calls* `use` on
 * the `Await`/streaming path, which the walking skeleton never renders, so an
 * `undefined` stub is safe.
 */
export * from '@lynx-js/react/compat'
export { default } from '@lynx-js/react/compat'

export const use: undefined = undefined
