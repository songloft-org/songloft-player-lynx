package org.songloft.lynx.ui

import android.content.Context
import com.lynx.tasm.behavior.LynxContext
import com.lynx.xelement.blur.BlurView
import com.lynx.xelement.blur.LynxUIBlurView

/** Lynx 4.0.0 posts capture updates that can outlive BlurView.destroy(). */
class SongloftBlurUI(context: LynxContext) : LynxUIBlurView<LifecycleBlurView>(context) {
    override fun createBlurView(context: Context): LifecycleBlurView = LifecycleBlurView(context)

    override fun destroy() {
        (view as? LifecycleBlurView)?.disposeCallbacks()
        super.destroy()
    }
}

class LifecycleBlurView(context: Context) : BlurView(context) {
    private val callbacks = BlurCallbackLifetime()

    override fun post(action: Runnable): Boolean = super.post(callbacks.wrap(action))

    fun disposeCallbacks() = callbacks.dispose()
}

/** Check at execution time, including callbacks already in the Android queue. */
internal class BlurCallbackLifetime {
    @Volatile private var disposed = false

    fun wrap(action: Runnable): Runnable = Runnable { if (!disposed) action.run() }

    fun dispose() { disposed = true }
}
