import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'

import type { MusicPathSetting } from '../../../models/library-ops.js'
import { getScanApi, getScanSettingsApi } from '../api/index.js'
import { libopsQueryKeys } from './scan-query.js'
import { remoteSettingQueryFn, type RemoteSetting } from './remote-setting.js'

/**
 * Music-path setting + dir-names queries, and the exclude-list mutation —
 * batch 26.
 *
 * `path` is never part of the write surface exposed to widgets: it is the
 * music root, display-only everywhere in this app (see the model doc comment
 * and the Flutter reference `exclude_dir_manager.dart`, which re-reads and
 * echoes `path` unchanged on every save). `ExcludeConfigDraft` below excludes
 * the field at the type level so no call site can even attempt to send one.
 */

const DEFAULT_MUSIC_PATH_SETTING: MusicPathSetting = {
  path: '',
  excludeDirs: [],
  excludePaths: [],
  autoCreateExcludeDirs: [],
}

export function useMusicPathSetting() {
  return useQuery({
    queryKey: libopsQueryKeys.musicPathSetting(),
    queryFn: () =>
      remoteSettingQueryFn(
        () => getScanSettingsApi().getMusicPath(),
        DEFAULT_MUSIC_PATH_SETTING,
      ),
    staleTime: 60_000,
  })
}

/** Rarely changes; loaded once per page visit, same as the Flutter reference. */
export function useDirNames() {
  return useQuery({
    queryKey: libopsQueryKeys.dirNames(),
    queryFn: () => remoteSettingQueryFn(() => getScanApi().getDirNames(), [] as string[]),
    staleTime: 300_000,
  })
}

export type ExcludeConfigDraft = Omit<MusicPathSetting, 'path'>

/**
 * Read the last-known `path` out of the cache and splice it onto the draft —
 * the write invariant that `path` never comes from the caller, extracted as a
 * plain function so it is directly testable without a `QueryClientProvider`
 * (mirrors `applyOptimistic`/`rollback` in `remote-setting.ts`).
 */
export function buildMusicPathUpdate(
  queryClient: QueryClient,
  key: QueryKey,
  draft: ExcludeConfigDraft,
): MusicPathSetting {
  const current = queryClient.getQueryData<RemoteSetting<MusicPathSetting>>(key)
  const path = current?.value.path ?? DEFAULT_MUSIC_PATH_SETTING.path
  // `path` must be spread last: it is the one field this function exists to
  // protect, and object spread lets a later key win — reversing this order
  // would let a caller's stray `path` (bypassing the type system, e.g. via a
  // wider object) silently overwrite the cached one.
  return { ...draft, path }
}

/**
 * Save the three exclude lists. `path` is read from the last successful
 * `useMusicPathSetting` read (never from the caller) and sent back unchanged —
 * the backend's `PUT` has no partial-update variant, so the full object must
 * round-trip.
 *
 * No optimistic update: this is an explicit Save-button action (mirrors the
 * Flutter reference's `FilledButton` + snackbar), not a live toggle, so a
 * failure should leave the draft visibly unsaved rather than flip-then-revert.
 */
export function useUpdateExcludeConfig() {
  const queryClient = useQueryClient()
  const key = libopsQueryKeys.musicPathSetting()
  return useMutation({
    mutationFn: (draft: ExcludeConfigDraft) =>
      getScanSettingsApi().updateMusicPath(buildMusicPathUpdate(queryClient, key, draft)),
    onSuccess: (saved) => {
      queryClient.setQueryData<RemoteSetting<MusicPathSetting>>(key, {
        value: saved,
        readFailed: false,
      })
    },
  })
}
