import '@testing-library/jest-dom'
import { expect, test, vi } from 'vitest'
import { render, getQueriesForElement, fireEvent, act } from '@lynx-js/react/testing-library'

const { hydrate, back } = vi.hoisted(() => ({ hydrate: vi.fn(), back: vi.fn() }))
vi.mock('react-i18next', async () => (await import('../../../__tests__/_render-mocks.js')).mockReactI18next())
vi.mock('../../../native/platform-capabilities.js', () => ({ getPlatformCapabilities: () => ({ equalizer: false }) }))
vi.mock('../../../core/navigation/route-back-action.js', () => ({ performRouteBack: back }))
vi.mock('../store/eq-store.js', () => ({
  useEqStore: Object.assign((selector: (state: object) => unknown) => selector({ enabled: false, bands: [], activePreset: 'flat' }), {
    getState: () => ({ hydrate }),
  }),
}))
const { EqualizerPage } = await import('../pages/EqualizerPage.js')

test('opening unsupported EQ explains the limitation, sends no hydration commands, and allows back', async () => {
  render(<EqualizerPage />)
  const q = getQueriesForElement(elementTree.root!)
  expect(q.getByText('Equalizer is unavailable on this platform.')).toBeDefined()
  expect(q.queryByTestId('eq-preset-flat')).toBeNull()
  expect(hydrate).not.toHaveBeenCalled()
  await act(async () => { fireEvent.tap(q.getByTestId('eq-back')!); await Promise.resolve() })
  expect(back).toHaveBeenCalledOnce()
})
