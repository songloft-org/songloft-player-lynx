package org.songloft.lynx.ui

import android.content.Context
import android.os.Build
import android.graphics.Canvas
import android.view.View
import android.view.ViewTreeObserver
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import com.lynx.tasm.behavior.LynxProp
import com.lynx.tasm.behavior.LynxUIMethod
import com.lynx.xelement.blur.BlurView
import com.lynx.xelement.blur.LynxUIBlurView

/** Lynx 4.0.0 posts capture updates that can outlive BlurView.destroy(). */
class SongloftBlurUI(context: LynxContext) : LynxUIBlurView<LifecycleBlurView>(context) {
    private var captureTargetId: String? = null
    private val captureGeometry = BlurCaptureGeometry()
    private val captureLocation = IntArray(2)

    @LynxProp(name = "android-capture-target")
    override fun setCaptureTarget(id: String?) {
        captureTargetId = id
        captureGeometry.reset()
        super.setCaptureTarget(id)
    }

    override fun onLayoutUpdated() {
        super.onLayoutUpdated()
        refreshCapture()
    }

    private fun refreshCapture() {
        val id = captureTargetId ?: return
        val surface = view ?: return
        surface.getLocationOnScreen(captureLocation)
        // The SDK only refreshes a dirty source. A sheet sliding over an idle
        // page otherwise keeps its initial, off-screen transparent capture.
        if (captureGeometry.update(surface.width, surface.height, captureLocation[0], captureLocation[1])) {
            super.setCaptureTarget(id)
        }
    }

    override fun createBlurView(context: Context): LifecycleBlurView = LifecycleBlurView(context).also {
        it.tabSource = { lynxContext.lynxView?.findViewByIdSelector("songloft-tab-backdrop") }
        it.tabSelection = { lynxContext.lynxView?.findViewByIdSelector("songloft-tab-selection") }
        it.tabLight = { lynxContext.lynxView?.findViewByIdSelector("songloft-tab-light") }
        it.captureOnMove = { refreshCapture() }
    }

    @LynxProp(name = "songloft-glass", defaultBoolean = false)
    fun setGlass(enabled: Boolean) {
        (view as? LifecycleBlurView)?.setGlass(enabled)
    }

    @LynxProp(name = "songloft-glass-light", defaultFloat = 0.55f)
    fun setGlassLight(intensity: Float) {
        (view as? LifecycleBlurView)?.setGlassLight(intensity)
    }

    @LynxProp(name = "songloft-tab-lens", defaultBoolean = false)
    fun setTabLens(enabled: Boolean) {
        (view as? LifecycleBlurView)?.setTabLens(enabled)
    }

    @LynxUIMethod
    @Suppress("UNUSED_PARAMETER")
    fun animateTabLens(params: ReadableMap, callback: Callback) {
        // Keep the shared UI method contract, but Android optics follow the
        // painted pill/light rather than starting a competing native animator.
        (view as? LifecycleBlurView)?.refreshTabLens()
        callback.invoke(0)
    }

    override fun destroy() {
        (view as? LifecycleBlurView)?.disposeCallbacks()
        super.destroy()
    }
}

class LifecycleBlurView(context: Context) : BlurView(context) {
    private val callbacks = BlurCallbackLifetime()
    private var captureBeforeDraw = false
    private var glassEnabled = false
    private var lightIntensity = 0.55f
    private var glass: GlassRefraction? = null
    private var tabLens = false
    private var tabGlass: TabGlassRefraction? = null
    internal var tabSource: (() -> View?)? = null
    internal var tabSelection: (() -> View?)? = null
    internal var tabLight: (() -> View?)? = null
    internal var captureOnMove: (() -> Unit)? = null
    private var tabEngagement = 0f
    private var tabObserver: ViewTreeObserver? = null
    private var disposed = false
    private val tabPreDraw = ViewTreeObserver.OnPreDrawListener { refreshTabLens(); true }

    fun setTabLens(enabled: Boolean) {
        tabLens = enabled
        alpha = 1f
        tabEngagement = 0f
        unregisterTabObserver()
        if (enabled) registerTabObserver()
        else {
            tabGlass?.dispose()
            tabGlass = null
            updateGlass()
        }
        invalidate()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        registerTabObserver()
    }

    override fun onDetachedFromWindow() {
        unregisterTabObserver()
        super.onDetachedFromWindow()
    }

