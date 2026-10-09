package org.songloft.lynx.ui

import android.content.Context
import android.os.Build
import com.lynx.tasm.behavior.LynxContext
import com.lynx.tasm.behavior.LynxProp
import com.lynx.xelement.blur.BlurView
import com.lynx.xelement.blur.LynxUIBlurView

/** Lynx 4.0.0 posts capture updates that can outlive BlurView.destroy(). */
class SongloftBlurUI(context: LynxContext) : LynxUIBlurView<LifecycleBlurView>(context) {
    override fun createBlurView(context: Context): LifecycleBlurView = LifecycleBlurView(context)

    @LynxProp(name = "songloft-glass", defaultBoolean = false)
    fun setGlass(enabled: Boolean) {
        (view as? LifecycleBlurView)?.setGlass(enabled)
    }

    @LynxProp(name = "songloft-glass-light", defaultFloat = 0.55f)
    fun setGlassLight(intensity: Float) {
        (view as? LifecycleBlurView)?.setGlassLight(intensity)
    }

    override fun destroy() {
        (view as? LifecycleBlurView)?.disposeCallbacks()
        super.destroy()
    }
}

class LifecycleBlurView(context: Context) : BlurView(context) {
    private val callbacks = BlurCallbackLifetime()
    private var glassEnabled = false
    private var lightIntensity = 0.55f
    private var glass: GlassRefraction? = null

    override fun post(action: Runnable): Boolean = super.post(callbacks.wrap(action))

    fun setGlass(enabled: Boolean) {
        glassEnabled = enabled
        updateGlass()
    }

    fun setGlassLight(intensity: Float) {
        lightIntensity = intensity.coerceIn(0f, 1f)
        updateGlass()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        updateGlass()
    }

    private fun updateGlass() {
        if (Build.VERSION.SDK_INT < 33) return
        if (!glassEnabled || width <= 0 || height <= 0) {
            setRenderEffect(null)
            return
        }
        val effect = glass ?: GlassRefraction().also { glass = it }
        setRenderEffect(effect.effect(width, height, resources.displayMetrics.density, lightIntensity))
    }

    fun disposeCallbacks() {
        callbacks.dispose()
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
