package org.songloft.lynx.ui

import android.content.Context
import android.os.Build
import android.animation.ValueAnimator
import android.graphics.Canvas
import android.view.View
import android.view.animation.LinearInterpolator
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import com.lynx.tasm.behavior.LynxProp
import com.lynx.tasm.behavior.LynxUIMethod
import com.lynx.xelement.blur.BlurView
import com.lynx.xelement.blur.LynxUIBlurView

/** Lynx 4.0.0 posts capture updates that can outlive BlurView.destroy(). */
class SongloftBlurUI(context: LynxContext) : LynxUIBlurView<LifecycleBlurView>(context) {
    override fun createBlurView(context: Context): LifecycleBlurView = LifecycleBlurView(context).also {
        it.tabSource = { lynxContext.lynxView?.findViewByIdSelector("songloft-tab-backdrop") }
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
    fun animateTabLens(params: ReadableMap, callback: Callback) {
        val rows = params.getArray("frames")
        val frames = (0 until (rows?.size() ?: 0)).map { i ->
            val row = rows!!.getArray(i)
            FloatArray(4) { j -> row.getDouble(j).toFloat() }
        }
        (view as? LifecycleBlurView)?.animateTabLens(
            frames,
            params.getInt("count"),
            params.getInt("duration"),
            params.getDouble("startedAt", 0.0).toLong(),
        )
        callback.invoke(0)
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
    private var tabLens = false
    private var tabGlass: TabGlassRefraction? = null
    private var tabAnimation: ValueAnimator? = null
    internal var tabSource: (() -> View?)? = null
    private var tabPose: FloatArray? = null
    private var tabCount = 1

    fun setTabLens(enabled: Boolean) {
        tabLens = enabled
        if (enabled) alpha = 0f
        else {
            tabAnimation?.cancel()
            tabAnimation = null
            tabGlass?.dispose()
            tabGlass = null
            tabPose = null
            alpha = 1f
            updateGlass()
        }
    }

    fun animateTabLens(frames: List<FloatArray>, count: Int, duration: Int, startedAt: Long) {
        tabAnimation?.cancel()
        tabAnimation = null
        alpha = 0f
        if (Build.VERSION.SDK_INT < 33 || !tabLens || count <= 0 || duration <= 0 || frames.size < 2) return
        val animator = ValueAnimator.ofFloat(0f, (frames.size - 1).toFloat())
        animator.duration = duration.toLong()
        animator.interpolator = LinearInterpolator()
        animator.addUpdateListener {
            val cursor = it.animatedValue as Float
            val first = cursor.toInt().coerceAtMost(frames.lastIndex - 1)
            val fraction = cursor - first
            val pose = FloatArray(4) { j -> frames[first][j] * (1 - fraction) + frames[first + 1][j] * fraction }
            if (width > 0 && height > 0) {
                tabPose = pose
                tabCount = count
                alpha = pose[3]
                invalidate()
            }
        }
        tabAnimation = animator
        animator.start()
        if (startedAt > 0) animator.currentPlayTime = (System.currentTimeMillis() - startedAt).coerceIn(0L, duration.toLong())
    }

    override fun onPreDraw(): Boolean = if (tabLens) true else super.onPreDraw()

    override fun draw(canvas: Canvas) {
        if (!tabLens) {
            super.draw(canvas)
            return
        }
        if (Build.VERSION.SDK_INT < 33 || alpha <= 0f || width <= 0 || height <= 0) return
        val pose = tabPose ?: return
        val source = tabSource?.invoke() ?: return
        val effect = tabGlass ?: TabGlassRefraction().also { tabGlass = it }
        effect.draw(canvas, source, width, height, resources.displayMetrics.density, tabCount, pose, lightIntensity)
    }

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
        if (tabLens) return
        if (!glassEnabled || width <= 0 || height <= 0) {
            setRenderEffect(null)
            return
        }
        val effect = glass ?: GlassRefraction().also { glass = it }
        setRenderEffect(effect.effect(width, height, resources.displayMetrics.density, lightIntensity))
    }

    fun disposeCallbacks() {
        callbacks.dispose()
        tabAnimation?.cancel()
        tabAnimation = null
        tabGlass?.dispose()
        tabGlass = null
        tabPose = null
        tabSource = null
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
