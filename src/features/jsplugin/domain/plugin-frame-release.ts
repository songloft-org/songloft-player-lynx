/**
 * Releasing a plugin's Web frame — the *only* place that tears one down.
 *
 * Leaving a plugin page no longer destroys its frame: detaching a plugin frame is
 * what crashed the Chrome renderer (error code 11 / SIGSEGV), so a tab switch
 * only hides it and the plugin stays alive off screen. See
 * `docs/archive/web-plugin-tab-crash.md` and the notes in `web/webview-host.js`.
 *
 * That leaves exactly one obligation: when a plugin genuinely goes away, its
 * document must stop running. The moments are all in the plugin manager —
 * disable, uninstall, force-update — plus logout, which invalidates the token the
 * plugin page was loaded with.
 *
 * Both engines are released for the same `entryPath` on purpose. A plugin's
 * `renderEngine` can change across a force-update, and asking a module about a
 * key it never opened is a no-op, so releasing both is cheaper than tracking
 * which one is live.
 *
 * Inert on native platforms: both facades answer with unavailable stubs there,
 * where the frame is a real `<webview>`/`<frame>` owned by the element tree.
 */
import { getLynxFrameModule } from '../../../native/web-lynx-frame.js'
import { getWebviewModule } from '../../../native/web-webview.js'

/** Stop and release one plugin's frame. Safe when it was never opened. */
export function releasePluginFrame(entryPath: string): void {
  if (!entryPath) return
  getWebviewModule().close(entryPath)
  getLynxFrameModule().close(entryPath)
}

/**
 * Release every plugin frame — the logout case, where every loaded page holds a
 * now-dead `?access_token=`.
 *
 * Not strictly required for correctness (re-login changes the URL, so the next
 * `open` navigates the frame anyway), but a logged-out session should not leave
 * plugins polling in the background.
 */
export function releaseAllPluginFrames(): void {
  getWebviewModule().close('')
  getLynxFrameModule().close('')
}
