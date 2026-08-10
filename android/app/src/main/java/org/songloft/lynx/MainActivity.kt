package org.songloft.lynx

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.xelement.XElementBehaviors

/**
 * Single full-screen host Activity. Builds one LynxView, registers the XElement
 * behaviors (needed by `<svg>`/`<input>`/overlay/refresh used across the app),
 * wires a `TemplateProvider` that reads the embedded bundle from assets, and
 * renders `main.lynx.bundle`. No dev server / no Explorer — fully offline.
 *
 * `android:configChanges` (see manifest) keeps this Activity from being
 * recreated on rotation / theme / density changes — recreation would reload the
 * whole bundle and reset JS state. (Process death still reloads; that is covered
 * by persistent `SongloftStorage`, so the session survives.)
 */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationPermissionIfNeeded()
        val lynxView: LynxView = buildLynxView()
        setContentView(lynxView)
        // Loaded by DemoTemplateProvider from app/src/main/assets/main.lynx.bundle.
        lynxView.renderTemplateUrl(BUNDLE_URI, "")
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
