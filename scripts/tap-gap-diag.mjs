// One-off diagnostic: which tappable classes declare NO height/min-height,
// and how tall do they likely render? The a11y gate only checks the ones WITH
// an explicit height; this finds the gap (padding-only buttons).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.argv[2] ?? 'src')

function filesOf(dir, ext) {
  return readdirSync(dir).flatMap((e) => {
    if (e === 'node_modules' || e === '__tests__') return []
    const f = path.join(dir, e)
    return statSync(f).isDirectory() ? filesOf(f, ext) : (f.endsWith(ext) ? [f] : [])
  })
}

function openingTags(src) {
  const tags = []
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '<' || !/[a-zA-Z]/.test(src[i + 1] ?? '')) continue
    let depth = 0, quote = null, j = i + 1
    for (; j < src.length; j++) {
      const c = src[j]
      if (quote !== null) { if (c === quote && src[j - 1] !== '\\') quote = null }
      else if (c === '"' || c === "'" || c === '`') quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    tags.push(src.slice(i, j + 1)); i = j
  }
  return tags
}
function classTokens(tag) {
  const out = []
  for (const m of tag.matchAll(/\w*lassName\s*=/g)) {
    let k = m.index + m[0].length
    while (k < tag.length && /\s/.test(tag[k])) k++
    const open = tag[k]
    if (open === "'" || open === '"') {
      const end = tag.indexOf(open, k + 1); if (end > 0) out.push(...tag.slice(k + 1, end).split(/\s+/))
    } else if (open === '{') {
      let depth = 0, e = k
      for (; e < tag.length; e++) { if (tag[e] === '{') depth++; else if (tag[e] === '}' && --depth === 0) break }
      const expr = tag.slice(k, e + 1)
      for (const s of expr.matchAll(/`([^`]*)`/g)) out.push(...(s[1] ?? '').replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ' ').split(/\s+/))
      for (const s of expr.matchAll(/'([^']*)'|"([^"]*)"/g)) out.push(...(s[1] ?? s[2] ?? '').split(/\s+/))
    }
  }
  return out.filter((t) => /^[a-z][\w-]*$/.test(t))
}

const tappable = new Set()
for (const file of filesOf(SRC, '.tsx')) {
  for (const tag of openingTags(readFileSync(file, 'utf8'))) {
    if (!/\b(bindtap|catchtap)\s*=/.test(tag)) continue
    for (const c of classTokens(tag)) tappable.add(c)
  }
}

// Parse CSS rules per class.
const cssByClass = new Map() // class -> [{file, body}]
for (const file of filesOf(SRC, '.css')) {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const sel of rule[1].split(',')) {
      const s = sel.trim()
      for (const cls of [...s.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m => m[1])) {
        const own = cls // last-class decides; keep all for completeness
        if (!cssByClass.has(own)) cssByClass.set(own, [])
        cssByClass.get(own).push({ file: path.relative(SRC, file), body: rule[2] })
      }
    }
  }
}

const SPACE = { 'space-half':2, 'space-1':4, 'space-2':8, 'space-3':12, 'space-4':16, 'space-5':24, 'space-6':32, 'space-7':20, 'space-8':28, 'space-9':40, 'space-10':48 }
function lenPx(v) {
  v = v.trim()
  const m = v.match(/^(\d+)px$/); if (m) return +m[1]
  for (const [t, px] of Object.entries(SPACE)) if (v.includes(`var(--${t})`)) return px
  if (v.includes('var(--tap-target)') || v.includes('var(--control-height)')) return 44
  if (v.includes('var(--control-height-sm)')) return 36
  return null
}
const FONT = { 'font-2xs':10,'font-caption2':11,'font-caption1':12,'font-footnote':13,'font-subhead':15,'font-callout':16,'font-body':17,'font-headline':17,'font-title3':20,'font-title2':22,'font-title1':28,'font-largeTitle':34 }

const gaps = []
for (const cls of [...tappable].sort()) {
  const rules = cssByClass.get(cls) ?? []
  // base rule = the one whose selector is exactly .cls (no modifier, no descendant)
  const base = rules.filter(r => new RegExp(`^\\.${cls}\\s*\\{`).test('') || true) // keep all, filter below
  // find rules whose selector's LAST class is `cls` (own rule) and not a modifier
  // We didn't keep selector; approximate by scanning bodies for height.
  const hasHeight = rules.some(r => /(^|[\s;])(height|min-height)\s*:/.test(r.body))
  if (hasHeight) continue
  // estimate: take the rule with padding
  const padRule = rules.find(r => /padding\s*:/.test(r.body))
  let est = null, detail = ''
  if (padRule) {
    const pm = padRule.body.match(/padding\s*:\s*([^;]+)/)
    const parts = pm[1].trim().split(/\s+/)
    let top = null
    if (parts.length === 1) top = lenPx(parts[0])
    else if (parts.length === 2) top = lenPx(parts[0])
    else if (parts.length >= 3) top = lenPx(parts[0])
    // font-size in any rule
    let fs = 17
    for (const r of rules) { const fm = r.body.match(/font-size\s*:\s*var\(--(font-[\w-]+)\)/); if (fm) fs = FONT[fm[1]] ?? 17 }
    if (top != null) { est = top * 2 + fs * 1.2; detail = `pad-top=${top} fs=${fs}` }
    else detail = `pad-unparsable(${pm[1].trim()})`
  } else {
    detail = 'no padding rule'
  }
  gaps.push({ cls, est, detail, file: padRule?.file ?? rules[0]?.file ?? '?' })
}

gaps.sort((a, b) => (a.est ?? 999) - (b.est ?? 999))
console.log(`tappable classes with NO height/min-height: ${gaps.length}`)
for (const g of gaps) {
  const flag = (g.est != null && g.est < 44) ? '  ⚠ UNDER-44' : ''
  console.log(`  ${g.cls.padEnd(34)} est≈${g.est ?? '?'}px  ${g.detail}${flag}  [${g.file}]`)
}
