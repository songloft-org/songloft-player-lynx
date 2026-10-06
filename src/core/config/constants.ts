/**
 * App-wide constants ported from the Flutter `lib/config/constants.dart` and
 * `AppConfig`. Kept framework-free so models / network / store can all import
 * them without pulling in Lynx runtime globals.
 */

/**
 * Injected by lynx.config.ts from the shared release metadata. The fallback is
 * only for unbundled tests; application builds always receive the injected value.
 */
export const clientBuild =
  typeof __SONGLOFT_BUILD__ === 'undefined'
    ? {
        version: 'dev',
        git_commit: 'unknown',
        build_time: 'unknown',
        build_number: 1,
      }
    : __SONGLOFT_BUILD__
export const clientVersion = clientBuild.version

/** Default page size for paginated list endpoints. */
export const defaultPageSize = 20

/** Hard upper bound the backend accepts for a single page. */
export const maxPageSize = 100

/**
 * Entries the backend keeps per playback context (`MaxPlayHistoryPerContext`).
 * A hard cap, not a page size — `/play-history` does not paginate.
 */
export const maxPlayHistoryEntries = 50

/**
 * `source` reported with play events (`POST /songs/{id}/played`) and forwarded
 * to subscribed JS plugins. Same value the Flutter client sends: the two are the
 * same product, and a distinct value would make any downstream source filter
 * silently miss this client.
 */
export const playEventSource = 'songloft-player'

/** Built-in "Favorites" playlist id (normal). */
export const favoritePlaylistId = '1'

/** Built-in radio-favorites playlist id. */
export const radioFavoritePlaylistId = '2'

/** Playback modes (order of play). */
export const playMode = {
  order: 'order',
  loop: 'loop',
  single: 'single',
  random: 'random',
} as const
export type PlayMode = (typeof playMode)[keyof typeof playMode]
export const playModes: readonly PlayMode[] = [
  playMode.order,
  playMode.loop,
  playMode.single,
  playMode.random,
]

/** Song source types. */
export const songType = {
  local: 'local',
  remote: 'remote',
  radio: 'radio',
} as const
export type SongType = (typeof songType)[keyof typeof songType]

/** Playlist types. */
export const playlistType = {
  normal: 'normal',
  radio: 'radio',
} as const
export type PlaylistType = (typeof playlistType)[keyof typeof playlistType]

/** Playlist label markers. */
export const playlistLabel = {
  builtIn: 'built_in',
  autoCreated: 'auto_created',
  hidden: 'hidden',
} as const
export type PlaylistLabel = (typeof playlistLabel)[keyof typeof playlistLabel]
