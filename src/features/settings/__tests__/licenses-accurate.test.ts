import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * The Licenses screen is user-facing attribution, and nothing used to check it
 * against reality. Two classes of rot had already set in:
 *
 *  1. Three entries pointed at `github.com/nicklhw/nicklhw-…` repositories
 *     unrelated to the packages they credited (`@lynx-js/react`,
 *     `@lynx-js/lynx-ui`, `url-search-params-polyfill`) — apparently a
 *     find-replace accident, so users were sent to the wrong project.
 *  2. It credited `@lynx-js/lynx-ui`, which stopped being a dependency when the
 *     barrel entry point was replaced by per-component packages.
 *
 * So this asserts each entry against the installed package's own manifest. The
 * list is parsed out of the source rather than imported: importing the page
 * would drag in CSS, i18n and the render environment for what is really a data
 * check.
 */

const ROOT = path.resolve(__dirname, '../../../..')
const PAGE = path.join(ROOT, 'src/features/settings/pages/LicensesPage.tsx')

interface Entry { name: string, license: string, url: string }

function entries(): Entry[] {
  const src = readFileSync(PAGE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const found = [...src.matchAll(
    /\{\s*name:\s*'([^']+)',\s*license:\s*'([^']+)',\s*url:\s*'([^']+)'\s*\}/g,
  )].map(([, name, license, url]) => ({ name, license, url }))
  // Guard the parser itself: a silently-empty match set would pass every
  // assertion below without checking anything.
  expect(found.length).toBeGreaterThanOrEqual(8)
  return found
}

/** `@lynx-js/lynx-ui-*` credits the whole component family in one row. */
function resolveName(name: string): string | undefined {
  if (!name.endsWith('*')) return name
  const [scope] = name.split('/')
  const prefix = name.slice(scope.length + 1, -1)
  const dir = path.join(ROOT, 'node_modules', scope)
  if (!existsSync(dir)) return undefined
  const match = readdirSync(dir).find((d) => d.startsWith(prefix))
  return match ? `${scope}/${match}` : undefined
}

function manifest(pkg: string): { license?: string, repository?: unknown } | undefined {
  const file = path.join(ROOT, 'node_modules', pkg, 'package.json')
  return existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8')) as { license?: string, repository?: unknown }
    : undefined
}

/** `git+https://github.com/o/r.git` / `git://…` → `https://github.com/o/r` */
function normalizeRepo(repository: unknown): string | undefined {
  const raw = typeof repository === 'string'
    ? repository
    : (repository as { url?: string } | undefined)?.url
  if (!raw) return undefined
  return raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '')
}

test('every credited package is still a dependency', () => {
  const missing = entries()
    .map((e) => ({ e, pkg: resolveName(e.name) }))
    .filter(({ pkg }) => pkg === undefined || manifest(pkg) === undefined)
    .map(({ e }) => e.name)
  expect(missing).toEqual([])
})

test('every credited URL is the package\'s real upstream repository', () => {
  const wrong = entries().flatMap((e) => {
    const pkg = resolveName(e.name)
    const repo = pkg ? normalizeRepo(manifest(pkg)?.repository) : undefined
    // No `repository` field to compare against — not evidence of a wrong URL.
    if (!repo) return []
    return repo === e.url ? [] : [`${e.name}: listed ${e.url}, upstream ${repo}`]
  })
  expect(wrong).toEqual([])
})

test('every credited license matches the package manifest', () => {
  const wrong = entries().flatMap((e) => {
    const pkg = resolveName(e.name)
    const declared = pkg ? manifest(pkg)?.license : undefined
    // `@lynx-js/react` ships no `license` field; its source headers say
    // Apache-2.0, which is what the page claims. Nothing to compare here.
    if (!declared) return []
    return declared === e.license ? [] : [`${e.name}: listed ${e.license}, manifest ${declared}`]
  })
  expect(wrong).toEqual([])
})
