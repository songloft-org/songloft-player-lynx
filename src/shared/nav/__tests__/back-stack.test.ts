import { beforeEach, describe, expect, test, vi } from 'vitest'

import {
  clearBackHandlersForTests,
  dispatchBack,
  getBackStackDepth,
  pushBackHandler,
  subscribeBackStack,
} from '../back-stack.js'

beforeEach(() => {
  clearBackHandlersForTests()
})

describe('dispatch order', () => {
  /**
   * The whole reason this is a stack: the layer the user opened *last* is the one
   * back should close. Every overlay in the app is `z-index: 100`, so there is
   * nothing else to sort by.
   */
  test('the most recently registered handler wins', () => {
    const calls: string[] = []
    pushBackHandler(() => { calls.push('first'); return true })
    pushBackHandler(() => { calls.push('second'); return true })

    expect(dispatchBack()).toBe(true)
    expect(calls).toEqual(['second'])
  })

  test('a handler that declines passes the press down', () => {
    const calls: string[] = []
    pushBackHandler(() => { calls.push('page'); return true })
    pushBackHandler(() => { calls.push('overlay'); return false })

    expect(dispatchBack()).toBe(true)
    expect(calls).toEqual(['overlay', 'page'])
  })

  test('an empty stack reports the press unhandled, so the route layer gets it', () => {
    expect(dispatchBack()).toBe(false)
  })

  test('everything declining reports unhandled', () => {
    pushBackHandler(() => false)
    pushBackHandler(() => false)
    expect(dispatchBack()).toBe(false)
  })
})

describe('unregistering', () => {
  test('an unregistered handler stops being offered presses', () => {
    const handler = vi.fn(() => true)
    const remove = pushBackHandler(handler)
    remove()

    expect(dispatchBack()).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  /** React can run a cleanup after `clearBackHandlersForTests`, or twice on unmount. */
  test('unregistering twice is harmless', () => {
    const remove = pushBackHandler(() => true)
    remove()
    expect(() => remove()).not.toThrow()
    expect(getBackStackDepth()).toBe(0)
  })

  test('removal takes the right entry out of the middle', () => {
    const calls: string[] = []
    pushBackHandler(() => { calls.push('bottom'); return true })
    const removeMiddle = pushBackHandler(() => { calls.push('middle'); return false })
    pushBackHandler(() => { calls.push('top'); return false })
    removeMiddle()

    dispatchBack()
    expect(calls).toEqual(['top', 'bottom'])
  })
})

describe('mutating the stack during a dispatch', () => {
  /**
   * The normal case, not an edge case: consuming a press closes an overlay, which
   * unmounts it, which unregisters its handler — all before `dispatchBack` returns.
   */
  test('a handler may unregister itself while running', () => {
    let remove = (): void => {}
    remove = pushBackHandler(() => { remove(); return true })

    expect(dispatchBack()).toBe(true)
    expect(getBackStackDepth()).toBe(0)
  })

  /**
   * Closing a layer can tear down layers beneath it (a context menu closing its own
   * sub-confirmation). Those must not still be called from this dispatch's snapshot —
   * their UI is already gone, so consuming the press there would swallow it.
   */
  test('a handler removed by an earlier handler is not called', () => {
    const lower = vi.fn(() => true)
    const removeLower = pushBackHandler(lower)
    pushBackHandler(() => { removeLower(); return false })

    expect(dispatchBack()).toBe(false)
    expect(lower).not.toHaveBeenCalled()
  })

  test('a throwing handler passes the press down instead of eating it', () => {
    const lower = vi.fn(() => true)
    pushBackHandler(lower)
    pushBackHandler(() => { throw new Error('boom') })

    expect(dispatchBack()).toBe(true)
    expect(lower).toHaveBeenCalled()
  })
})

describe('depth subscription', () => {
  /**
   * The host has to know *before* the next press whether JS will handle it, so the
   * back controller re-mirrors its flag whenever the depth changes.
   */
  test('registering and unregistering both notify', () => {
    const listener = vi.fn()
    subscribeBackStack(listener)

    const remove = pushBackHandler(() => true)
    expect(listener).toHaveBeenCalledTimes(1)
    remove()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  test('a no-op unregister does not notify', () => {
    const remove = pushBackHandler(() => true)
    remove()
    const listener = vi.fn()
    subscribeBackStack(listener)
    remove()
    expect(listener).not.toHaveBeenCalled()
  })

  test('unsubscribing stops the notifications', () => {
    const listener = vi.fn()
    subscribeBackStack(listener)()
    pushBackHandler(() => true)
    expect(listener).not.toHaveBeenCalled()
  })

  test('depth tracks registrations', () => {
    expect(getBackStackDepth()).toBe(0)
    const a = pushBackHandler(() => true)
    pushBackHandler(() => true)
    expect(getBackStackDepth()).toBe(2)
    a()
    expect(getBackStackDepth()).toBe(1)
  })
})
