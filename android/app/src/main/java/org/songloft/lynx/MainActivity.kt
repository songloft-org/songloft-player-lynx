package org.songloft.lynx

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.tasm.LynxLoadMeta
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.TemplateData
import com.lynx.xelement.XElementBehaviors
import org.songloft.lynx.navigation.BackKeyState
import org.songloft.lynx.navigation.SongloftNavigationModule
import org.songloft.lynx.system.SystemAppearance

/**
 * Single full-screen host Activity. Builds one LynxView, registers the XElement
 * behaviors (needed by `<svg>`/`<input>`/overlay/refresh used across the app),
 * wires a `TemplateProvider` that reads the embedded bundle from assets, and
 * renders `main.lynx.bundle`. No dev server / no Explorer — fully offline.
 *
 * `android:configChanges` (see manifest) keeps this Activity from being
 * recreated on rotation / theme / locale / density changes — recreation would
 * reload the whole bundle and reset JS state. (Process death still reloads; that
 * is covered by persistent `SongloftStorage`, so the session survives.) The flip
 * side is that the running page has to be *told* about those changes: see
 * [onConfigurationChanged].
 */
class MainActivity : Activity() {
    /** Kept so [onConfigurationChanged] can push appearance updates into the page. */
    private var lynxView: LynxView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationPermissionIfNeeded()
        val view: LynxView = buildLynxView()
        lynxView = view
        setContentView(view)
        // `LynxLoadMeta` carries the globalProps *into* the load, so the very
        // first frame already knows the system theme — no flash of the wrong one.
        // (A native-module getter could not manage that: it would be async and
        // answer after the launch frame had painted. `LynxView.setGlobalProps` is
        // deprecated in both overloads, and this is its replacement.) The URL is
        // still resolved by DemoTemplateProvider from
        // app/src/main/assets/main.lynx.bundle.
        val meta = LynxLoadMeta.Builder()
        meta.setUrl(BUNDLE_URI)
        meta.setGlobalProps(TemplateData.fromMap(SystemAppearance.from(resources.configuration)))
        view.loadTemplate(meta.build())
    }

    /**
     * Dark-mode and language switches arrive here (rather than recreating the
     * Activity) because the manifest claims `uiMode|locale|layoutDirection`. Lynx
     * pushes nothing on its own, so this is the *only* way a running page learns
     * the system setting changed.
     *
     * Both channels are updated: `globalProps` so any later first read is
     * correct, and a global event so the already-running page reacts now — see
     * `src/native/system-appearance.ts`.
     */
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val view = lynxView ?: return
        val appearance = SystemAppearance.from(newConfig)
        view.updateGlobalProps(appearance)
        val params = JavaOnlyArray()
        params.pushMap(JavaOnlyMap.from(appearance))
        view.sendGlobalEvent(SystemAppearance.EVENT_CHANGED, params)
    }

    /**
     * Hardware / gesture back.
     *
     * Whether a press belongs to the page is decided by [BackKeyState], a flag JS
     * mirrors into the host — `onBackPressed` must answer synchronously and Lynx
     * cannot be called synchronously, so the answer has to be cached ahead of time.
     * When the flag says yes we forward the press as a global event and **do not**
     * call `super`; when it says no the system default runs, which for this
     * (task-root) Activity means leaving the app.
     *
     * The `super` path is also the watchdog's exit: [BackKeyState.shouldForward]
     * stops trusting the flag after [BackKeyState.MAX_UNANSWERED] unanswered
     * presses, so a wedged JS thread cannot hold the key hostage.
     *
     * Still the legacy callback rather than `OnBackInvokedDispatcher`: `targetSdk`
     * is 34 and the manifest sets `android:enableOnBackInvokedCallback="false"`, so
     * this is what the framework dispatches. `android-manifest-contract.test.ts`
     * fails the build if `targetSdk` moves to 35+ without that migration.
     */
    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        val view = lynxView
        if (view == null || !BackKeyState.shouldForward()) {
            super.onBackPressed()
            return
        }
        val params = JavaOnlyArray()
        params.pushMap(JavaOnlyMap.from(mapOf<String, Any>("seq" to BackKeyState.noteForwarded())))
        view.sendGlobalEvent(SongloftNavigationModule.EVENT_BACK_PRESSED, params)
    }

    /**
     * Android 13+ (API 33) requires a **runtime** grant for `POST_NOTIFICATIONS`
     * — the manifest declaration alone is not enough for the media playback
     * notification to appear. Older versions are granted at install time, so we
     * skip them.
     */
    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_POST_NOTIFICATIONS)
    }

    override fun onDestroy() {
        lynxView = null
        // `BackKeyState` is process-level and outlives this Activity, so a relaunch
        // would otherwise start out believing the previous page's JS still owns the
        // back key.
        BackKeyState.reset()
        super.onDestroy()
    }

    private fun buildLynxView(): LynxView {
        val viewBuilder = LynxViewBuilder()
        viewBuilder.addBehaviors(XElementBehaviors().create())
        viewBuilder.setTemplateProvider(DemoTemplateProvider(this))
        return viewBuilder.build(this)
    }

    companion object {
        private const val BUNDLE_URI = "main.lynx.bundle"
        private const val REQ_POST_NOTIFICATIONS = 1001
    }
}
