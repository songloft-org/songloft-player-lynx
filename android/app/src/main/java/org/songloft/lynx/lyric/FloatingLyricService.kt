package org.songloft.lynx.lyric

import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView

/**
 * A foreground-less service that manages a floating overlay window showing the
 * current lyric line. The overlay uses SYSTEM_ALERT_WINDOW (TYPE_APPLICATION_OVERLAY).
 */
class FloatingLyricService : Service() {

    private var windowManager: WindowManager? = null
    private var textView: TextView? = null
    private var showing = false

    /** `show`/`hide` arrive via `onStartCommand` (already main), `updateText` does not. */
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        FloatingLyricModule.setService(this)
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "SHOW" -> showOverlay()
            "HIDE" -> hideOverlay()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        hideOverlay()
        FloatingLyricModule.setService(null)
        super.onDestroy()
    }

    /**
     * Set the overlay's text, from any thread.
     *
     * `updateLyric` arrives on the Lynx JS thread, and only the thread that created
     * a view may touch it — `setText` on an attached view calls `requestLayout`,
     * which throws `CalledFromWrongThreadException`. That exception was invisible:
     * `FloatingLyricModule.updateLyric` wraps the call in `catch (_: Exception) {}`,
     * so every lyric line was discarded in silence while the overlay sat there
     * showing nothing. Measured before this hop: the window stayed at its
     * empty-text height (`Requested h=46`, `mLayoutSeq` unchanged) no matter what
     * was sent.
     */
    fun updateText(line: String) {
        mainHandler.post { textView?.text = line }
    }

    fun isShowing(): Boolean = showing

    private fun showOverlay() {
        if (showing) return

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = 200
        }

        textView = TextView(this).apply {
            text = ""
            textSize = 16f
            setTextColor(Color.WHITE)
            setShadowLayer(4f, 0f, 0f, Color.BLACK)
            gravity = Gravity.CENTER
            setPadding(24, 12, 24, 12)
            // The overlay floats over whatever app is in front, so the text has no
            // background it can rely on. White-on-shadow alone is barely legible on
            // a light one — measured on Songloft's own (white) home page, where the
            // line was technically drawn and practically invisible.
            setBackgroundColor(Color.argb(140, 0, 0, 0))
        }

        windowManager?.addView(textView, params)
        showing = true
    }

    private fun hideOverlay() {
        if (!showing) return
        textView?.let { windowManager?.removeView(it) }
        textView = null
        showing = false
        stopSelf()
    }
}
