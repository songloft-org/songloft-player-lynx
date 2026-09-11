import { useState } from '@lynx-js/react'
import { act, fireEvent, render } from '@lynx-js/react/testing-library'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { setSystemAppearanceForTests } from '../../../native/system-appearance.js'
import { usePresence } from '../usePresence.js'

/**
 * `usePresence` keeps a subtree mounted through its leave animation and then
 * unmounts it. The state machine it guards is the whole point — a sheet that
 * tears down on `show` going false has nothing to play a leave on — so the gate
 * walks the transitions and the timeout teardown, including the re-open-mid-leave
 * path that cancels the pending teardown.
 *
 * `transitionend`/`animationend` are deliberately NOT relied on (see the hook's
 * header), so no DOM event is synthesised here: the timeout is the contract.
 */
const LEAVE_MS = 280

function Presence({ show }: { show: boolean }) {
  const { mounted, leaving } = usePresence(show)
  if (!mounted) return null
  return <view data-testid='subject' data-leaving={leaving ? '1' : '0'} />
}

/** Drives `show` from outside via tap targets named `open` and `close`. */
function Harness({ initial = true }: { initial?: boolean }) {
  const [show, setShow] = useState(initial)
  return (
    <>
      <view bindtap={() => setShow(true)} data-testid='open' />
      <view bindtap={() => setShow(false)} data-testid='close' />
      <Presence show={show} />
    </>
  )
}

/** Read the subject's `leaving` flag, or `null` when it has unmounted. Accepts
 *  the broad union `queryByTestId` returns in the ReactLynx test host. */
function leavingOf(el: unknown): string | null {
  if (!el || typeof el !== 'object') return null
  const node = el as { getAttribute?: (a: string) => string | null }
  return node.getAttribute?.('data-leaving') ?? null
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); setSystemAppearanceForTests(null) })

test('mounts when shown', () => {
  const q = render(<Presence show={true} />)
  expect(q.queryByTestId('subject')).not.toBeNull()
  expect(leavingOf(q.queryByTestId("subject"))).toBe('0')
})

test('starts unmounted when show is false on first render', () => {
  // The sheet that mounts with show=false must render nothing — same as the
  // `if (!show) return null` it replaces. Otherwise a closed sheet would paint.
  const q = render(<Presence show={false} />)
  expect(q.queryByTestId('subject')).toBeNull()
})

test('enters the leave phase on close, then unmounts after the timeout', () => {
  const q = render(<Harness />)
  expect(leavingOf(q.queryByTestId('subject'))).toBe('0') // shown, not leaving

  act(() => { fireEvent.tap(q.getByTestId('close') as unknown as HTMLElement, {}) })
  // Still mounted, now leaving — the leave CSS has something to play on.
  expect(q.queryByTestId('subject')).not.toBeNull()
  expect(leavingOf(q.queryByTestId('subject'))).toBe('1')

  act(() => { vi.advanceTimersByTime(LEAVE_MS) })
  expect(q.queryByTestId('subject')).toBeNull() // torn down
})

test('re-opening mid-leave cancels the teardown and re-mounts fresh', () => {
  const q = render(<Harness />)
  act(() => { fireEvent.tap(q.getByTestId('close') as unknown as HTMLElement, {}) })
  expect(leavingOf(q.queryByTestId('subject'))).toBe('1')

  // Re-open before the teardown fires.
  act(() => { fireEvent.tap(q.getByTestId('open') as unknown as HTMLElement, {}) })
  expect(q.queryByTestId('subject')).not.toBeNull()
  expect(leavingOf(q.queryByTestId('subject'))).toBe('0')

  // The old teardown must have been cancelled — advancing past the leave window
  // does NOT unmount the re-opened sheet.
  act(() => { vi.advanceTimersByTime(LEAVE_MS + 50) })
  expect(q.queryByTestId('subject')).not.toBeNull()
  expect(leavingOf(q.queryByTestId('subject'))).toBe('0')
})

test('reduce-motion tears down synchronously, with no leaving phase or timeout', () => {
  setSystemAppearanceForTests({ theme: null, locale: null, reduceMotion: true })
  const q = render(<Harness />)
  expect(q.queryByTestId('subject')).not.toBeNull()

  act(() => { fireEvent.tap(q.getByTestId('close') as unknown as HTMLElement, {}) })
  // Unmounted immediately — no leaving phase, no 280ms wait.
  expect(q.queryByTestId('subject')).toBeNull()
  act(() => { vi.advanceTimersByTime(LEAVE_MS + 50) })
  expect(q.queryByTestId('subject')).toBeNull()
})
