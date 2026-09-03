import type { MaterialVariant } from './material-model.js'

interface GlassTextureTokens {
  '--glass-fill': string
  '--glass-fill-strong': string
  '--glass-border': string
  '--glass-highlight': string
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
  Record<'light' | 'dark', GlassTextureTokens>
> = {
  'ultra-thin': {
    light: {
      '--glass-fill': lightFill(0.55),
      '--glass-fill-strong': lightFill(0.45),
      '--glass-border': lightBorder(0.55),
      '--glass-highlight': lightHighlight(0.72),
    },
    dark: {
      '--glass-fill': darkFill(0.50),
      '--glass-fill-strong': darkFill(0.40),
      '--glass-border': darkBorder(0.20),
      '--glass-highlight': darkHighlight(0.38),
    },
  },
  thin: {
    light: {
      '--glass-fill': lightFill(0.70),
      '--glass-fill-strong': lightFill(0.58),
      '--glass-border': lightBorder(0.50),
      '--glass-highlight': lightHighlight(0.66),
    },
    dark: {
      '--glass-fill': darkFill(0.65),
      '--glass-fill-strong': darkFill(0.55),
      '--glass-border': darkBorder(0.18),
      '--glass-highlight': darkHighlight(0.34),
    },
  },
  regular: {
    light: {
      '--glass-fill': lightFill(0.85),
      '--glass-fill-strong': lightFill(0.72),
      '--glass-border': lightBorder(0.45),
      '--glass-highlight': lightHighlight(0.6),
    },
    dark: {
      '--glass-fill': darkFill(0.85),
      '--glass-fill-strong': darkFill(0.72),
      '--glass-border': darkBorder(0.16),
      '--glass-highlight': darkHighlight(0.3),
    },
  },
  thick: {
    light: {
      '--glass-fill': lightFill(0.92),
      '--glass-fill-strong': lightFill(0.85),
      '--glass-border': lightBorder(0.40),
      '--glass-highlight': lightHighlight(0.5),
    },
    dark: {
      '--glass-fill': darkFill(0.92),
      '--glass-fill-strong': darkFill(0.82),
      '--glass-border': darkBorder(0.14),
      '--glass-highlight': darkHighlight(0.24),
    },
  },
}
