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

/**
 * Whether the root view should hold the splash screen for this (status ×
 * pathname) pair — i.e. the route the user will actually land on is not yet
 * decided:
 *
 *  - `unknown`: `checkAuth()` has not resolved, so any route rendered now is a
 *    guess. This is the Web-refresh "login page flashes" bug: memory history
 *    boots at `/login` (it cannot read the browser URL) and the route guard
 *    deliberately lets `unknown` through, so the login card painted first and
 *    was swapped for home once auth resolved.
 *  - the guard has *decided* to redirect away from `pathname`: `router
 *    .invalidate()` lands through a promise chain, so a synchronous re-render
 *    between the status flip and the redirect would otherwise paint the
 *    soon-to-be-abandoned route (the login card again) for a frame or two.
 *
 * Everything else is settled and renders normally.
 */
export function isAuthTransitionPending(
  status: AuthStatus,
  pathname: string,
): boolean {
  if (status === 'unknown') return true
  return evaluateAuthGuard(status, pathname) !== null
}
