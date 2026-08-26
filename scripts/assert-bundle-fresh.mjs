/**
 * Guard for the copy-bundle scripts: refuse to ship a stale Lynx bundle.
 *
 * **Why this exists.** `lynx.config.ts` grew an `environments` block for the Web
 * target, and that block *replaces* rspeedy's implicit default environment
 * rather than adding to it. So `rspeedy build` silently stopped writing
 * `dist/main.lynx.bundle` — while `copy-bundle-android.mjs` /
 * `copy-bundle-ios.mjs` kept copying whatever file happened to be left in
 * `dist/` (in practice a 6.5 MB `rspeedy dev` bundle from the day before).
 * Every gate stayed green: the build succeeded, types checked, tests passed —
 * they just had nothing to do with the artifact going into the APK.
 *
 * An `existsSync` check cannot catch that, because the file does exist. Only its
 * age gives it away, so that is what we assert: the bundle must be newer than
 * every source file that feeds it.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

/** Inputs whose change should invalidate the bundle. Kept deliberately small. */
const SOURCE_DIR = resolve(repoRoot, 'src')
const SOURCE_FILES = ['lynx.config.ts', 'package.json'].map((f) => resolve(repoRoot, f))

/** Newest mtime under `dir`, or 0 when it does not exist. */
function newestMtime(dir) {
  if (!existsSync(dir)) return 0
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const mtime = entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs
    if (mtime > newest) newest = mtime
  }
  return newest
}

/**
 * Exit non-zero (with an actionable message) unless `bundlePath` exists and is
 * newer than every source input. `label` prefixes the log lines, matching the
 * calling script's existing output style.
 */
export function assertBundleFresh(bundlePath, label) {
  if (!existsSync(bundlePath)) {
    console.error(
      `[${label}] Missing ${bundlePath}\n` +
        `Run \`pnpm run build\` first so the Lynx bundle exists.`,
    )
    process.exit(1)
  }

  const bundleMtime = statSync(bundlePath).mtimeMs
  const sourceMtime = Math.max(
    newestMtime(SOURCE_DIR),
    ...SOURCE_FILES.filter(existsSync).map((f) => statSync(f).mtimeMs),
  )

  if (bundleMtime < sourceMtime) {
    const staleBy = ((sourceMtime - bundleMtime) / 1000).toFixed(0)
    console.error(
      `[${label}] REFUSING TO COPY A STALE BUNDLE\n` +
        `  ${bundlePath}\n` +
        `  is ${staleBy}s older than the newest source file.\n\n` +
        `Run \`pnpm run build\` and check that its output actually lists\n` +
        `\`dist/main.lynx.bundle\` under "File (lynx)". If it only lists the web\n` +
        `bundle, the lynx environment is missing from \`environments\` in\n` +
        `lynx.config.ts — see docs/archive/2026-08-14-audit-fix-plan.md (P0-0).`,
    )
    process.exit(1)
  }
}
