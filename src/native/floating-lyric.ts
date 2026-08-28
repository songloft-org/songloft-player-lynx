import { readNativeModules } from './native-modules.js'

export interface FloatingLyricModule {
  /** Is the overlay grant in place? Never opens a system screen. */
  hasPermission(): Promise<boolean>
  /**
   * Ask for the overlay grant. Resolves `true` immediately when it is already
   * held; otherwise the host opens the system screen and this resolves **after
   * the user comes back** with whatever the grant is then. Only call it from a
   * user-initiated enable — see `OverlayPermission.kt`.
   */
  requestPermission(): Promise<boolean>
  show(): Promise<void>
  updateLyric(line: string, nextLine?: string): Promise<void>
  hide(): Promise<void>
  isShowing(): Promise<boolean>
  setFontSize(size: 'small' | 'medium' | 'large'): Promise<void>
  setLocked(locked: boolean): Promise<void>
  setOpacity(opacity: number): Promise<void>
  setTwoLine(twoLine: boolean): Promise<void>
}

/**
 * The native module is callback-based (Lynx convention). Methods take
 * (argsJson: String, callback: Callback). This adapter promisifies them.
 */
interface NativeFloatingLyric {
  hasPermission(args: string, callback: (result: string) => void): void
  requestPermission(args: string, callback: (result: string) => void): void
  show(args: string, callback: (result: string) => void): void
  updateLyric(args: string, callback: (result: string) => void): void
  hide(args: string, callback: (result: string) => void): void
  isShowing(args: string, callback: (result: string) => void): void
  setFontSize(args: string, callback: (result: string) => void): void
  setLocked(args: string, callback: (result: string) => void): void
  setOpacity(args: string, callback: (result: string) => void): void
  setTwoLine(args: string, callback: (result: string) => void): void
}

function createNativeAdapter(native: NativeFloatingLyric): FloatingLyricModule {
  return {
    hasPermission() {
      return new Promise((resolve) => {
        // Hosts that predate this method would leave the promise pending
        // forever, and the caller sits in the startup chain.
        if (typeof native.hasPermission !== 'function') {
          resolve(false)
          return
        }
        native.hasPermission('{}', (result) => { resolve(readBooleanResult(result)) })
      })
    },
    requestPermission() {
      return new Promise((resolve) => {
        native.requestPermission('{}', (result) => { resolve(readBooleanResult(result)) })
      })
    },
    show() {
      return new Promise((resolve) => {
        native.show('{}', () => resolve())
      })
    },
    updateLyric(line: string, nextLine?: string) {
      return new Promise((resolve) => {
        native.updateLyric(JSON.stringify({ line, nextLine: nextLine ?? '' }), () => resolve())
      })
    },
    hide() {
      return new Promise((resolve) => {
        native.hide('{}', () => resolve())
      })
    },
    isShowing() {
      return new Promise((resolve) => {
        native.isShowing('{}', (result) => { resolve(readBooleanResult(result)) })
      })
    },
    setFontSize(size: 'small' | 'medium' | 'large') {
      return new Promise((resolve) => {
        native.setFontSize(JSON.stringify({ size }), () => resolve())
      })
    },
    setLocked(locked: boolean) {
      return new Promise((resolve) => {
        native.setLocked(JSON.stringify({ locked }), () => resolve())
      })
    },
    setOpacity(opacity: number) {
      return new Promise((resolve) => {
        native.setOpacity(JSON.stringify({ opacity }), () => resolve())
      })
    },
    setTwoLine(twoLine: boolean) {
      return new Promise((resolve) => {
        native.setTwoLine(JSON.stringify({ twoLine }), () => resolve())
      })
    },
  }
}

/** `{result: boolean}` → boolean; anything unparseable counts as `false`. */
function readBooleanResult(result: string): boolean {
  try {
    const obj: unknown = JSON.parse(result)
    return !!obj && typeof obj === 'object' && (obj as Record<string, unknown>).result === true
  } catch {
    return false
  }
}

let cached: FloatingLyricModule | null = null

export function getFloatingLyricModule(): FloatingLyricModule {
  if (cached) return cached
  const nm = readNativeModules()
  if (nm?.SongloftFloatingLyric) {
    cached = createNativeAdapter(nm.SongloftFloatingLyric as unknown as NativeFloatingLyric)
    return cached
  }
  cached = {
    hasPermission: async () => false,
    requestPermission: async () => false,
    show: async () => {},
    updateLyric: async () => {},
    hide: async () => {},
    isShowing: async () => false,
    setFontSize: async () => {},
    setLocked: async () => {},
    setOpacity: async () => {},
    setTwoLine: async () => {},
  }
  return cached
}