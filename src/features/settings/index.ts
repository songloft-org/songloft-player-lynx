export { SettingsPage } from './pages/SettingsPage.js'
export { LicensesPage } from './pages/LicensesPage.js'
export { ThemePacksPage } from './pages/ThemePacksPage.js'
export { UpgradePage } from './pages/UpgradePage.js'
export { ProxySettingsPage } from './pages/ProxySettingsPage.js'

// Sub-pages split out of the settings list. `SubPageShell` is deliberately NOT
// re-exported: this barrel also exports `SettingsPage`, which imports every
// sub-page, so a sub-page importing the barrel back would be a real cycle.
export { AppearancePage } from './pages/AppearancePage.js'
export { PlaybackPage } from './pages/PlaybackPage.js'
export { LyricsPage } from './pages/LyricsPage.js'
export { DataPage } from './pages/DataPage.js'
export { AboutPage } from './pages/AboutPage.js'
export { DiagnosticsPage } from './pages/DiagnosticsPage.js'

export { CacheManagePage } from './pages/CacheManagePage.js'
export { EqualizerPage } from './pages/EqualizerPage.js'
export { ServerListPage } from './pages/ServerListPage.js'
export { ServerEditPage } from './pages/ServerEditPage.js'
export { coercePlayMode, serverDisplay } from './domain/settings-model.js'
export type { ServerDisplayLabels } from './domain/settings-model.js'
export {
  LOG_LEVELS,
  coerceLogLevel,
  logLevelLabelKey,
} from './domain/log-level.js'
export type { LogLevel } from './domain/log-level.js'
export {
  PREF_DEFAULT_PLAY_MODE,
  readDefaultPlayMode,
  writeDefaultPlayMode,
  applyServerSettings,
} from './data/settings-prefs.js'
export type { ServerSettings } from './data/settings-prefs.js'
export { getSettingsApi, SettingsApi } from './api/index.js'
