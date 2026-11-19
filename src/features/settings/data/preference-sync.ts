import { appConfig } from '../../../core/config/app-config.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import {
  preferenceChanged,
  preferencesApplied,
  subscribePreferenceChanges,
  type PreferencePatch,
  type UserPreferences,
} from '../../../core/storage/user-preference-events.js'
import { logWarn } from '../../../core/logging/client-logger.js'
import { useAppSessionStore } from '../../../store/app-session.js'
import { subscribeAppVisibility } from '../../../native/app-visibility.js'
import { getPlatformTarget } from '../../../native/platform-target.js'
import { applySyncedTheme, getAppTheme, PREF_THEME } from '../../../shared/theme/theme-model.js'
import { useAuthStore } from '../../auth/store/index.js'
import { readPlaylistViewMode } from '../../playlist/data/playlist-view-prefs.js'
import {
  readLocalCacheMaxSize,
  PREF_LOCAL_CACHE_MAX_SIZE,
} from '../../player/data/song-cache-prefs.js'
import { setAudioQualityCache, usePlayerStore } from '../../player/store/player-store.js'
import { PREF_VOLUME } from '../../player/data/volume-prefs.js'
import { getSettingsApi } from '../api/index.js'
import { PreferenceSync } from '../domain/preference-sync.js'
import { PREF_AUDIO_QUALITY, PREF_DEFAULT_PLAY_MODE, readAudioQuality } from './settings-prefs.js'

const PREF_KEYS: Record<keyof UserPreferences, string> = {
  theme_mode: PREF_THEME,
  play_mode: PREF_DEFAULT_PLAY_MODE,
  playlist_view_mode: 'playlist_view_mode',
  audio_quality: PREF_AUDIO_QUALITY,
  local_cache_max_size: PREF_LOCAL_CACHE_MAX_SIZE,
  volume: PREF_VOLUME,
}

/** Android's volume slider controls the system media stream. A server-side app
 * preference must not be replayed during startup because that would overwrite
 * the system volume the user configured outside Lynx. Local user changes still
 * flow through `setVolume` and are uploaded normally.
 */
export function filterRemotePreferencesForPlatform(
  patch: PreferencePatch,
): PreferencePatch {
  if (getPlatformTarget() !== 'android' || !('volume' in patch)) return patch
  const { volume: _volume, ...rest } = patch
  return rest
}

let dispose: (() => void) | undefined

/** Install after local startup restoration, then follow login/logout and server/account switches. */
export function initializePreferenceSync(): () => void {
  dispose?.()
  let sync: PreferenceSync | undefined
  let scope: string | null = null
  let applyingLive = false
  const currentScope = () => {
    const auth = useAuthStore.getState()
    const session = useAppSessionStore.getState()
    return auth.status === 'authenticated' && !auth.isLoading && session.username
      ? JSON.stringify([
          session.baseUrl,
          appConfig.resolvedBaseUrl,
          appConfig.basePath,
          session.username,
        ])
      : null
  }
  const refreshSession = () => {
    const next = currentScope()
    if (next === scope) return
    sync?.stop()
    sync = undefined
    scope = next
    if (!next) return
    const serverBaseUrl = `${appConfig.resolvedBaseUrl}${appConfig.basePath}`.replace(/\/$/, '')
    const assertScope = () => {
      if (currentScope() !== next) throw new Error('Preference session changed')
    }
    const instance = new PreferenceSync({
      readLocal: async () => {
        const [quality, view, cache] = await Promise.all([
          readAudioQuality(),
          readPlaylistViewMode(),
          readLocalCacheMaxSize(),
        ])
        const player = usePlayerStore.getState()
        return {
          theme_mode: getAppTheme(),
          play_mode: player.playMode,
          playlist_view_mode: view,
          audio_quality: quality,
          local_cache_max_size: cache,
          volume: player.volume,
        }
      },
      fetch: (assertCurrent) =>
        getSettingsApi().getUserPreferences({
          serverBaseUrl,
          assertCurrent: () => {
            assertScope()
            assertCurrent()
          },
        }),
      save: (prefs, assertCurrent) =>
        getSettingsApi().updateUserPreferences(prefs, {
          serverBaseUrl,
          assertCurrent: () => {
            assertScope()
            assertCurrent()
          },
        }),
      apply: async (patch, canApply) => {
        const storage = getSongloftStorage()
        const platformPatch = filterRemotePreferencesForPlatform(patch)
        for (const key of Object.keys(platformPatch) as (keyof UserPreferences)[]) {
          if (!canApply(key)) continue
          assertScope()
          await storage.prefs.set(PREF_KEYS[key], String(platformPatch[key]))
          if (!canApply(key)) continue
          assertScope()
          // These live updates synchronously notify the store. Suppress only
          // their echo, never user actions during an asynchronous storage write.
          applyingLive = true
          try {
            if (key === 'theme_mode') applySyncedTheme(platformPatch.theme_mode!)
            if (key === 'audio_quality')
              setAudioQualityCache(platformPatch.audio_quality === 'original' ? null : platformPatch.audio_quality!)
            if (key === 'play_mode') usePlayerStore.getState().setPlayMode(platformPatch.play_mode!)
            if (key === 'volume')
              void usePlayerStore
                .getState()
                .setVolume(platformPatch.volume!)
                .catch(() => {})
          } finally {
            applyingLive = false
          }
        }
        assertScope()
        preferencesApplied()
      },
      onError: (error) =>
        logWarn('preferences', error instanceof Error ? error.message : String(error)),
    })
    sync = instance
    void instance.start()
  }
  const stops = [
    subscribeAppVisibility((visible) => {
      if (visible) {
        refreshSession()
        void sync?.start()
      }
    }),
    useAuthStore.subscribe(refreshSession),
    useAppSessionStore.subscribe(refreshSession),
    subscribePreferenceChanges((patch) => {
      refreshSession()
      sync?.change(patch)
    }),
    usePlayerStore.subscribe((state, previous) => {
      if (applyingLive) return
      const patch: PreferencePatch = {}
      if (state.playMode !== previous.playMode) patch.play_mode = state.playMode
      if (state.volume !== previous.volume) patch.volume = state.volume
      if (Object.keys(patch).length) preferenceChanged(patch)
    }),
  ]
  refreshSession()
  const stop = () => {
    sync?.stop()
    stops.forEach((fn) => fn())
  }
  dispose = stop
  return stop
}
