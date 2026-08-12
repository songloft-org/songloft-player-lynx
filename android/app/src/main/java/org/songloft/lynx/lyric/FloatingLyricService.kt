package org.songloft.lynx.lyric

import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
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

    fun updateText(line: String) {
        textView?.text = line
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
