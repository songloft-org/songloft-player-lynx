/**
 * Active theme-pack model — the "which pack is the whole UI wearing" state.
 *
 * Mirrors `theme-model.ts`'s shape on purpose: module-scoped current value +
 * plain listener `Set`, consumed via `useState`/`useEffect` in `ThemeProvider`.
 * No `useSyncExternalStore` — documented (`theme-model.ts` header,
 * `docs/project/progress.md`) to crash ReactLynx's Vitest render tree with
 * `isListHolder`, and this module feeds the tree root exactly like that one.
 *
 * The activation lives **on the server** (`PUT /theme-packs/active`) — that is
 * the whole feature: a pack activated from the Flutter client shows up here on
 * next fetch, and vice versa. There is no local persistence to keep in sync;
 * `applyActiveThemePack()` (wired in `index.tsx` after auth resolves) is the
 * only startup read.
 *
 * HTTP goes through the shared client directly (same direction as
 * `theme-model.ts` importing `core/storage`): the endpoints are tiny, and a
 * dedicated Api class would just re-wrap three calls. Tests inject a fake via
 * the default parameter, the `readSavedTheme(storage = …)` pattern.
 */
import { apiPrefix } from '../../core/config/app-config.js'
import { getSharedApiBundle } from '../../core/network/api-client.js'
import type { HttpClient } from '../../core/network/http-client.js'
import type { ThemePackData } from './theme-pack-mapping.js'

/** The pack the server reports as active; `null` = Muse baseline. */
export interface ActiveThemePack {
  themeId: string
  data: ThemePackData
}

/** Only the verbs this module uses — keeps test fakes one-liner small. */
export interface ThemePackClient {
  get: HttpClient['get']
  put: HttpClient['put']
  delete: HttpClient['delete']
}

let current: ActiveThemePack | null = null
const listeners = new Set<() => void>()

/** The live active pack (`null` until fetched / after clearing). */
export function getActiveThemePack(): ActiveThemePack | null {
  return current
}

/** Subscribe to active-pack changes; returns an unsubscribe function. */
export function subscribeActiveThemePack(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setLive(pack: ActiveThemePack | null): void {
  // Same identity AND same data reference → nothing changed. A fresh GET
  // always produces a new `data` object, so reinstalls of the active pack
  // still notify (the colors may genuinely differ).
  if (current?.themeId === pack?.themeId && current?.data === pack?.data) return
  current = pack
  listeners.forEach((listener) => listener())
}

/**
 * Live setter for non-fetch paths: auth dropping to `unauthenticated` must not
 * keep painting a logged-out server's pack on the login screen.
 */
export function setActiveThemePack(pack: ActiveThemePack | null): void {
  setLive(pack)
}

function defaultClient(): ThemePackClient {
  return getSharedApiBundle().client
}

/** Parse a `GET /theme-packs/active` body. No `theme_id` → no active pack. */
function parseActive(raw: Record<string, unknown> | null | undefined): ActiveThemePack | null {
  if (!raw || !raw.theme_id) return null
  return {
    themeId: String(raw.theme_id),
    data: (raw.data ?? {}) as ThemePackData,
  }
}

/**
 * Fetch the server's active pack and apply it live. Best-effort: a failure
 * falls back to no pack (Muse baseline) — startup must never wedge on this.
 */
export async function applyActiveThemePack(
  client: ThemePackClient = defaultClient(),
): Promise<void> {
  try {
    const res = await client.get<Record<string, unknown>>(`${apiPrefix}/theme-packs/active`)
    setLive(parseActive(res.data))
  } catch {
    setLive(null)
  }
}

/**
 * Activate a pack on the server, then re-apply it live. The PUT answers with a
 * bare success object, so the full `data` comes from a follow-up GET. Errors
 * propagate — the settings page is the caller and owes the user the failure.
 */
export async function activateThemePack(
  themeId: string,
  client: ThemePackClient = defaultClient(),
): Promise<void> {
  await client.put(`${apiPrefix}/theme-packs/active`, { theme_id: themeId })
  await applyActiveThemePack(client)
}

/** Reset to the Muse baseline server-side and live. Errors propagate. */
export async function clearActiveThemePack(
  client: ThemePackClient = defaultClient(),
): Promise<void> {
  await client.delete(`${apiPrefix}/theme-packs/active`)
  setLive(null)
}
