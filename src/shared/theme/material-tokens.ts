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
      '--material-highlight': lightHighlight(0.6),
    },
    dark: {
      '--material-fill': darkFill(0.85),
      '--material-fill-elevated': darkFill(0.72),
      '--material-border': darkBorder(0.16),
      '--material-highlight': darkHighlight(0.3),
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
