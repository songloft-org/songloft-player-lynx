import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import type { ReactNode } from '@lynx-js/react'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import { beforeEach, expect, test, vi } from 'vitest'

import { parseJSPlugin } from '../../../models/jsplugin.js'
import { en } from '../../../i18n/resources.js'
import type { GithubPlugin } from '../domain/github-plugin-validation.js'
import { installBackRouter } from '../../../__tests__/_render-mocks.js'

const h = vi.hoisted(() => ({
  plugins: [] as GithubPlugin[], installed: [] as unknown[], host: '2.10.0', install: vi.fn(), openURL: vi.fn(),
  error: null as unknown, pending: false, more: false, fetchMore: vi.fn(), failures: {} as Record<string, number>,
}))
vi.mock('react-i18next', async () => (await import('../../../__tests__/_render-mocks.js')).mockReactI18next())
vi.mock('@lynx-js/lynx-ui-input', () => ({ Input: () => <view /> }))
vi.mock('../../../native/native-platform.js', () => ({ openURL: h.openURL }))
vi.mock('../data/jsplugin-query.js', () => ({
  useGithubProxyQuery: () => ({ data: '', isPending: false }),
  usePluginsQuery: () => ({ data: { plugins: h.installed }, isSuccess: true, refetch: vi.fn() }),
}))
vi.mock('../data/jsplugin-mutations.js', () => ({ useInstallFromRegistryMutation: () => ({ mutate: h.install, isPending: false }) }))
vi.mock('../data/github-discovery-query.js', () => ({
  useDiscoveryHostVersion: () => ({ data: h.host, refetch: vi.fn() }),
  discoveryErrorKey: () => 'githubDiscovery.loadFailed',
  useGithubDiscoveryQuery: () => ({
    data: { pages: [{ plugins: h.plugins, checked: 3, failures: h.failures }] },
    isPending: h.pending, isFetching: h.pending, isFetchingNextPage: false,
    isError: h.error != null, error: h.error, hasNextPage: h.more, fetchNextPage: h.fetchMore,
  }),
}))
vi.mock('@lynx-js/lynx-ui-dialog', () => ({
  DialogRoot: ({ children, show }: { children: ReactNode; show: boolean }) => <view data-dialoghidden={show ? 'false' : 'true'}>{children}</view>,
  DialogView: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogBackdrop: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogContent: ({ children }: { children: ReactNode }) => <view>{children}</view>,
}))
const { GithubDiscoveryPage } = await import('../pages/GithubDiscoveryPage.js')
const plugin: GithubPlugin = {
  repository: { id: 1, fullName: 'alice/music', defaultBranch: 'main', stars: 12, updatedAt: '' },
  manifest: { name: '音乐插件', description: '听音乐', version: '1.0.0', author: 'Alice', homepage: '', minHostVersion: '2.9.5',
    entryPath: 'music', main: 'main.js', renderEngine: 'lynx', permissions: ['songs.read'], updateUrl: '', download_url: '', entryHash: 'a'.repeat(64), zipHash: 'b'.repeat(64) },
  downloadUrl: 'https://github.com/alice/music/releases/download/v1.0.0/music.jsplugin.zip',
  releaseUrl: 'https://github.com/alice/music/releases/tag/v1.0.0', publishedAt: '2026-10-08T00:00:00Z',
}
beforeEach(() => {
  vi.clearAllMocks()
  h.plugins = [plugin]; h.installed = []; h.host = '2.10.0'; h.error = null; h.pending = false; h.more = false; h.failures = {}
})
async function page(props: { onBack?: () => void } = {}) {
  render(<GithubDiscoveryPage {...props} />)
  await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve() })
  return getQueriesForElement(elementTree.root!)
}
async function tap(id: string) {
  await act(async () => { fireEvent.tap(getQueriesForElement(elementTree.root!).getByTestId(id)) })
}

