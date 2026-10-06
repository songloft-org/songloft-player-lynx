import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { afterEach, expect, test, vi } from 'vitest'

interface Host { configure(state: Record<string, unknown>): void; destroy(): void }
interface Dom { window: Window & typeof globalThis }
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string) => Dom
}
const windows: Dom[] = []
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); vi.restoreAllMocks() })
const source = readFileSync(resolve(__dirname, '../../web/playback-keyboard-host.js'), 'utf8')

function setup() {
  const dom = new JSDOM('<body><lynx-view id="app" tabindex="0"></lynx-view><input id="outside"></body>')
  windows.push(dom)
  const { window } = dom
  const document = window.document
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  const app = document.getElementById('app')!
  const shadow = app.attachShadow({ mode: 'open' })
  shadow.innerHTML = '<div id="surface" tabindex="0"></div><input id="input"><textarea></textarea><select></select><div contenteditable="true"></div><button>Button</button><iframe></iframe>'
  const send = vi.fn()
  ;(app as unknown as { sendGlobalEvent: typeof send }).sendGlobalEvent = send
  const context = vm.createContext({ window, document })
  const load = () => vm.runInContext(source, context)
  load()
  const host = () => (window as unknown as { __SONGLOFT_KEYBOARD__: Host }).__SONGLOFT_KEYBOARD__
  host().configure({ enabled: true, blocked: false, canPlay: true, canNext: true, canPrev: true, volume: 50 })
  const surface = shadow.getElementById('surface')!
  const focus = () => {
    surface.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, composed: true }))
    ;(surface as HTMLElement).focus()
  }
  focus()
  const key = (options: KeyboardEventInit, target: Element = surface) => {
    const event = new window.KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, ...options })
    target.dispatchEvent(event)
    return event
  }
  return { window, document, shadow, send, host, load, key, focus }
}

test('fixed mappings send array-wrapped actions and only matched keys are consumed', () => {
  const { key, send } = setup()
  for (const [options, action] of [
    [{ key: ' ', code: 'Space' }, 'toggle'],
    [{ key: 'ArrowLeft', ctrlKey: true }, 'previous'],
    [{ key: 'ArrowRight', metaKey: true }, 'next'],
    [{ key: 'ArrowUp', ctrlKey: true }, 'volumeUp'],
    [{ key: 'ArrowDown', metaKey: true }, 'volumeDown'],
  ] as const) {
    expect(key(options).defaultPrevented).toBe(true)
    expect(send).toHaveBeenLastCalledWith('SongloftKeyboard.action', [{ action }])
  }
  expect(key({ key: 'ArrowUp' }).defaultPrevented).toBe(false)
  expect(key({ key: ' ', ctrlKey: true }).defaultPrevented).toBe(false)
  expect(key({ key: ' ', shiftKey: true }).defaultPrevented).toBe(false)
  expect(send).toHaveBeenCalledTimes(5)
})

test('input, editable, button and iframe paths inside Shadow DOM retain their own keys', () => {
  const { key, shadow, send, focus } = setup()
  for (const selector of ['input', 'textarea', 'select', '[contenteditable]', 'button', 'iframe']) {
    focus()
    const target = shadow.querySelector(selector) as HTMLElement
    target.focus()
    expect(key({ key: ' ', code: 'Space' }, target).defaultPrevented).toBe(false)
  }
  expect(send).not.toHaveBeenCalled()
})

test('IME, pre-consumed keys, repeat transport, disabled/blocked/empty state and volume limits are ignored', () => {
  const { key, host, send, document, window } = setup()
  expect(key({ key: ' ', isComposing: true }).defaultPrevented).toBe(false)
  document.dispatchEvent(new window.Event('compositionstart'))
  expect(key({ key: ' ' }).defaultPrevented).toBe(false)
  document.dispatchEvent(new window.Event('compositionend'))
  expect(key({ key: ' ', repeat: true }).defaultPrevented).toBe(false)
  const before = new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
  before.preventDefault(); document.dispatchEvent(before)
  expect(send).not.toHaveBeenCalled()
  expect(key({ key: 'ArrowUp', ctrlKey: true, repeat: true }).defaultPrevented).toBe(true)
  for (const state of [{ enabled: false }, { enabled: true, blocked: true }, { enabled: true, canPlay: false }]) {
    host().configure(state)
    expect(key({ key: ' ' }).defaultPrevented).toBe(false)
  }
  host().configure({ enabled: true, canPlay: true, canNext: false, volume: 100 })
  expect(key({ key: 'ArrowRight', ctrlKey: true }).defaultPrevented).toBe(false)
  expect(key({ key: 'ArrowUp', ctrlKey: true }).defaultPrevented).toBe(false)
})

test('outside focus, file-transfer modal and window blur do not control playback', () => {
  const { document, window, key, send, focus } = setup()
  document.getElementById('outside')!.focus()
  expect(key({ key: ' ' }).defaultPrevented).toBe(false)
  focus()
  const modal = document.createElement('div'); modal.dataset.songloftTransfer = 'true'; document.body.appendChild(modal)
  expect(key({ key: ' ' }).defaultPrevented).toBe(false)
  modal.remove();window.dispatchEvent(new window.Event('blur'))
  expect(key({ key: ' ' }).defaultPrevented).toBe(false)
  expect(send).not.toHaveBeenCalled()
})

test('loading the script twice keeps configuration but emits one action; destroy removes listeners', () => {
  const { load, focus, key, send, host } = setup()
  load();focus()
  expect(key({ key: ' ' }).defaultPrevented).toBe(true)
  expect(send).toHaveBeenCalledTimes(1)
  host().destroy()
  expect(key({ key: ' ' }).defaultPrevented).toBe(false)
  expect(send).toHaveBeenCalledTimes(1)
})
