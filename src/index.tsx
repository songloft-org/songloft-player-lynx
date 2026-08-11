// Compat shims must load before anything imports the router.
import './shims/router-env.js'

import '@lynx-js/preact-devtools'
import '@lynx-js/react/debug'
import { root } from '@lynx-js/react'

import { App } from './App.js'
import { useAuthStore } from './features/auth/store/index.js'
import { applySavedLanguage } from './i18n/index.js'
import { initSystemAppearance } from './native/system-appearance.js'
import { applySavedTheme } from './shared/theme/theme-model.js'
import { router } from './router.js'

root.render(<App />)

// Re-run the route guards whenever auth status changes (TanStack Router has no
// GoRouter-style `refreshListenable`; `invalidate()` re-evaluates `beforeLoad`).
useAuthStore.subscribe((state, prev) => {
  if (state.status !== prev.status) void router.invalidate()
})

// One-time startup: apply the persisted UI language + theme, hydrate persisted
// server URL / insecure-TLS into config, then probe stored tokens to resolve
// `unknown` → authenticated/unauthenticated.
void (async () => {
  // Before language/theme: both resolve `'system'` through the host appearance,
  // and this installs the listener that keeps them following it. (The first
  // render above already reads `lynx.__globalProps` lazily, so the launch frame
  // is painted in the right theme without waiting for this.)
  initSystemAppearance()
  await applySavedLanguage()
  await applySavedTheme()
  const { readDefaultPlayMode } = await import('./features/settings/data/settings-prefs.js')
  const savedMode = await readDefaultPlayMode()
  const { usePlayerStore } = await import('./features/player/store/index.js')
  usePlayerStore.getState().setPlayMode(savedMode)
  const auth = useAuthStore.getState()
  await auth.hydrate()
  await auth.checkAuth()
})()

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}
