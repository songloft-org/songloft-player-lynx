import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import type { CachedEntry } from '../data/indexed-song-cache.js'
import type { OfflineOwner } from '../data/offline-identity.js'
import { cacheIdentity, cacheNamespace, cacheSnapshot } from '../domain/cache-identity.js'
import { parseSong, type Song } from '../../../models/song.js'

const fixture = vi.hoisted(() => ({ owner: null as OfflineOwner | null, entries: [] as CachedEntry[], status: 'unauthenticated',
  supported: true, navigate: vi.fn(), playPlaylist: vi.fn(async (_songs: Song[], _index?: number) => {}), forget: vi.fn(async () => {}), remove: vi.fn(async () => {}),
  clear: vi.fn(async () => {}), legacy: vi.fn(async () => {}), cancel: vi.fn(), input: (_value: string) => {},
  list: vi.fn(), player: { currentSong: undefined, isPlaying: false } }))
vi.mock('react-i18next', async () => (await import('../../../__tests__/_render-mocks.js')).mockReactI18next())
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => fixture.navigate }))
vi.mock('@lynx-js/lynx-ui-input', () => ({ Input: ({ onInput }: { onInput: (value: string) => void }) => {
  fixture.input = onInput; return <view data-testid='device-cache-search' />
} }))
vi.mock('../../library/widgets/VirtualList.js', async () => (await import('../../../__tests__/_render-mocks.js')).mockVirtualList())
vi.mock('../../../shared/ui/ConfirmDialog.js', () => ({ ConfirmDialog: ({ show, onConfirm }: { show: boolean; onConfirm: () => void }) =>
  show ? <view bindtap={onConfirm} data-testid='device-cache-confirm-delete' /> : null }))
vi.mock('../../auth/store/auth-store.js', () => ({ useAuthStore: (select: (state: { status: string }) => unknown) => select({ status: fixture.status }) }))
vi.mock('../widgets/use-offline-owner.js', () => ({ useOfflineOwner: () => fixture.owner }))
vi.mock('../data/offline-identity.js', () => ({ currentOfflineOwner: () => fixture.owner }))
vi.mock('../store/player-store.js', () => ({ usePlayerStore: Object.assign((select: (state: typeof fixture.player) => unknown) => select(fixture.player),
  { getState: () => ({ ...fixture.player, playPlaylist: fixture.playPlaylist }) }), forgetCachedPlayback: fixture.forget }))
vi.mock('../store/dlna-store.js', () => ({ useDlnaStore: { getState: () => ({ activeDevice: null }) } }))
vi.mock('../data/cache-batch-controller.js', () => ({ cacheBatchController: { getState: () => ({ namespace: fixture.owner?.namespace }), cancelRemaining: fixture.cancel } }))
vi.mock('../data/indexed-song-cache.js', () => ({ indexedSongCacheAvailable: () => fixture.supported,
  listIndexedSongs: (request: unknown) => fixture.list(request), removeIndexedSong: fixture.remove, clearIndexedNamespace: fixture.clear, clearLegacySongs: fixture.legacy }))
const { DeviceCachePage } = await import('../pages/DeviceCachePage.js')

beforeEach(() => {
  vi.clearAllMocks(); fixture.supported = true; fixture.status = 'unauthenticated'
  const scope = { profile: 'one', server: 'http://server', username: 'alice' }
  fixture.owner = { ...scope, namespace: cacheNamespace(scope) }
  fixture.entries = [7, 8].map(id => {
    const song = parseSong({ id, title: `Cached ${id}`, artist: id === 7 ? 'Singer A' : 'Singer B', updated_at: 'revision', duration: 60 })
    return { ...cacheIdentity({ namespace: fixture.owner!.namespace, song, variant: { track: 1, quality: '192', normalize: true }, format: 'm4a' }),
      cached: true as const, url: `file:///private/${id}.m4a`, sizeBytes: 1024, createdAt: 1, snapshot: cacheSnapshot(song) }
  })
  fixture.list.mockResolvedValue({ entries: fixture.entries, total: 2, bytes: 3072, legacy_bytes: 1024 })
})
async function page() { await act(async () => { render(<DeviceCachePage />) }); return getQueriesForElement(elementTree.root!) }
test('expired-session browsing searches local snapshots and plays only the filtered local queue', async () => {
  const queries = await page()
  expect(queries.getByText('Offline access only. Sign in again to use server features.')).toBeInTheDocument()
  expect(queries.getByText('Cached 7')).toBeInTheDocument()
  await act(async () => { fixture.input('Singer B') })
  expect(queries.queryByText('Cached 7')).not.toBeInTheDocument()
  await act(async () => { fireEvent.tap(queries.getByTestId('device-cache-play-8')) })
  const playlist = fixture.playPlaylist.mock.calls[0]?.[0] as unknown as { id: number; deviceCache: { namespace: string } }[]
  expect(playlist.map(song => song.id)).toEqual([8])
  expect(playlist[0].deviceCache.namespace).toBe(fixture.owner!.namespace)
  expect(fixture.navigate).toHaveBeenCalledWith({ to: '/player' })
})
test('a single deletion requires confirmation and removes exactly the selected variant from playback and disk', async () => {
  const queries = await page()
  await act(async () => { fireEvent.tap(queries.getByTestId('device-cache-delete-7')) })
  expect(fixture.remove).not.toHaveBeenCalled()
  await act(async () => { fireEvent.tap(queries.getByTestId('device-cache-confirm-delete')) })
  expect(fixture.forget).toHaveBeenCalledExactlyOnceWith(fixture.entries[0])
  expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(fixture.entries[0])
  expect(fixture.clear).not.toHaveBeenCalled()
})
test('current-account clearing cancels its batch and clears its namespace; legacy clearing is a separate action', async () => {
  const queries = await page()
  await act(async () => { fireEvent.tap(queries.getByTestId('device-cache-clear')) })
  await act(async () => { fireEvent.tap(queries.getByTestId('device-cache-confirm-delete')) })
  expect(fixture.cancel).toHaveBeenCalledOnce()
  expect(fixture.clear).toHaveBeenCalledExactlyOnceWith(fixture.owner!.namespace)
  expect(fixture.legacy).not.toHaveBeenCalled()
})
test('legacy clearing leaves indexed files and the current batch alone', async () => {
  const queries = await page()
  await act(async () => { fireEvent.tap(queries.getByTestId('device-cache-clear-legacy')) })
  await act(async () => { fireEvent.tap(queries.getByTestId('device-cache-confirm-delete')) })
  expect(fixture.legacy).toHaveBeenCalledOnce()
  expect(fixture.clear).not.toHaveBeenCalled()
  expect(fixture.cancel).not.toHaveBeenCalled()
})
test('a signed-out or unsupported client shows no previous actor’s songs or deletion controls', async () => {
  fixture.owner = null
  const queries = await page()
  expect(queries.queryByText('Cached 7')).not.toBeInTheDocument()
  expect(queries.queryByTestId('device-cache-clear')).not.toBeInTheDocument()
  expect(fixture.list).not.toHaveBeenCalled()
})
