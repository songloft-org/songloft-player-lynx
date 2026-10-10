/**
 * Settings sub-page identity and the one table mapping each sub-page to its route.
 *
 * Pure, framework-free — no Lynx runtime, no stores, no I/O — so the pane's
 * navigation rules are unit-testable without rendering the master–detail page.
 *
 * Why this file exists rather than living in `SettingsPage.tsx`: the pane needs to
 * know *parent–child* relationships between sub-pages (a third-level page's back
 * returns to its second-level parent, and the parent's row in the master list stays
 * lit while a child shows). That information already exists — in
 * `shared/nav/route-back.ts`, for routes — and `AGENTS.md` §3.4 forbids a second
 * copy of it. So the only thing declared here is **which route each sub-page is**;
 * the parent relation is derived from the route table. See {@link parentSubPage}.
 */
import { explicitParentOf } from '../../../shared/nav/route-back.js'

/**
 * Sub-page identifiers for the right pane in the dual-column settings layout.
 * Each value corresponds to a navigation target that would normally route away.
 *
 * There is deliberately no "nothing selected" member: an empty right pane is
 * dead space on a wide screen, so the pane always shows a page and defaults to
 * the first row of the list ({@link DEFAULT_SUB_PAGE}).
 */
export type SettingsSubPage =
  | 'appearance'
  | 'theme-catalog'
  | 'playback'
  | 'library'
  | 'duplicates'
  | 'plugins'
  | 'registry'
  | 'github-discovery'
  | 'cache'
  | 'cache-tasks'
  | 'servers'
  | 'server-form'
  | 'proxy'
  | 'data'
  | 'diagnostics'
  | 'about'
  | 'licenses'

/** Sub-page shown in the right pane before the user picks one. */
export const DEFAULT_SUB_PAGE: SettingsSubPage = 'appearance'

/**
 * The route each sub-page *is*, when it is reached as a route rather than shown in
 * the pane. Single source for two things: the fallback `navigate({ to })` target in
 * single-column mode, and (via {@link parentSubPage}) the pane's parent relation.
 *
 * A total `Record`, not a `Partial`: adding a member to {@link SettingsSubPage}
 * without an entry here is a compile error rather than a sub-page that silently
 * stops navigating on a narrow screen.
 *
 * `server-form` is the one entry that stands for two routes — the add form
 * (`/settings/servers/add`) and the edit form (`/settings/servers/edit/$id`) are the
 * same component, distinguished by whether a profile id was passed. The add path is
 * registered because it is the concrete one; both routes declare the same parent in
 * `route-back.ts` (the second via a prefix rule), so the derived parent is the same
 * either way.
 */
export const SUB_PAGE_ROUTES: Record<SettingsSubPage, string> = {
  appearance: '/settings/appearance',
  'theme-catalog': '/settings/theme-catalog',
  playback: '/settings/playback',
  library: '/settings/library',
  duplicates: '/settings/duplicates',
  plugins: '/settings/plugins',
  registry: '/settings/plugins/registry',
  'github-discovery': '/settings/plugins/registry/github',
  cache: '/settings/cache',
  'cache-tasks': '/settings/cache-tasks',
  servers: '/settings/servers',
  'server-form': '/settings/servers/add',
  proxy: '/settings/proxy',
  data: '/settings/data',
  diagnostics: '/settings/diagnostics',
  about: '/settings/about',
  licenses: '/settings/licenses',
}

/** Reverse of {@link SUB_PAGE_ROUTES}, built once. */
const SUB_PAGE_BY_ROUTE: Record<string, SettingsSubPage> = Object.fromEntries(
  (Object.entries(SUB_PAGE_ROUTES) as Array<[SettingsSubPage, string]>)
    .map(([page, route]) => [route, page]),
)

/**
 * The sub-page a third-level pane page returns to, or `undefined` for a
 * second-level page (one reached straight from the settings master list).
 *
 * Derived, not declared: `page → route → route-back's parent → page`. A
 * second-level page has no explicit parent in that table — its back target is the
 * `/settings/` catch-all — so the lookup misses and the answer is `undefined`,
 * which callers read as "there is no page above this one, fall back to
 * {@link DEFAULT_SUB_PAGE}".
 */
export function parentSubPage(page: SettingsSubPage): SettingsSubPage | undefined {
  const parentRoute = explicitParentOf(SUB_PAGE_ROUTES[page])
  return parentRoute ? SUB_PAGE_BY_ROUTE[parentRoute] : undefined
}
