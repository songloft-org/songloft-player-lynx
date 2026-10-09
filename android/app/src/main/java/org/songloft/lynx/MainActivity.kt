package org.songloft.lynx

import android.Manifest
import android.app.Activity
import android.app.UiModeManager
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.database.ContentObserver
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.SurfaceView
import android.view.View
import android.widget.FrameLayout
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.tasm.LynxError
import com.lynx.tasm.LynxLoadMeta
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.LynxViewClient
import com.lynx.tasm.TemplateData
import com.lynx.tasm.behavior.Behavior
import com.lynx.tasm.behavior.LynxContext
import com.lynx.xelement.XElementBehaviors
import org.songloft.lynx.lyric.OverlayPermission
import org.songloft.lynx.navigation.BackKeyState
import org.songloft.lynx.navigation.SongloftNavigationModule
import org.songloft.lynx.system.SystemAppearance
import org.songloft.lynx.ui.SongloftBlurUI
import org.songloft.lynx.video.SongloftVideoModule
import org.songloft.lynx.updater.BundleUpdates

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
    private val motionObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) { pushAppearance() }
    }
    private var contrastListener: UiModeManager.ContrastChangeListener? = null

    private fun appearance(): Map<String, Any> {
        val props = SystemAppearance.from(resources.configuration, contentResolver).toMutableMap()
        // Window attach happens after the initial globalProps snapshot. Use the
        // resolved Activity configuration rather than transient Window flags.
        val accelerated = packageManager.getActivityInfo(componentName, 0).flags and ActivityInfo.FLAG_HARDWARE_ACCELERATED != 0
        props["backdropBlurSupported"] = props["backdropBlurSupported"] == true && accelerated
        props["androidCaptureSupported"] = props["androidCaptureSupported"] == true && accelerated
        props["androidGlassSupported"] = props["androidGlassSupported"] == true && accelerated
        props["androidTabGlassSupported"] = props["androidTabGlassSupported"] == true && accelerated
        if (Build.VERSION.SDK_INT >= 34) {
            props["systemIncreaseContrast"] = getSystemService(UiModeManager::class.java).contrast > 0f
        }
        return props
    }

    private fun pushAppearance() {
        val view = lynxView ?: return
        val props = appearance()
        view.updateGlobalProps(props)
        val params = JavaOnlyArray()
        params.pushMap(JavaOnlyMap.from(props))
        view.sendGlobalEvent(SystemAppearance.EVENT_CHANGED, params)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationPermissionIfNeeded()
        val view: LynxView = buildLynxView()
        view.addLynxViewClient(object : LynxViewClient() {
            override fun onLoadFailed(message: String?) { markStartupFailed() }
            override fun onReceivedError(error: LynxError?) { if (error?.isFatal == true) markStartupFailed() }
            private fun markStartupFailed() {
                Thread { runCatching { BundleUpdates.get(applicationContext)?.failStartup() } }.start()
            }
        })
        lynxView = view
        contentResolver.registerContentObserver(
            Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE), false, motionObserver,
        )
        if (Build.VERSION.SDK_INT >= 34) {
            val listener = UiModeManager.ContrastChangeListener { pushAppearance() }
            contrastListener = listener
            getSystemService(UiModeManager::class.java).addContrastChangeListener(mainExecutor, listener)
        }

        // The fullscreen video surface lives in THIS activity, under the Lynx
        // view, so the Lynx page can paint its own controls above the picture
        // (see `SongloftVideoModule`). `setZOrderMediaOverlay(true)` puts the
        // decoded frame above the window background but below the view hierarchy.
        val root = FrameLayout(this)
        val match = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
        )
        root.addView(SurfaceView(this).apply {
            setZOrderMediaOverlay(true)
            visibility = View.GONE
            SongloftVideoModule.setVideoSurface(this)
        }, match)
        root.addView(view, match)
        setContentView(root)

        // Give the video module a handle to this Activity for orientation locks
        // and to the LynxView for pushing `videoSizeChanged` events up to the page.
        SongloftVideoModule.setActivity(this)
        SongloftVideoModule.setEventEmitter { name, payload ->
            val params = JavaOnlyArray()
            params.pushMap(JavaOnlyMap.from(payload))
            lynxView?.sendGlobalEvent(name, params)
        }

        // `LynxLoadMeta` carries the globalProps *into* the load, so the very
        // first frame already knows the system theme — no flash of the wrong one.
        // (A native-module getter could not manage that: it would be async and
        // answer after the launch frame had painted. `LynxView.setGlobalProps` is
        // deprecated in both overloads, and this is its replacement.) The URL is
        // still resolved by DemoTemplateProvider from
        // app/src/main/assets/main.lynx.bundle.
        val props = appearance().toMutableMap()
        if (intent?.getBooleanExtra(EXTRA_NAVIGATE_TO_PLAYER, false) == true) {
            props[PROP_NAVIGATE_TO_PLAYER] = true
        }
        val meta = LynxLoadMeta.Builder()
        meta.setUrl(BUNDLE_URI)
        meta.setGlobalProps(TemplateData.fromMap(props))
        view.loadTemplate(meta.build())
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent?.getBooleanExtra(EXTRA_NAVIGATE_TO_PLAYER, false) == true) {
            val view = lynxView ?: return
            val params = JavaOnlyArray()
            params.pushMap(JavaOnlyMap.from(emptyMap<String, Any>()))
            view.sendGlobalEvent(EVENT_NAVIGATE_TO_PLAYER, params)
        }
    }

    /**
     * The overlay-permission screen (`SYSTEM_ALERT_WINDOW`) is a system Activity
     * that reports nothing back, so this resume — the app coming back from it —
     * is the only moment a pending grant request can be answered. See
     * [OverlayPermission]; without this wire the floating-lyrics toggle believes
     * every first grant was refused.
     */
    override fun onResume() {
        super.onResume()
        OverlayPermission.onAppForegrounded(this)
        pushAppearance()
        // Plugin WebViews may retain a dead connection after being backgrounded.
        val params = JavaOnlyArray()
        params.pushMap(JavaOnlyMap.from(emptyMap<String, Any>()))
        lynxView?.sendGlobalEvent(EVENT_APP_RESUMED, params)
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
        pushAppearance()

        val isLandscape = newConfig.orientation == Configuration.ORIENTATION_LANDSCAPE
        val metrics = resources.displayMetrics
        val density = if (metrics.density > 0f) metrics.density else 1f
        val orientationParams = JavaOnlyArray()
        orientationParams.pushMap(
            JavaOnlyMap.from(
                mapOf(
                    "orientation" to if (isLandscape) "landscape" else "portrait",
                    "width" to (metrics.widthPixels / density).toDouble(),
                    "height" to (metrics.heightPixels / density).toDouble(),
                ),
            ),
        )
        view.sendGlobalEvent(SongloftVideoModule.EVENT_ORIENTATION_CHANGED, orientationParams)
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
        contentResolver.unregisterContentObserver(motionObserver)
        if (Build.VERSION.SDK_INT >= 34) {
            contrastListener?.let { getSystemService(UiModeManager::class.java).removeContrastChangeListener(it) }
        }
        contrastListener = null
        lynxView = null
        // The video module keeps process-level references (Activity + event
        // emitter); drop them here or a relaunch would push events into the dead
        // LynxView / take an orientation lock on a torn-down Activity.
        SongloftVideoModule.setActivity(null)
        SongloftVideoModule.setEventEmitter(null)
        SongloftVideoModule.setVideoSurface(null)
        // `BackKeyState` is process-level and outlives this Activity, so a relaunch
        // would otherwise start out believing the previous page's JS still owns the
        // back key.
        BackKeyState.reset()
        super.onDestroy()
    }

    private fun buildLynxView(): LynxView {
        val viewBuilder = LynxViewBuilder()
        viewBuilder.addBehaviors(XElementBehaviors().create().filter { it.name != "blur-view" })
        viewBuilder.addBehavior(object : Behavior("blur-view", false) {
            override fun createUI(context: LynxContext): SongloftBlurUI = SongloftBlurUI(context)
        })
        val templates = DemoTemplateProvider(this)
        viewBuilder.setTemplateProvider(templates)
        val frameTemplates = SongloftTemplateResourceFetcher(templates)
        viewBuilder.setTemplateResourceFetcher(frameTemplates)
        viewBuilder.setDynamicComponentFetcher(frameTemplates)
        return viewBuilder.build(this)
    }

    companion object {
        private const val BUNDLE_URI = "main.lynx.bundle"
        private const val REQ_POST_NOTIFICATIONS = 1001

        const val EXTRA_NAVIGATE_TO_PLAYER = "navigate_to_player"
        const val PROP_NAVIGATE_TO_PLAYER = "navigateToPlayer"
        const val EVENT_NAVIGATE_TO_PLAYER = "SongloftNavigation.navigateToPlayer"
        const val EVENT_APP_RESUMED = "SongloftLifecycle.resumed"
    }
}
