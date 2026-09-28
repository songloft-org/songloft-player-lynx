import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'
import { vitestTestingLibraryPlugin } from '@lynx-js/react/testing-library/plugins'

const require = createRequire(import.meta.url)
const fromRoot = path => fileURLToPath(new URL(path, import.meta.url))

// Keep parity with the real Lynx build (lynx.config.ts): third-party libraries
// (TanStack Router and its deps) import the bare `react` / `react/jsx-runtime`
// specifiers and, transitively, `use-sync-external-store`. Left alone these pull
// in a second, real React 19 whose elements are frozen and whose hooks have no
// dispatcher under ReactLynx's Preact reconciler. Route them all to
// ReactLynx-backed shims so tests exercise the same runtime as the app.
const reactAliases = [
  {
    find: /^react\/jsx-dev-runtime$/,
    replacement: require.resolve('@lynx-js/react/jsx-dev-runtime'),
  },
  {
    find: /^react\/jsx-runtime$/,
    replacement: require.resolve('@lynx-js/react/jsx-runtime'),
  },
  { find: /^react$/, replacement: fromRoot('./src/shims/react.ts') },
  // @lynx-js/motion's dist ships import attributes Node's ESM loader rejects;
  // marquee animation is host-side, so tests get a no-op stub.
  { find: /^@lynx-js\/motion$/, replacement: fromRoot('./src/shims/lynx-motion.ts') },
  {
    find: /^use-sync-external-store\/shim\/with-selector(\.js)?$/,
    replacement: fromRoot('./src/shims/use-sync-external-store-with-selector.ts'),
  },
]

export default defineConfig({
  plugins: [
    vitestTestingLibraryPlugin(),
  ],
  resolve: {
    alias: reactAliases,
  },
  test: {
    // Inline the TanStack packages so Vite transforms them and applies the
    // aliases above; externalized deps would resolve `react` via Node.
    server: {
      deps: {
        // - @tanstack/*: apply the react aliases (see above).
        // - @lynx-js/lynx-ui*: ships untransformed .jsx with an @lynx-js/react
        //   peer; inlining routes it through the ReactLynx transform + the
        //   single internal Preact instance instead of a second copy that
        //   corrupts the reconciler.
        inline: [/@tanstack/, /@lynx-js\/lynx-ui/, /@lynx-js\/gesture/],
      },
    },
  },
})
