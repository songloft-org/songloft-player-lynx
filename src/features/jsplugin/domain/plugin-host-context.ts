import { clientVersion } from '../../../core/config/constants.js'
import { getPlatformTarget } from '../../../native/platform-target.js'
import { preparePluginVideoRoute } from '../../../core/navigation/route-back-action.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { canOpenExternalURL, getHostCookies, openExternalURL } from '../../../native/native-platform.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import { getSongsApi } from '../../library/api/index.js'
import type { PluginHostContext } from './plugin-host-dispatch.js'
import { desktopConfig } from '../../../desktop/client.js'

/** Shared by HTML plugins and native Lynx frames; always use parsed domain Songs. */
export const pluginHostContext: PluginHostContext = {
  get platform() { const desktop = desktopConfig(); return desktop ? desktop.os === 'darwin' ? 'macos' : 'windows' : isWebPlatform() ? 'web' : getPlatformTarget() },
  get version() { return desktopConfig()?.build?.version ?? clientVersion },
  async resolveSongs(ids) {
    const api = getSongsApi()
    const songs = []
    for (const id of ids) {
      try { songs.push(await api.getSong(id)) }
      catch { /* A missing song must not prevent the rest of a batch from playing. */ }
    }
    return songs
  },
  get cookieProvider() { return isWebPlatform() ? undefined : getHostCookies },
  get confirmedPluginOpenUrl() {
    return canOpenExternalURL() ? openExternalURL : undefined
  },
  get preparePluginVideo() {
    const desktop = desktopConfig()
    const available = desktop ? desktop.capabilities?.video : getPlatformCapabilities().video
    return available ? preparePluginVideoRoute : undefined
  },
}
