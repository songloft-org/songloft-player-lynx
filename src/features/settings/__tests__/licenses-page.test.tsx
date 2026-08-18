import '../../../shims/router-env.js'
import '@testing-library/jest-dom'

import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateSpy,
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

const { LicensesPage } = await import('../pages/LicensesPage.js')

afterEach(() => vi.clearAllMocks())

test('LicensesPage renders dependency list', () => {
  const { container } = render(<LicensesPage />)
  const text = (container as unknown as { textContent: string }).textContent ?? ''
  expect(text).toContain('zustand')
  expect(text).toContain('MIT')
  expect(text).toContain('i18next')
  expect(text).toContain('Apache-2.0')
})

test('back routes to the About page, the only way in', async () => {
  // Not `/settings`: the licenses row lives on About now, so returning to the
  // settings root would skip a level on the way back out.
  render(<LicensesPage />)
  const { getByTestId } = getQueriesForElement(elementTree.root!)

  await act(async () => { fireEvent.tap(getByTestId('licenses-back')) })

  expect(navigateSpy).toHaveBeenCalledWith({ to: '/settings/about' })
})

test('back defers to onBack inside the settings pane', async () => {
  const onBack = vi.fn()
  render(<LicensesPage onBack={onBack} />)
  const { getByTestId } = getQueriesForElement(elementTree.root!)

  await act(async () => { fireEvent.tap(getByTestId('licenses-back')) })

  expect(onBack).toHaveBeenCalledTimes(1)
  expect(navigateSpy).not.toHaveBeenCalled()
})
