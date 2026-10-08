import type { MaterialVariant } from './material-model.js'

interface MaterialTextureTokens {
  '--material-fill': string
  '--material-fill-elevated': string
  '--material-border': string
  '--material-highlight': string
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

const W = { r: 255, g: 255, b: 255 }
const D = { r: 23, g: 23, b: 27 }

function lightFill(a: number): string { return rgba(W.r, W.g, W.b, a) }
function darkFill(a: number): string { return rgba(D.r, D.g, D.b, a) }
function lightBorder(a: number): string { return rgba(W.r, W.g, W.b, a) }
function darkBorder(a: number): string { return rgba(W.r, W.g, W.b, a) }
function lightHighlight(a: number): string { return rgba(W.r, W.g, W.b, a) }
function darkHighlight(a: number): string { return rgba(W.r, W.g, W.b, a) }

export const MATERIAL_TOKENS: Record<
  MaterialVariant,
  Record<'light' | 'dark', MaterialTextureTokens>
> = {
  'ultra-thin': {
    light: {
      '--material-fill': lightFill(0.55),
      '--material-fill-elevated': lightFill(0.45),
      '--material-border': lightBorder(0.55),
      '--material-highlight': lightHighlight(0.72),
    },
    dark: {
      '--material-fill': darkFill(0.50),
      '--material-fill-elevated': darkFill(0.40),
      '--material-border': darkBorder(0.20),
      '--material-highlight': darkHighlight(0.38),
    },
  },
  thin: {
    light: {
      '--material-fill': lightFill(0.70),
      '--material-fill-elevated': lightFill(0.58),
      '--material-border': lightBorder(0.50),
      '--material-highlight': lightHighlight(0.66),
    },
    dark: {
      '--material-fill': darkFill(0.65),
      '--material-fill-elevated': darkFill(0.55),
      '--material-border': darkBorder(0.18),
      '--material-highlight': darkHighlight(0.34),
    },
  },
  regular: {
    light: {
      '--material-fill': lightFill(0.85),
      '--material-fill-elevated': lightFill(0.72),
      '--material-border': lightBorder(0.45),
      '--material-highlight': lightHighlight(0.65),
    },
    dark: {
      '--material-fill': darkFill(0.85),
      '--material-fill-elevated': darkFill(0.72),
      '--material-border': darkBorder(0.16),
      '--material-highlight': darkHighlight(0.33),
    },
  },
  thick: {
    light: {
      '--material-fill': lightFill(0.92),
      '--material-fill-elevated': lightFill(0.85),
      '--material-border': lightBorder(0.40),
      '--material-highlight': lightHighlight(0.5),
    },
    dark: {
      '--material-fill': darkFill(0.92),
      '--material-fill-elevated': darkFill(0.82),
      '--material-border': darkBorder(0.14),
      '--material-highlight': darkHighlight(0.24),
    },
  },
}

/** Final texture written inline by ThemeProvider, after theme-pack mapping.
 * Native regular glass uses the existing ultra-thin tint as its reference.
 * Other thicknesses scale that tint relative to regular, preserving the user's
 * ordering. These are app tint values, not UIKit material/vibrancy guarantees.
 */
export function resolveMaterialTokens({
  variant,
  theme,
  nativeGlass,
  increaseContrast,
  opaque = false,
}: {
  variant: MaterialVariant
  theme: 'light' | 'dark'
  nativeGlass: boolean
  increaseContrast: boolean
  opaque?: boolean
}): MaterialTextureTokens {
  if (opaque) {
    return {
      '--material-fill': theme === 'light' ? 'rgba(255, 255, 255, 1)' : 'rgba(28, 28, 30, 1)',
      '--material-fill-elevated': theme === 'light' ? 'rgba(255, 255, 255, 1)' : 'rgba(44, 44, 46, 1)',
      '--material-border': theme === 'light' ? 'rgba(209, 209, 214, 1)' : 'rgba(72, 72, 74, 1)',
      '--material-highlight': theme === 'light' ? 'rgba(255, 255, 255, 1)' : 'rgba(72, 72, 74, 1)',
    }
  }
  if (increaseContrast) return MATERIAL_TOKENS.thick[theme]
  if (!nativeGlass) return MATERIAL_TOKENS[variant][theme]
  const reference = MATERIAL_TOKENS['ultra-thin'][theme]
  if (variant === 'regular') return reference

  const baseline = MATERIAL_TOKENS.regular[theme]
  const selected = MATERIAL_TOKENS[variant][theme]
  const result = { ...reference }
  for (const key of Object.keys(reference) as (keyof MaterialTextureTokens)[]) {
    const alpha = (value: string) => Number(value.slice(value.lastIndexOf(',') + 1, -1))
    const scaled = Math.min(1, alpha(reference[key]) * alpha(selected[key]) / alpha(baseline[key]))
    result[key] = reference[key].replace(/[^,]+\)$/, ` ${Number(scaled.toFixed(3))})`)
  }
  return result
}

/** Text-heavy, undimmed menus use a protected tint and rim-only decoration. */
export function resolveMenuMaterialFill(options: Parameters<typeof resolveMaterialTokens>[0]): string {
  const fill = resolveMaterialTokens(options)['--material-fill-elevated']
  const currentAlpha = Number(fill.slice(fill.lastIndexOf(',') + 1, -1))
  const floor = options.theme === 'light' ? 0.99 : 0.92
  return fill.replace(/[^,]+\)$/, ` ${Math.max(currentAlpha, floor)})`)
}
