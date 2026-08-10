/**
 * arb → i18next converter (batch 9 deliverable).
 *
 * Reads the Flutter reference localisation files (`lib/l10n/app_en.arb`,
 * `app_zh.arb`) and emits i18next-shaped JSON. Two transforms:
 *
 *  1. **Drop `@`-prefixed metadata keys.** In arb, `@myKey` holds
 *     `{ description, placeholders }` metadata for the sibling `myKey` message —
 *     it is not a translatable string, so it must not appear in the output.
 *  2. **Rewrite placeholders `{name}` → `{{name}}`.** arb uses ICU single-brace
 *     placeholders; i18next uses double braces. ICU `plural`/`select` blocks
 *     (`{count, plural, ...}`) are left intact and flagged — i18next expresses
 *     those with plural-suffix keys, which is a manual follow-up.
 *
 * The pure functions are unit-tested (`scripts/__tests__/arb-to-i18next.test.ts`).
 * The CLI entry writes the full converted maps to `src/i18n/generated/{en,zh}.json`.
 *
 * IMPORTANT (bundle size): the generated files are the FULL arb (thousands of
 * keys) and are **not imported by the app** — the app inlines only the curated
 * subset in `src/i18n/resources.ts`. Full runtime import is deferred; wiring the
 * generated files in would bloat the Lynx bundle, so it is a conscious later
 * step. See PROGRESS.
 */

/** An arb file is a flat map of message keys → string, plus `@meta` objects. */
export type ArbFile = Record<string, unknown>

/** True for an arb metadata key (`@foo`) or the reserved `@@locale` header. */
export function isArbMetaKey(key: string): boolean {
  return key.startsWith('@')
}

/** True if a value still contains an ICU plural/select block (manual follow-up). */
export function hasIcuComplexPlaceholder(value: string): boolean {
  // e.g. `{count, plural, =0{...} other{...}}` or `{sel, select, ...}`.
  return /\{\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/.test(value)
}

/**
 * Rewrite arb single-brace placeholders `{name}` → i18next `{{name}}`.
 * Only simple identifier placeholders are rewritten; ICU plural/select blocks
 * (which contain a comma after the identifier) are left untouched.
 */
export function convertPlaceholders(value: string): string {
  return value.replace(/\{(\w+)\}/g, '{{$1}}')
}

/**
 * Convert a parsed arb object into an i18next message map: drop `@meta` keys,
 * keep string messages, rewrite their placeholders. Non-string values (should
 * not occur in a well-formed arb outside `@meta`) are skipped.
 */
export function arbToI18next(arb: ArbFile): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(arb)) {
    if (isArbMetaKey(key)) continue
    if (typeof value !== 'string') continue
    out[key] = convertPlaceholders(value)
  }
  return out
}

/** Keys whose value still holds an ICU plural/select block after conversion. */
export function complexKeys(arb: ArbFile): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(arb)) {
    if (isArbMetaKey(key)) continue
    if (typeof value === 'string' && hasIcuComplexPlaceholder(value)) {
      keys.push(key)
    }
  }
  return keys
}

// ── CLI (Node, run with a TypeScript-aware Node ≥ 22.6 / 23+) ────────────────
//
// Guarded so importing the pure functions in a unit test does not run I/O.
// `import.meta.url` vs argv[1] is the standard ESM "am I the entry?" check.
async function main(): Promise<void> {
  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const path = await import('node:path')

  const here = path.dirname(fileURLToPath(import.meta.url))
  const l10nDir = path.resolve(here, '../songloft-player/lib/l10n')
  const outDir = path.resolve(here, '../src/i18n/generated')
  mkdirSync(outDir, { recursive: true })

  for (const [lng, file] of [
    ['en', 'app_en.arb'],
    ['zh', 'app_zh.arb'],
  ] as const) {
    const arb = JSON.parse(
      readFileSync(path.join(l10nDir, file), 'utf8'),
    ) as ArbFile
    const converted = arbToI18next(arb)
    const complex = complexKeys(arb)
    writeFileSync(
      path.join(outDir, `${lng}.json`),
      JSON.stringify(converted, null, 2) + '\n',
      'utf8',
    )
    // eslint-disable-next-line no-console
    console.log(
      `[arb-to-i18next] ${lng}: ${Object.keys(converted).length} keys ` +
        `→ ${path.join(outDir, `${lng}.json`)}` +
        (complex.length
          ? ` (⚠ ${complex.length} ICU plural/select keys need manual review)`
          : ''),
    )
  }
}

const isEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  import.meta.url === `file://${process.argv[1]}`

if (isEntry) {
  void main()
}
