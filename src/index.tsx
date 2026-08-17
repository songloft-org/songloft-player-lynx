// Compat shims must load before anything imports the router.
import './shims/router-env.js'

import '@lynx-js/preact-devtools'
import '@lynx-js/react/debug'
import './e2e-bridge.js'
import { root } from '@lynx-js/react'

import { App } from './App.js'
import { useAuthStore } from './features/auth/store/index.js'
import { initClientLogger } from './core/logging/client-logger.js'
// Static, NOT `await import()`: dynamic imports compile to lazy bundles that are
// separate files under `dist/lazy-bundle/`, and only `main.lynx.bundle` ships in
// the app's assets — so on a device the lazy fetch fails with
// `cannot read property 'getNativeLynx' of undefined` and, because these two
// awaits sit in the startup chain, it took `auth.hydrate()`/`auth.checkAuth()`
// down with it (auth status stuck at `unknown` forever).
import { readDefaultPlayMode } from './features/settings/data/settings-prefs.js'
import { usePlayerStore, restorePlaybackState } from './features/player/store/index.js'
import { applySavedLanguage } from './i18n/index.js'
import { initSystemAppearance } from './native/system-appearance.js'
import { applySavedTheme } from './shared/theme/theme-model.js'
import { router } from './router.js'

// Start client logging before the first render so startup/render issues are
// captured (Lynx port of Flutter's `FileLogger.init` in `main.dart`). Module
// imports are hoisted above, so this is as early as the app's own code gets.
initClientLogger()

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
  const savedMode = await readDefaultPlayMode()
  usePlayerStore.getState().setPlayMode(savedMode)
  await restorePlaybackState()
  const auth = useAuthStore.getState()
  await auth.hydrate()
  await auth.checkAuth()
})()

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}
