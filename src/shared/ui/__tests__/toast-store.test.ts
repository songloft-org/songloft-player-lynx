import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// The toast store depends only on zustand; these tests exercise the vanilla
// store API (`getState` / `showToast` / timers) with no React rendering, so the
// ReactLynx Vitest snapshot env is never touched (a rendered `useToastStore`
// subscription is exercised separately by the page tests / on-device).
import { toast, useToastStore } from '../toast-store.js'

const SUCCESS_MS = 2500
const ERROR_MS = 4000

beforeEach(() => {
  vi.useFakeTimers()
  useToastStore.setState({ toast: null })
})

afterEach(() => {
  toast.clear()
  vi.useRealTimers()
})

describe('showToast', () => {
  test('a success toast is stored with the success tone', () => {
    toast.success('Saved')
    const t = useToastStore.getState().toast
    expect(t).not.toBeNull()
    expect(t?.text).toBe('Saved')
    expect(t?.tone).toBe('success')
  })

  test('an error toast is stored with the error tone', () => {
    toast.error('Something failed')
    const t = useToastStore.getState().toast
    expect(t?.text).toBe('Something failed')
    expect(t?.tone).toBe('error')
  })

  test('show() defaults to the success tone and honours an explicit tone', () => {
    toast.show('Plain')
    expect(useToastStore.getState().toast?.tone).toBe('success')
    toast.show('Bad', { tone: 'error' })
    expect(useToastStore.getState().toast?.tone).toBe('error')
  })
})

describe('auto-dismiss', () => {
  test('a success toast clears after 2.5s', () => {
    toast.success('Done')
    expect(useToastStore.getState().toast).not.toBeNull()

    vi.advanceTimersByTime(SUCCESS_MS - 1)
    expect(useToastStore.getState().toast).not.toBeNull()

    vi.advanceTimersByTime(1)
    expect(useToastStore.getState().toast).toBeNull()
  })

  test('an error toast clears after 4s', () => {
    toast.error('Oops')
    expect(useToastStore.getState().toast).not.toBeNull()

    vi.advanceTimersByTime(ERROR_MS - 1)
    expect(useToastStore.getState().toast).not.toBeNull()

    vi.advanceTimersByTime(1)
    expect(useToastStore.getState().toast).toBeNull()
  })
})

describe('replacement', () => {
  test('a new toast supersedes the current one with a fresh id', () => {
    toast.success('First')
    const first = useToastStore.getState().toast
    toast.error('Second')
    const second = useToastStore.getState().toast

    expect(second?.text).toBe('Second')
    expect(second?.tone).toBe('error')
    expect(second?.id).not.toBe(first?.id)
  })

  test('the superseded toast’s timer does not clear its replacement early', () => {
    toast.success('First')
    // Replace just before the success timer would fire.
    vi.advanceTimersByTime(SUCCESS_MS - 10)
    toast.error('Second')

    // Well past the first toast's original deadline, the replacement must still
    // be up; only its own (error) duration clears it.
    vi.advanceTimersByTime(SUCCESS_MS)
    expect(useToastStore.getState().toast?.text).toBe('Second')

    vi.advanceTimersByTime(ERROR_MS - SUCCESS_MS)
    expect(useToastStore.getState().toast).toBeNull()
  })
})

describe('clear', () => {
  test('clear() removes the toast and cancels the pending dismissal', () => {
    toast.success('Gone soon')
    toast.clear()
    expect(useToastStore.getState().toast).toBeNull()

    // Nothing should reappear when the (now-cancelled) timer would have fired.
    vi.advanceTimersByTime(SUCCESS_MS * 2)
    expect(useToastStore.getState().toast).toBeNull()
  })
})
