// Compat shims must load before anything imports the router.
import './shims/router-env.js'

import '@lynx-js/preact-devtools'
import '@lynx-js/react/debug'
import './e2e-bridge.js'
import { root } from '@lynx-js/react'

import { App } from './App.js'
import { useAuthStore } from './features/auth/store/index.js'
import { initClientLogger } from './core/logging/client-logger.js'
import { initBackController } from './core/navigation/back-controller.js'
// Static, NOT `await import()`: dynamic imports compile to lazy bundles that are
// separate files under `dist/lazy-bundle/`, and only `main.lynx.bundle` ships in
// the app's assets — so on a device the lazy fetch fails with
// `cannot read property 'getNativeLynx' of undefined` and, because these two
// awaits sit in the startup chain, it took `auth.hydrate()`/`auth.checkAuth()`
// down with it (auth status stuck at `unknown` forever).
import { readDefaultPlayMode } from './features/settings/data/settings-prefs.js'
import { usePlayerStore, restorePlaybackState } from './features/player/store/index.js'
import { navigateAutoEnterLyricsIfNeeded } from './features/player/data/auto-enter-lyrics.js'
import { syncFloatingLyricOverlay } from './features/settings/domain/floating-lyric-overlay.js'
import { applySavedLanguage } from './i18n/index.js'
import { applyHostDeployMode } from './core/config/app-config.js'
import { initSafeArea } from './native/safe-area.js'
import { initSystemAppearance } from './native/system-appearance.js'
import { installNotificationNavigateListener, navigateFromNotificationIfNeeded } from './native/notification-navigate.js'
import { applySavedFontScale } from './shared/theme/font-scale-model.js'
import { applySavedMaterial } from './shared/theme/material-model.js'
import { applySavedTheme } from './shared/theme/theme-model.js'
import { applyActiveThemePack, setActiveThemePack } from './shared/theme/theme-pack-model.js'
import { router } from './router.js'

// Start client logging before the first render so startup/render issues are
// captured (Lynx port of Flutter's `FileLogger.init` in `main.dart`). Module
// imports are hoisted above, so this is as early as the app's own code gets.
initClientLogger()

// Before the first render, not in the async block below: the back key boots
// going straight to "exit the app", and `initBackController` is what tells it
// otherwise. A page can be on screen (and its overlays openable) well before
// an awaited startup step finishes.
initBackController(router)

// Listen for notification-tap navigation events from the native host so a tap
// on the media notification while the app is in the background navigates to
// /player. Cold-start is handled separately after auth resolves.
installNotificationNavigateListener()

// Before the first render too: the standalone web host tags the deploy mode in
// `lynx.__globalProps`, which may land after `app-config` evaluates — before
// this runs, the login page would hide the API-address field and default to
// the static server's own origin, where no backend lives.
applyHostDeployMode()

root.render(<App />)

// Re-run the route guards whenever auth status changes (TanStack Router has no
// GoRouter-style `refreshListenable`; `invalidate()` re-evaluates `beforeLoad`).
// The active theme pack rides the same transitions: it is per-server state, so
// a fresh login refetches it and a logout drops back to the Muse baseline —
// otherwise the login screen would keep wearing the logged-out account's pack.
useAuthStore.subscribe((state, prev) => {
  if (state.status === prev.status) return
  void router.invalidate()
  if (state.status === 'authenticated') {
    void applyActiveThemePack()
  } else if (state.status === 'unauthenticated') {
    setActiveThemePack(null)
  }
})

// One-time startup: apply the persisted UI language + theme, hydrate persisted
// server URL / insecure-TLS into config, then probe stored tokens to resolve
// `unknown` → authenticated/unauthenticated.
//
// The whole chain sits in a try/catch whose fallback re-runs `checkAuth`:
// the root view now holds the splash screen while the status is `unknown`
// (see RootRouteView), so a thrown error anywhere above would otherwise leave
// the app on the splash forever. `checkAuth` maps its own failures to
// `unauthenticated`, so the fallback always resolves auth one way or the
// other — the `.catch` setState is belt-and-braces against that changing.
void (async () => {
  try {
    // Before language/theme: both resolve `'system'` through the host appearance,
    // and this installs the listener that keeps them following it. (The first
    // render above already reads `lynx.__globalProps` lazily, so the launch frame
    // is painted in the right theme without waiting for this.)
    initSystemAppearance()
    // Same shape and the same launch-frame reasoning: `ThemeProvider` already read
    // `lynx.__globalProps` lazily for the first frame, so this only installs the
    // listener that keeps the `--safe-*` tokens following rotation.
    initSafeArea()
    await applySavedLanguage()
    await applySavedTheme()
    await applySavedMaterial()
    await applySavedFontScale()
    const savedMode = await readDefaultPlayMode()
    usePlayerStore.getState().setPlayMode(savedMode)
    await restorePlaybackState()
    // Restores the overlay the user left switched on. Deliberately grant-checking
    // only (never `requestPermission`): that opens a system screen, and one that
    // answers only once the app is foregrounded again — at this point in the
    // startup chain that would both hijack the launch and stall everything below.
    // Off the chain (`void`) for the same reason nothing below it may wait on an
    // overlay: auth must resolve even if the host's lyric module misbehaves.
    void syncFloatingLyricOverlay().catch(() => {})
    const auth = useAuthStore.getState()
    await auth.hydrate()
    await auth.checkAuth()
    // Only once auth resolved: the pack lives behind the API's auth, and a
    // tokenless GET would 401 (the Flutter provider guards the same way).
    if (useAuthStore.getState().status === 'authenticated') {
      await applyActiveThemePack()
      // Cold start from notification tap: the host wrote navigateToPlayer into
      // globalProps, so navigate now that auth has resolved and the player store
      // has a restored queue.
      navigateFromNotificationIfNeeded()
      // "打开后自动进入歌词" (Issue #7): navigate to the player once a song has
      // been restored, mirroring Flutter's `_scheduleAutoEnterLyrics`. Lands on
      // lyrics via FullPlayerPage's existing auto-swipe. A duplicate navigate to
      // /player (notification tap already did) is a harmless no-op.
      void navigateAutoEnterLyricsIfNeeded().catch(() => {})
    }
  } catch {
    await useAuthStore
      .getState()
      .checkAuth()
      .catch(() => {
        useAuthStore.setState({ status: 'unauthenticated', isLoading: false })
      })
  }
})()

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}