test('opens details and requires explicit unreviewed/permissions confirmation before installation', async () => {
  await page()
  await tap('github-plugin-1')
  const queries = getQueriesForElement(elementTree.root!)
  expect(queries.getByTestId('github-plugin-detail').textContent).toContain('songs.read')
  await tap('github-plugin-install')
  expect(h.install).not.toHaveBeenCalled()
  expect(queries.getByTestId('github-install-dialog').textContent).toContain('alice/music')
  await tap('github-install-confirm')
  expect(h.install).toHaveBeenCalledWith({ downloadUrl: plugin.downloadUrl, githubProxy: undefined, overwrite: false }, expect.anything())
})

test('an occupied entryPath explicitly warns and only overwrites after confirmation', async () => {
  h.installed = [parseJSPlugin({ id: 3, name: 'Existing music', entry_path: 'music', author: 'Alice', version: '0.9.0' })]
  await page()
  await tap('github-plugin-1')
  expect(getQueriesForElement(elementTree.root!).getByTestId('github-plugin-detail').textContent).toContain('Existing music')
  await tap('github-plugin-install')
  expect(h.install).not.toHaveBeenCalled()
  await tap('github-install-confirm')
  expect(h.install).toHaveBeenCalledWith(expect.objectContaining({ overwrite: true }), expect.anything())
})

test('an already-installed matching repository/version is shown as installed', async () => {
  h.installed = [parseJSPlugin({ id: 3, name: plugin.manifest.name, entry_path: 'music', version: '1.0.0', update_url: 'https://raw.githubusercontent.com/alice/music/main/plugin.json' })]
  await page()
  await tap('github-plugin-1')
  expect(getQueriesForElement(elementTree.root!).getByTestId('github-plugin-install').textContent).toBe(en.githubDiscovery.installed)
  await tap('github-plugin-install')
  expect(h.install).not.toHaveBeenCalled()
})

test.each(['2.9.4', 'dev'])('blocks installing when host compatibility is insufficient or unknown (%s)', async version => {
  h.host = version
  await page()
  await tap('github-plugin-1')
  await tap('github-plugin-install')
  expect(h.install).not.toHaveBeenCalled()
  const dialog = getQueriesForElement(elementTree.root!).getByTestId('github-install-dialog')
  expect(dialog.closest('[data-dialoghidden]')?.getAttribute('data-dialoghidden')).toBe('true')
})

test('detail return preserves the original list instead of navigating away', async () => {
  const onBack = vi.fn()
  await page({ onBack })
  await tap('github-plugin-1')
  await tap('github-discovery-back')
  expect(onBack).not.toHaveBeenCalled()
  expect(getQueriesForElement(elementTree.root!).queryByTestId('github-plugin-detail')).toBeNull()
  await tap('github-discovery-back')
  expect(onBack).toHaveBeenCalledOnce()
})

test('standalone back returns to the store', async () => {
  const navigate = installBackRouter('/settings/plugins/registry/github')
  await page()
  await tap('github-discovery-back')
  expect(navigate).toHaveBeenCalledWith({ to: '/settings/plugins/registry' })
})

test('source and release links use the host URL bridge', async () => {
  await page()
  await tap('github-plugin-1')
  await tap('github-plugin-source')
  await tap('github-plugin-release')
  expect(h.openURL.mock.calls).toEqual([['https://github.com/alice/music'], [plugin.releaseUrl]])
})

test('an append failure keeps validated plugins and offers retry', async () => {
  h.error = new Error('offline')
  await page()
  expect(getQueriesForElement(elementTree.root!).getByTestId('github-plugin-1')).toBeInTheDocument()
  expect(getQueriesForElement(elementTree.root!).getByTestId('github-discovery-retry')).toBeInTheDocument()
})

test('network failures are shown as pending verification rather than an empty catalog', async () => {
  h.plugins = []; h.failures = { unavailable: 3 }
  await page()
  expect(elementTree.root!.textContent).toContain(en.githubDiscovery.pending)
  expect(elementTree.root!.textContent).not.toContain(en.githubDiscovery.empty)
})
