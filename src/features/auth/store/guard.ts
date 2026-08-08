/**
 * Authentication route-guard decision — a **pure** function so the routing
 * policy is unit-testable in isolation from TanStack Router.
 *
 * Mirrors the Flutter `GoRouter.redirect` in `core/router/app_router.dart`:
 * - `unknown` (auth not yet resolved from storage) → never redirect; the app
 *   waits for `checkAuth()` to decide, so a short-lived pre-login mount is not
 *   wrongly kicked to `/login`.
 * - `unauthenticated` on any non-login route → redirect to `/login`.
 * - `authenticated` while sitting on `/login` → redirect to `/`.
 * - otherwise → stay (`null`).
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated'

export const LOGIN_PATH = '/login'
export const HOME_PATH = '/'

/**
 * @returns the path to redirect to, or `null` to allow the navigation.
 */
export function evaluateAuthGuard(
  status: AuthStatus,
  targetPath: string,
): string | null {
  if (status === 'unknown') return null

  const isLoginRoute = targetPath === LOGIN_PATH

  if (status === 'unauthenticated' && !isLoginRoute) return LOGIN_PATH
  if (status === 'authenticated' && isLoginRoute) return HOME_PATH

  return null
}
