import type { ReactNode } from '@lynx-js/react'
import { act, renderHook } from '@lynx-js/react/testing-library'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, test, vi } from 'vitest'

const { deleteTag, changePlaylist } = vi.hoisted(() => ({ deleteTag: vi.fn(), changePlaylist: vi.fn() }))
vi.mock('../api/index.js', () => ({ getSongTagsApi: () => ({ delete: deleteTag }) }))
vi.mock('../../playlist/api/index.js', () => ({
  getPlaylistApi: () => ({
    deletePlaylist: changePlaylist,
    batchDeletePlaylists: changePlaylist,
    setPlaylistVisibility: changePlaylist,
  }),
}))

const { useDeleteTagMutation } = await import('../data/song-tags-query.js')
const { useDeletePlaylistMutation, useSetVisibilityMutation } = await import('../../playlist/data/playlist-mutations.js')

test('deleting a shared tag reloads cached playlist bindings before an ID can be reused', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const keys = [
    ['playlist', 'list', {}],
    ['playlist', 'list', { tagId: 1 }],
    ['playlist', 'detail', 3],
  ]
  let stored = { id: 3, labels: ['tag:1'] }
  for (const key of keys) client.setQueryData(key, stored)
  deleteTag.mockImplementation(async () => { stored = { id: 3, labels: [] } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result, unmount } = renderHook(useDeleteTagMutation, { wrapper })
  try {
    await act(async () => { await result.current.mutateAsync(1) })
    for (const queryKey of keys) {
      const playlist = await client.fetchQuery({
        queryKey,
        queryFn: async () => stored,
        staleTime: Infinity,
      })
      expect(playlist.labels).toEqual([])
    }
  } finally {
    unmount()
    client.clear()
  }
})

test.each(['delete', 'batch-delete', 'hide', 'show'])(
  '%s refreshes the visible playlist count in cached shared tags', async (action) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const before = action === 'show' ? 0 : 1
    let count = before
    const keys = [['song-tags', 'list', ''], ['song-tags', 'definitions']]
    for (const key of keys) client.setQueryData(key, { playlistCount: count })
    changePlaylist.mockImplementation(async () => { count = 1 - before })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result, unmount } = renderHook(() => ({
      remove: useDeletePlaylistMutation(),
      visibility: useSetVisibilityMutation(),
    }), { wrapper })
    try {
      await act(async () => {
        if (action === 'delete') await result.current.remove.mutateAsync(3)
        else if (action === 'batch-delete') await result.current.remove.mutateAsync({ ids: [3], deleteSongs: false })
        else await result.current.visibility.mutateAsync({ id: 3, hidden: action === 'hide' })
      })
      for (const queryKey of keys) {
        const tag = await client.fetchQuery({ queryKey, queryFn: async () => ({ playlistCount: count }), staleTime: Infinity })
        expect(tag.playlistCount).toBe(1 - before)
      }
    } finally {
      unmount()
      client.clear()
    }
  },
)
