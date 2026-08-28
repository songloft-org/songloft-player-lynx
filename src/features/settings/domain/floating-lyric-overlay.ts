import { type FloatingLyricModule, getFloatingLyricModule } from '../../../native/floating-lyric.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import {
  readFloatingLyricEnabled,
  readFloatingLyricTwoLine,
  writeFloatingLyricEnabled,
} from '../data/settings-prefs.js'

/**
 * The floating-lyrics overlay as a switch with **two** sources of truth: our own
 * pref and the OS grant. Every caller (startup, the settings toggle) has to
 * reconcile both, and getting that wrong is invisible — the native calls resolve
 * successfully whether or not a window appears.
 *
 * Two rules the callers here exist to enforce:
 *
 * 1. **Only a user-initiated enable may call `requestPermission`.** It opens a
 *    system screen, so calling it while merely restoring state (app startup,
 *    opening the lyrics page) throws the user out of the app unprompted — and,
 *    since the grant is answered only when the app comes back, it would also
 *    park the startup chain mid-flight. Those paths use `hasPermission`.
 * 2. **The pref never claims more than the grant allows.** A pref left `true`
 *    behind a missing grant is a switch that reads "on" with no overlay behind
 *    it, and the only way out is an off/on round-trip — exactly the real-device
 *    report this module was written for.
 */

/** Starts the overlay and re-applies the one pref whose native default differs. */
async function showOverlay(m: FloatingLyricModule): Promise<void> {
  await m.show()
  // Native also defaults to two lines, so only the OFF state needs pushing —
  // otherwise a restart would silently bring the second line back for a user
  // who switched it off.
  const twoLine = await readFloatingLyricTwoLine()
  if (!twoLine) await m.setTwoLine(false).catch(() => {})
}

/**
 * Bring the overlay back up when the pref says it was on and the grant is still
 * there. Opens no system screen; when the grant is gone the pref is turned off
 * so the UI stops claiming an overlay nobody can see.
 *
 * Returns the pref value that is actually honoured.
 */
export async function syncFloatingLyricOverlay(): Promise<boolean> {
  if (!getPlatformCapabilities().floatingLyric) return false
  if (!(await readFloatingLyricEnabled())) return false

  const m = getFloatingLyricModule()
  if (!(await m.hasPermission())) {
    await writeFloatingLyricEnabled(false)
    return false
  }
  if (!(await m.isShowing())) await showOverlay(m)
  return true
}

/**
 * User turned the overlay on. Asks for the grant if needed and shows the overlay
 * once it is held — `requestPermission` answers only after the trip to the
 * system screen is over, so this is where the first-ever grant lands.
 *
 * Returns whether the overlay is now on; `false` means the grant was refused and
 * the pref has been put back to off (the caller should un-flip its switch).
 */
export async function enableFloatingLyricOverlay(): Promise<boolean> {
  if (!getPlatformCapabilities().floatingLyric) return false

  const m = getFloatingLyricModule()
  const granted = await m.requestPermission()
  if (!granted) {
    await writeFloatingLyricEnabled(false)
    return false
  }
  await writeFloatingLyricEnabled(true)
  if (!(await m.isShowing())) await showOverlay(m)
  return true
}

/** User turned the overlay off: the pref and the window go together. */
export async function disableFloatingLyricOverlay(): Promise<void> {
  await writeFloatingLyricEnabled(false)
  if (!getPlatformCapabilities().floatingLyric) return
  await getFloatingLyricModule().hide()
}
