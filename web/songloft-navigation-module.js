/*
 * `NativeModules.SongloftNavigation` for the Web target — the browser back button.
 *
 * Same shape as `songloft-navigation-module`'s siblings: `nativeModulesMap`'s values
 * are **ESM URLs**, imported inside the background worker, and the default export is
 * a factory `(nativeModules, call) => module`.
 *
 * Why any of this is needed on Web: the app's business code runs in a real Web
 * Worker, which has no `history` and no `popstate`. Intercepting browser back has to
 * happen on the main thread, so all three methods forward through `call` and land in
 * `audio-host.js`, which owns the sentinel history entry. The press itself comes back
 * the other way as a `sendGlobalEvent`, exactly as on device.
 *
 * All three are fire-and-forget, matching the Kotlin module: the host is the follower
 * here and has nothing to report.
 */

export default function (_nativeModules, call) {
  return {
    setBackConsumable(consumable) {
      void call('setBackConsumable', [consumable])
    },

    /**
     * No-op on Web, on purpose.
     *
     * The watchdog it feeds only exists for Android, where JS claims the press at a
     * tab root in order to show "press back again to exit". On Web a tab root
     * reports `consumable: false`, so there is no sentinel entry, browser back
     * leaves the page with no JS involved, and a wedged worker cannot trap the user
     * in the first place. Kept so the three hosts expose one interface.
     */
    notifyBackHandled(_seq) {},

    exitApp() {
      void call('exitApp', [])
    },
  }
}
