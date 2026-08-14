import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

/**
 * Per-endpoint stubs so a test can make `/upgrade/progress` fail while
 * `/upgrade/check` still answers.
 */
const checkResponse = {
  has_update: false,
  current_version: '2.1.0',
  latest_version: '2.1.0',
}
let progressGet: () => Promise<{ data: Record<string, unknown> }>

const get = vi.fn(async (url: string) => {
  if (url.endsWith('/upgrade/progress')) return progressGet()
  return { data: { ...checkResponse } }
})

vi.mock('../api/index.js', () => ({
  getSettingsApi: () => ({ client: { get, post: vi.fn(async () => ({ data: {} })) } }),
}))

const { UpgradePage } = await import('../pages/UpgradePage.js')

afterEach(() => {
  vi.clearAllMocks()
  checkResponse.has_update = false
  vi.useRealTimers()
})

test('shows up-to-date when no update available', async () => {
  render(<UpgradePage />)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10))
  })
  const { queryByText } = getQueriesForElement(elementTree.root!)

  expect(queryByText('Backend Update')).toBeInTheDocument()
  expect(queryByText('Up to date')).toBeInTheDocument()
  expect(queryByText('2.1.0')).toBeInTheDocument()
})

/**
 * `replacing`/`restarting` means the server being polled is going away, so
 * progress requests are *expected* to fail for a while — but a backend that
 * never comes back used to leave this page polling forever, raising an unhandled
 * rejection every 2s while the UI sat on the last percentage with no conclusion.
 * Tolerate a restart-sized outage, then stop with an actionable message.
 */
test('a progress endpoint that never recovers eventually gives up', async () => {
  checkResponse.has_update = true
  progressGet = () => Promise.reject(new Error('ECONNREFUSED'))

  // Fake timers must be installed BEFORE the polling setInterval is created,
  // otherwise advanceTimersByTime cannot reach it.
  vi.useFakeTimers()
  render(<UpgradePage />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10)
  })

  const { queryByText, queryByTestId } = getQueriesForElement(elementTree.root!)
  // Start the upgrade so the polling effect mounts.
  await act(async () => {
    fireEvent.tap(queryByTestId('upgrade-start')!)
  })

  // 14 failed ticks: still trying, no verdict yet.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(14 * 2000)
  })
  expect(queryByText(/Lost contact with the server/)).not.toBeInTheDocument()

  // The 15th failure crosses the threshold.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
  expect(queryByText(/Lost contact with the server/)).toBeInTheDocument()

  // Polling really stopped — no further requests after giving up.
  const callsAtGiveUp = get.mock.calls.length
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10 * 2000)
  })
  expect(get.mock.calls.length).toBe(callsAtGiveUp)
})

test('a transient progress failure does not abort the upgrade', async () => {
  checkResponse.has_update = true
  let calls = 0
  progressGet = () => {
    calls += 1
    // Fail twice (a restart), then report completion.
    if (calls <= 2) return Promise.reject(new Error('ECONNREFUSED'))
    return Promise.resolve({ data: { status: 'completed', progress: 100 } })
  }

  vi.useFakeTimers()
  render(<UpgradePage />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10)
  })
  const { queryByText, queryByTestId } = getQueriesForElement(elementTree.root!)
  await act(async () => {
    fireEvent.tap(queryByTestId('upgrade-start')!)
  })

  await act(async () => {
    await vi.advanceTimersByTimeAsync(3 * 2000)
  })

  expect(queryByText('Update complete')).toBeInTheDocument()
  expect(queryByText(/Lost contact with the server/)).not.toBeInTheDocument()
})
