import type { AutoScanSetting } from '../../../models/library-ops.js'
import { getScanSettingsApi } from '../api/index.js'
import {
  DEFAULT_AUTO_SCAN_INTERVAL,
  DEFAULT_PLAYLIST_MODE,
  type AutoScanInterval,
  type PlaylistMode,
  type TitleSource,
} from '../domain/scan-model.js'
import { libopsQueryKeys } from './scan-query.js'
import {
  remoteSettingQueryFn,
  useRemoteSetting,
  useRemoteSettingMutation,
  type RemoteSetting,
} from './remote-setting.js'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

/**
 * The six backend scan preferences, specialised from the `remote-setting`
 * factory — batch 19.
 *
 * Each is its own query + mutation rather than one aggregate: the endpoints are
 * independent, and the requirement is that a failed read degrades **per row**
 * (an aggregate would make one flaky endpoint blank all six rows). The six reads
 * fire in parallel on mount.
 *
 * Note the per-endpoint defaults differ, and two of them are easy to get
 * backwards: `scan-auto-create-playlists` defaults to `true` (not `false`), and
 * `remote-title-source` defaults to `filename` while `scan-title-source`
 * defaults to `tag`.
 */

const DEFAULT_AUTO_SCAN: AutoScanSetting = {
  enabled: false,
  intervalSeconds: DEFAULT_AUTO_SCAN_INTERVAL,
}

/* ------------------------------------------- auto-create playlists (default true) */

export function useAutoCreatePlaylists() {
  return useRemoteSetting(
    libopsQueryKeys.autoCreatePlaylists(),
    () => getScanSettingsApi().getAutoCreatePlaylists(),
    true,
  )
}

export function useSetAutoCreatePlaylists() {
  return useRemoteSettingMutation<boolean>(
    libopsQueryKeys.autoCreatePlaylists(),
    (next) => getScanSettingsApi().setAutoCreatePlaylists(next),
  )
}

/* ------------------------------------------------- playlist mode (default directory) */

export function useScanPlaylistMode() {
  return useRemoteSetting(
    libopsQueryKeys.playlistMode(),
    () => getScanSettingsApi().getPlaylistMode(),
    DEFAULT_PLAYLIST_MODE,
  )
}

export function useSetScanPlaylistMode() {
  return useRemoteSettingMutation<PlaylistMode>(
    libopsQueryKeys.playlistMode(),
    (next) => getScanSettingsApi().setPlaylistMode(next),
  )
}

/* ------------------------------------------------------ scan title source (default tag) */

export function useScanTitleSource() {
  return useRemoteSetting<TitleSource>(
    libopsQueryKeys.titleSource(),
    () => getScanSettingsApi().getTitleSource(),
    'tag',
  )
}

export function useSetScanTitleSource() {
  return useRemoteSettingMutation<TitleSource>(
    libopsQueryKeys.titleSource(),
    (next) => getScanSettingsApi().setTitleSource(next),
  )
}

/* ---------------------------------------------- auto fingerprint (default false) */

export function useScanAutoFingerprint() {
  return useRemoteSetting(
    libopsQueryKeys.autoFingerprint(),
    () => getScanSettingsApi().getAutoFingerprint(),
    false,
  )
}

export function useSetScanAutoFingerprint() {
  return useRemoteSettingMutation<boolean>(
    libopsQueryKeys.autoFingerprint(),
    (next) => getScanSettingsApi().setAutoFingerprint(next),
  )
}

/* -------------------------------------------- remote title source (default filename) */

export function useRemoteTitleSource() {
  return useRemoteSetting<TitleSource>(
    libopsQueryKeys.remoteTitleSource(),
    () => getScanSettingsApi().getRemoteTitleSource(),
    'filename',
  )
}

export function useSetRemoteTitleSource() {
  return useRemoteSettingMutation<TitleSource>(
    libopsQueryKeys.remoteTitleSource(),
    (next) => getScanSettingsApi().setRemoteTitleSource(next),
  )
}

/* --------------------------------------------------------------------- auto scan */

/**
 * Auto-scan is the one object-valued setting, so it gets an explicit pair rather
 * than going through the scalar factory. Both fields are always written together
 * because the endpoint takes the whole object.
 */
export function useAutoScan() {
  return useQuery({
    queryKey: libopsQueryKeys.autoScan(),
    queryFn: () =>
      remoteSettingQueryFn(() => getScanSettingsApi().getAutoScan(), DEFAULT_AUTO_SCAN),
    staleTime: 60_000,
  })
}

export function useSetAutoScan() {
  const queryClient = useQueryClient()
  const key = libopsQueryKeys.autoScan()
  return useMutation({
    mutationFn: ({ enabled, intervalSeconds }: AutoScanSetting) =>
      getScanSettingsApi().setAutoScan(enabled, intervalSeconds as AutoScanInterval),
    onMutate: async (next: AutoScanSetting) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<RemoteSetting<AutoScanSetting>>(key)
      queryClient.setQueryData<RemoteSetting<AutoScanSetting>>(key, {
        value: next,
        readFailed: false,
      })
      return { previous }
    },
    onError: (_error, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData<RemoteSetting<AutoScanSetting>>(key, context.previous)
      }
    },
  })
}
