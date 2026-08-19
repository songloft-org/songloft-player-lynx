package org.songloft.lynx.navigation

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.tasm.behavior.LynxContext

/**
 * Back-key plumbing. Exposed to JS as `NativeModules.SongloftNavigation`;
 * see `src/native/navigation.ts` and `docs/reference/back-navigation.md`.
 *
 * Every method is a fire-and-forget write with no `Callback`, matching
 * `SongloftStorageModule.setItem`: the host is the follower in this relationship
 * and has nothing to report back. The one thing that travels the other way — a
 * back press — is a global event sent from [org.songloft.lynx.MainActivity], which
 * is where the `LynxView` lives.
 */
class SongloftNavigationModule(context: Context) : LynxModule(context) {

    companion object {
        const val NAME = "SongloftNavigation"

        /** Global event carrying one back press. Must match `BACK_PRESSED_EVENT` in TS. */
        const val EVENT_BACK_PRESSED = "SongloftNavigation.backPressed"

        private val mainHandler = Handler(Looper.getMainLooper())
    }

    /** JS's answer to "is the next back press yours?". */
    @LynxMethod
    fun setBackConsumable(consumable: Boolean) {
        BackKeyState.setConsumable(consumable)
    }

    /** Resets the watchdog — JS is alive and finished with press [seq]. */
    @LynxMethod
    fun notifyBackHandled(seq: Int) {
        BackKeyState.ackHandled(seq)
    }

    /**
     * Leave the app.
     *
     * `moveTaskToBack` rather than `finish()`: this is a music player, and finishing
     * would tear down the LynxView so the next launch is a cold start with the whole
     * UI state rebuilt. It also matches what the system itself does for a root
     * activity since Android 12. `finish()` remains the fallback for the case
     * `moveTaskToBack` refuses (not the task root).
     *
     * Posted to the main looper because `@LynxMethod` runs on the Lynx JS thread,
     * and touching the Activity from there throws — an exception this module's
     * caller would never see.
     */
    @LynxMethod
    fun exitApp() {
        mainHandler.post {
            val host = (mContext as? LynxContext)?.getContext()
            if (host is Activity && !host.moveTaskToBack(true)) host.finish()
        }
    }
}
