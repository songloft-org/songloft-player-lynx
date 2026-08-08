// Compat shims must load before anything imports the router.
import './shims/router-env.js'

import '@lynx-js/preact-devtools'
import '@lynx-js/react/debug'
import { root } from '@lynx-js/react'

import { App } from './App.js'
import { useAuthStore } from './features/auth/store/index.js'
import { router } from './router.js'

root.render(<App />)

// Re-run the route guards whenever auth status changes (TanStack Router has no
// GoRouter-style `refreshListenable`; `invalidate()` re-evaluates `beforeLoad`).
useAuthStore.subscribe((state, prev) => {
  if (state.status !== prev.status) void router.invalidate()
})

// One-time startup: hydrate persisted server URL / insecure-TLS into config,
// then probe stored tokens to resolve `unknown` → authenticated/unauthenticated.
void (async () => {
  const auth = useAuthStore.getState()
  await auth.hydrate()
  await auth.checkAuth()
})()

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}
