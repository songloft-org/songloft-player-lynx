export { libopsQueryKeys, useScanProgressQuery, useMetadataProgressQuery } from './scan-query.js'
export type { PollOptions } from './scan-query.js'
export {
  invalidateAfterScan,
  useScanCompletionEffect,
  useStartScanMutation,
  useCancelScanMutation,
  useStartMetadataRefreshMutation,
  useCancelMetadataRefreshMutation,
} from './scan-mutations.js'
export {
  remoteSettingQueryFn,
  applyOptimistic,
  rollback,
  useRemoteSetting,
  useRemoteSettingMutation,
} from './remote-setting.js'
export type { RemoteSetting } from './remote-setting.js'
export {
  useAutoCreatePlaylists,
  useSetAutoCreatePlaylists,
  useScanPlaylistMode,
  useSetScanPlaylistMode,
  useScanTitleSource,
  useSetScanTitleSource,
  useScanAutoFingerprint,
  useSetScanAutoFingerprint,
  useRemoteTitleSource,
  useSetRemoteTitleSource,
  useAutoScan,
  useSetAutoScan,
} from './scan-settings-data.js'
export { useDirectoryTree } from './use-directory-tree.js'
export type { DirectoryTreeActions } from './use-directory-tree.js'
export {
  useMusicPathSetting,
  useDirNames,
  useUpdateExcludeConfig,
  buildMusicPathUpdate,
} from './exclude-dir-data.js'
export type { ExcludeConfigDraft } from './exclude-dir-data.js'
export { useFingerprintStatusQuery, useFingerprintProgressQuery } from './fingerprint-query.js'
export {
  useStartFingerprintMutation,
  useCancelFingerprintMutation,
  useBatchDeleteMutation,
} from './fingerprint-mutations.js'
export { useDuplicatesQuery } from './duplicate-query.js'
