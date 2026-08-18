import { useToastStore } from './toast-store.js'
import { Icon, ICON_COLORS } from './Icon.js'
import './ToastHost.css'

/**
 * Global toast renderer. Mount **once** in the root route component (inside
 * `ThemeProvider`, after `<Outlet/>`) so it covers every route — shelled pages
 * and chrome-less ones (`/player`, `/login`, lyrics edit/calibrate, dlna) alike.
 *
 * Driven by `useToastStore`; call sites never render a toast themselves, they
 * just call `toast.success(...)` / `toast.error(...)` (see `toast-store.ts`).
 *
 * `key={toast.id}` forces a remount whenever a new toast replaces the current
 * one, which restarts the entrance `@keyframes` and makes the swap read as a
 * fresh notification rather than an in-place text change. Dismissal is a plain
 * unmount when the store timer clears the toast — no exit animation (the
 * codebase has no custom leave-animation precedent and Lynx `animationend` is
 * unreliable; abrupt removal after the fade-in is the established toast feel).
 */
export function ToastHost() {
  const current = useToastStore((s) => s.toast)

  if (!current) return null

  const isError = current.tone === 'error'

  return (
    <view className='toast-wrap' key={current.id}>
      <view
        className={isError ? 'toast toast--error' : 'toast'}
        data-testid='toast'
      >
        <Icon
          name={isError ? 'warning' : 'check-circle'}
          size={18}
          color={isError ? ICON_COLORS.danger : ICON_COLORS.primaryContent}
        />
        <text className='toast__text'>{current.text}</text>
      </view>
    </view>
  )
}
