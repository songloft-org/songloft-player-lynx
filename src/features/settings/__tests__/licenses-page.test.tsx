import '../../../shims/router-env.js'

import { expect, test, vi } from 'vitest'
import { render } from '@lynx-js/react/testing-library'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('../../../shared/ui/Icon.js', () => ({
  Icon: () => null,
  ICON_COLORS: { content: '#fff', contentMuted: '#aaa' },
}))

test('LicensesPage renders dependency list', async () => {
  const { LicensesPage } = await import('../pages/LicensesPage.js')
  const { container } = render(<LicensesPage />)
  const text = (container as unknown as { textContent: string }).textContent ?? ''
  expect(text).toContain('zustand')
  expect(text).toContain('MIT')
  expect(text).toContain('i18next')
  expect(text).toContain('Apache-2.0')
})