    private fun registerTabObserver() {
        if (disposed || !tabLens || !isAttachedToWindow || Build.VERSION.SDK_INT < 33) return
        val observer = viewTreeObserver
        if (tabObserver === observer) return
        unregisterTabObserver()
        observer.addOnPreDrawListener(tabPreDraw)
        tabObserver = observer
    }

    private fun unregisterTabObserver() {
        tabObserver?.takeIf { it.isAlive }?.removeOnPreDrawListener(tabPreDraw)
        tabObserver = null
    }

    fun refreshTabLens() {
        if (disposed || !tabLens || Build.VERSION.SDK_INT < 33) return
        val selection = tabSelection?.invoke()
        val engagement = if (selection != null) tabLight?.invoke()?.alpha?.coerceIn(0f, 1f) ?: 0f else 0f
        if (engagement <= 0f) {
            if (tabEngagement > 0f) invalidate()
            tabEngagement = 0f
            return
        }
        val effect = tabGlass ?: TabGlassRefraction().also { tabGlass = it }
        val changed = effect.updateGeometry(selection!!, this)
        // Observing a frame never schedules another one. Only painted geometry,
        // light or a dirty source invalidates the optical layer; idle costs no
        // capture and there is no second animation clock or per-frame JS bridge.
        if (changed || engagement != tabEngagement || tabSource?.invoke()?.isDirty == true) invalidate()
        tabEngagement = engagement
    }

    override fun onPreDraw(): Boolean {
        if (tabLens) return true
        // SDK 4.0.0 queues capture with View.post(), one frame after the sheet
        // moves. Complete only pre-draw capture work before painting this frame.
        captureBeforeDraw = true
        try {
            captureOnMove?.invoke()
            return super.onPreDraw()
        } finally {
            captureBeforeDraw = false
        }
    }

    override fun draw(canvas: Canvas) {
        if (!tabLens) {
            super.draw(canvas)
            return
        }
        if (Build.VERSION.SDK_INT < 33 || tabEngagement <= 0f || width <= 0 || height <= 0) return
        val source = tabSource?.invoke() ?: return
        val effect = tabGlass ?: return
        effect.draw(canvas, source, width, height, resources.displayMetrics.density, tabEngagement, lightIntensity)
    }

    override fun post(action: Runnable): Boolean {
        val guarded = callbacks.wrap(action)
        if (!captureBeforeDraw) return super.post(guarded)
        guarded.run()
        return true
    }

    fun setGlass(enabled: Boolean) {
        glassEnabled = enabled
        updateGlass()
    }

    fun setGlassLight(intensity: Float) {
        lightIntensity = intensity.coerceIn(0f, 1f)
        if (tabLens) invalidate()
        updateGlass()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        updateGlass()
    }

    private fun updateGlass() {
        if (Build.VERSION.SDK_INT < 33) return
        if (tabLens) return
        if (!glassEnabled || width <= 0 || height <= 0) {
            setRenderEffect(null)
            return
        }
        val effect = glass ?: GlassRefraction().also { glass = it }
        setRenderEffect(effect.effect(width, height, resources.displayMetrics.density, lightIntensity))
    }

    fun disposeCallbacks() {
        disposed = true
        callbacks.dispose()
        unregisterTabObserver()
        tabGlass?.dispose()
        tabGlass = null
        tabEngagement = 0f
        tabSource = null
        tabSelection = null
        tabLight = null
        captureOnMove = null
        if (Build.VERSION.SDK_INT >= 33) setRenderEffect(null)
        glass = null
    }
}

/** Check at execution time, including callbacks already in the Android queue. */
internal class BlurCallbackLifetime {
    @Volatile private var disposed = false

    fun wrap(action: Runnable): Runnable = Runnable { if (!disposed) action.run() }

    fun dispose() { disposed = true }
}

/** Bounds-only invalidation: static overlays must not run a capture loop. */
internal class BlurCaptureGeometry {
    private var width = 0
    private var height = 0
    private var left = 0
    private var top = 0

    fun update(nextWidth: Int, nextHeight: Int, nextLeft: Int = 0, nextTop: Int = 0): Boolean {
        if (nextWidth <= 0 || nextHeight <= 0) return false
        if (width == nextWidth && height == nextHeight && left == nextLeft && top == nextTop) return false
        width = nextWidth
        height = nextHeight
        left = nextLeft
        top = nextTop
        return true
    }

    fun reset() { width = 0; height = 0; left = 0; top = 0 }
}
