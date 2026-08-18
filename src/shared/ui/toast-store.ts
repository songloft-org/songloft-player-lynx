import { create } from 'zustand'

/**
 * Global toast — the single ephemeral-notice primitive for the whole app.
 *
 * Before this existed every page hand-rolled its own inline banner or result
 * text (seven copies, three different shapes). All of them now funnel through
 * `toast.success(...)` / `toast.error(...)`, rendered once by `<ToastHost/>`
 * (mounted in the root route).
 *
 * Store conventions (see `src/store/app-session.ts`): one `create<T>()` per
 * slice, actions co-located, components read via a selector, and the returned
 * hook exposes the vanilla `getState`/`setState` API for non-React callers and
 * tests — which is exactly what the imperative `toast` object below uses.
 */

export type ToastTone = 'success' | 'error'

export interface ToastItem {
  /** Monotonic id; used as the React `key` so a replacement toast remounts and
   * replays its entrance animation, and as the stale-timer guard below. */
  id: number
  text: string
  tone: ToastTone
}

export interface ToastState {
  toast: ToastItem | null
  showToast: (text: string, opts?: { tone?: ToastTone }) => void
  clearToast: () => void
}

const SUCCESS_DURATION_MS = 2500
const ERROR_DURATION_MS = 4000

let nextId = 0
// Module-level timer handle (not store state — it is not renderable). Same
// pattern as ProxySettingsPage's auto-dismiss notices and player-store's retry
// timer; `setTimeout` is safe in the Lynx background realm.
let dismissTimer: ReturnType<typeof setTimeout> | null = null

export const useToastStore = create<ToastState>((set) => ({
  toast: null,

  showToast: (text, opts) => {
    // A new toast owns the slot: cancel any pending dismissal of the previous
    // one before replacing it.
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer)
      dismissTimer = null
    }
    const id = ++nextId
    const tone = opts?.tone ?? 'success'
    set({ toast: { id, text, tone } })
    dismissTimer = setTimeout(() => {
      dismissTimer = null
      // Guard: only clear if this toast is still the active one. A superseding
      // toast has already cleared this timer, but the id check makes the
      // race impossible to get wrong regardless.
      if (useToastStore.getState().toast?.id === id) {
        set({ toast: null })
      }
    }, tone === 'error' ? ERROR_DURATION_MS : SUCCESS_DURATION_MS)
  },

  clearToast: () => {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer)
      dismissTimer = null
    }
    set({ toast: null })
  },
}))

/**
 * Imperative shortcuts — concise at call sites and usable outside React
 * (mutation callbacks, promise handlers, non-component modules).
 */
export const toast = {
  success: (text: string) =>
    useToastStore.getState().showToast(text, { tone: 'success' }),
  error: (text: string) =>
    useToastStore.getState().showToast(text, { tone: 'error' }),
  show: (text: string, opts?: { tone?: ToastTone }) =>
    useToastStore.getState().showToast(text, opts),
  clear: () => useToastStore.getState().clearToast(),
}
