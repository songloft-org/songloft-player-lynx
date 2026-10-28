import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

const mocks = vi.hoisted(() => ({
  create: vi.fn(async () => 'sl_pat_secret'), revoke: vi.fn(async () => {}), copy: vi.fn(async (_text: string) => {}),
  invalidate: vi.fn(), onInput: undefined as undefined | ((value: string) => void),
}))
vi.mock('react-i18next', async () => (await import('../../../__tests__/_render-mocks.js')).mockReactI18next())
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@lynx-js/lynx-ui-dialog', async () => ({
  ...(await import('../../../__tests__/_render-mocks.js')).mockLynxUiDialog(),
  DialogRoot: ({ show, children }: { show: boolean; children: import('@lynx-js/react').ReactNode }) => show ? <view>{children}</view> : null,
}))
vi.mock('@lynx-js/lynx-ui-input', () => ({ Input: (props: { id?: string; value?: string; onInput?: (value: string) => void }) => {
  if (props.id === 'personal-token-name') mocks.onInput = props.onInput
  return <text data-testid={props.id}>{props.value}</text>
} }))
vi.mock('../../../native/native-platform.js', () => ({ copyToClipboard: mocks.copy }))
vi.mock('../api/personal-token-api.js', () => ({
  personalTokenSession: () => ({ key: ['personal-tokens'], assertCurrent: () => {} }),
  getPersonalTokenApi: () => ({ create: mocks.create, revoke: mocks.revoke }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: () => ({ data: { tokens: [{ id: 'device', name: 'HA', prefix: 'sl_pat_short', createdAt: '2026-10-28T00:00:00Z', lastUsedAt: null, revokedAt: null }], total: 1 } }),
}))

const { PersonalTokensPage } = await import('../pages/PersonalTokensPage.js')
afterEach(() => { vi.clearAllMocks() })
async function page() {
  render(<PersonalTokensPage />)
  await act(async () => { await Promise.resolve() })
  return getQueriesForElement(elementTree.root!)
}

test('generates and copies once, recovers from clipboard failure, then clears the credential', async () => {
  const q = await page()
  await act(async () => { fireEvent.tap(q.getByTestId('personal-token-create')) })
  await act(async () => { mocks.onInput!('HA') })
  await act(async () => { fireEvent.tap(q.getByTestId('personal-token-confirm')) })
  expect(mocks.create).toHaveBeenCalledWith('HA')
  expect(q.getByTestId('personal-token-secret')).toHaveTextContent('sl_pat_secret')
  mocks.copy.mockRejectedValueOnce(new Error('denied'))
  await act(async () => { fireEvent.tap(q.getByTestId('personal-token-copy')) })
  expect(q.getByText('Copy failed. Select and copy the token manually.')).toBeInTheDocument()
  expect(q.getByTestId('personal-token-secret')).toHaveTextContent('sl_pat_secret')
  await act(async () => { fireEvent.tap(q.getByTestId('personal-token-copy-header')) })
  expect(mocks.copy).toHaveBeenLastCalledWith('Authorization: Bearer sl_pat_secret')
  await act(async () => { fireEvent.tap(q.getByTestId('personal-token-copy')) })
  expect(mocks.copy).toHaveBeenLastCalledWith('sl_pat_secret')
  await act(async () => { fireEvent.tap(q.getByTestId('personal-token-confirm')) })
  expect(q.queryByTestId('personal-token-secret')).not.toBeInTheDocument()
  expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['personal-tokens'] })
})

test('revocation requires confirmation and sends only the management ID', async () => {
  const q = await page()
  await act(async () => { fireEvent.tap(q.getByTestId('personal-token-revoke-device')) })
  expect(mocks.revoke).not.toHaveBeenCalled()
  await act(async () => { fireEvent.tap(q.getByTestId('personal-token-confirm')) })
  expect(mocks.revoke).toHaveBeenCalledWith('device')
})

test('duplicate confirms are blocked while generation is pending', async () => {
  let release!: (value: string) => void
  mocks.create.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const q = await page()
  await act(async () => { fireEvent.tap(q.getByTestId('personal-token-create')) })
  await act(async () => { mocks.onInput!('HA') })
  await act(async () => {
    fireEvent.tap(q.getByTestId('personal-token-confirm'))
    fireEvent.tap(q.getByTestId('personal-token-confirm'))
  })
  expect(mocks.create).toHaveBeenCalledTimes(1)
  await act(async () => { release('sl_pat_secret') })
})
