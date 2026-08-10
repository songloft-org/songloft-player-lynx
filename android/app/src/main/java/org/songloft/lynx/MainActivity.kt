package org.songloft.lynx

import android.app.Activity
import android.os.Bundle
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.xelement.XElementBehaviors

/**
 * Single full-screen host Activity. Builds one LynxView, registers the XElement
 * behaviors (needed by `<svg>`/`<input>`/overlay/refresh used across the app),
 * wires a `TemplateProvider` that reads the embedded bundle from assets, and
 * renders `main.lynx.bundle`. No dev server / no Explorer — fully offline.
 */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val lynxView: LynxView = buildLynxView()
        setContentView(lynxView)
        // Loaded by DemoTemplateProvider from app/src/main/assets/main.lynx.bundle.
        lynxView.renderTemplateUrl(BUNDLE_URI, "")
    }

    private fun buildLynxView(): LynxView {
        val viewBuilder = LynxViewBuilder()
        viewBuilder.addBehaviors(XElementBehaviors().create())
        viewBuilder.setTemplateProvider(DemoTemplateProvider(this))
        return viewBuilder.build(this)
    }

    companion object {
        private const val BUNDLE_URI = "main.lynx.bundle"
    }
}
