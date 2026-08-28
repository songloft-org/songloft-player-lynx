package org.songloft.lynx.lyric

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

/**
 * A foreground-less service that manages a floating overlay window showing the
 * current lyric line and — two-line mode, the default — the next one beneath
 * it, the shape every desktop-style lyric overlay uses (current line prominent,
 * next line smaller and dimmer). The overlay uses SYSTEM_ALERT_WINDOW
 * (TYPE_APPLICATION_OVERLAY).
 *
 * The lyric window is draggable when unlocked: touch events set the
 * WindowManager LayoutParams x/y as the user drags. Position is persisted to
 * SharedPreferences so a re-show or app restart lands where the user last
 * placed it. Dragging is disabled while [setLocked] is on (matches the pattern
 * of every desktop-style lyric overlay: lock = pass-through, transparent to
 * clicks; unlocked = grab handle).
 */
class FloatingLyricService : Service() {

    private var windowManager: WindowManager? = null
    private var container: LinearLayout? = null
    private var currentView: TextView? = null
    private var nextView: TextView? = null
    private var showing = false
    private var locked = false
    private var twoLine = true

    /** Last pushed text, kept so [setTwoLine] can re-render immediately. */
    private var lastLine: String = ""
    private var lastNextLine: String = ""

    /** `show`/`hide` arrive via `onStartCommand` (already main), `updateText` does not. */
    private val mainHandler = Handler(Looper.getMainLooper())

    /** Persisted position (offset from the anchor gravity below). */
    private var savedX: Int = 0
    private var savedY: Int = 200

    private lateinit var prefs: SharedPreferences

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        FloatingLyricModule.setService(this)
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        savedX = prefs.getInt(KEY_X, 0)
        savedY = prefs.getInt(KEY_Y, 200)
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
    fun updateText(line: String, nextLine: String) {
        lastLine = line
        lastNextLine = nextLine
        mainHandler.post { render() }
    }

    /** Applies the cached text; must run on the main thread (view mutation). */
    private fun render() {
        currentView?.text = lastLine
        nextView?.let { view ->
            view.text = lastNextLine
            // GONE (not INVISIBLE) so the WRAP_CONTENT window shrinks back to the
            // single-line height when there is no next line or two-line mode is off.
            view.visibility =
                if (twoLine && lastNextLine.isNotEmpty()) View.VISIBLE else View.GONE
        }
    }

    /** Two-line mode (current + next line) on/off; re-renders from the cache. */
    fun setTwoLine(two: Boolean) {
        twoLine = two
        mainHandler.post { render() }
    }

    fun isShowing(): Boolean = showing

    fun setFontSize(size: String) {
        mainHandler.post {
            // The next-line preview runs ~0.75x the primary size (11/12/15 for 14/16/20).
            val sizes = when (size) {
                "small" -> 14f to 11f
                "large" -> 20f to 15f
                else -> 16f to 12f
            }
            currentView?.textSize = sizes.first
            nextView?.textSize = sizes.second
        }
    }

    fun setLocked(locked: Boolean) {
        mainHandler.post {
            this.locked = locked
            container?.let { view ->
                val wm = windowManager ?: return@post
                val params = view.layoutParams as WindowManager.LayoutParams
                if (locked) {
                    // Locked: window ignores touches entirely — clicks pass
                    // through to whatever is behind the overlay, and the user
                    // cannot accidentally drag it.
                    params.flags = params.flags or
                        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                } else {
                    // Unlocked: the window accepts touches so it can be dragged.
                    // FLAG_NOT_FOCUSABLE stays on so the app underneath keeps
                    // input focus (typing continues to work while lyrics show).
                    params.flags = (params.flags and
                        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()) or
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                }
                wm.updateViewLayout(view, params)
            }
        }
    }

    fun setOpacity(opacity: Float) {
        mainHandler.post {
            val alpha = (opacity * 255).toInt().coerceIn(0, 255)
            container?.setBackgroundColor(Color.argb(alpha, 0, 0, 0))
        }
    }

    @SuppressLint("ClickableViewAccessibility")
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
            // Default (unlocked): touchable so drag works, not focusable so the
            // app underneath keeps input focus.
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            x = savedX
            y = savedY
        }

        val currentLine = TextView(this).apply {
            text = ""
            textSize = 16f
            setTextColor(Color.WHITE)
            setShadowLayer(4f, 0f, 0f, Color.BLACK)
            gravity = Gravity.CENTER
        }
        val nextLine = TextView(this).apply {
            text = ""
            textSize = 12f
            // Dimmer than the current line: it is a preview, not the active lyric.
            setTextColor(Color.argb(179, 255, 255, 255))
            setShadowLayer(3f, 0f, 0f, Color.BLACK)
            gravity = Gravity.CENTER
        }
        val view = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(24, 12, 24, 12)
            // The overlay floats over whatever app is in front, so the text has no
            // background it can rely on. White-on-shadow alone is barely legible on
            // a light one — measured on Songloft's own (white) home page, where the
            // line was technically drawn and practically invisible.
            setBackgroundColor(Color.argb(140, 0, 0, 0))
            addView(currentLine)
            addView(
                nextLine,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = (resources.displayMetrics.density * 4).toInt() },
            )
        }
        attachDragHandler(view, params)

        container = view
        currentView = currentLine
        nextView = nextLine
        windowManager?.addView(view, params)
        showing = true
    }

    /**
     * Drag: on ACTION_DOWN capture the starting finger position + current
     * window origin; on ACTION_MOVE update `params.x/y` by the delta and
     * `updateViewLayout` to reposition without recreating the window; on
     * ACTION_UP persist the final position.
     *
     * Small movements are treated as a click / no-op so a light tap on the
     * overlay does not nudge it. `[MotionEvent.getRawX]`/`getRawY` is required
     * — `getX`/`getY` are inside-view coordinates and would jitter when the
     * view moves under the finger.
     */
    @SuppressLint("ClickableViewAccessibility")
    private fun attachDragHandler(view: View, params: WindowManager.LayoutParams) {
        var downRawX = 0f
        var downRawY = 0f
        var initialX = 0
        var initialY = 0
        val slop = view.resources.displayMetrics.density * 6f  // ~6dp slop
        var dragging = false

        view.setOnTouchListener { _, event ->
            if (locked) return@setOnTouchListener false
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    downRawX = event.rawX
                    downRawY = event.rawY
                    initialX = params.x
                    initialY = params.y
                    dragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - downRawX
                    val dy = event.rawY - downRawY
                    if (!dragging && (kotlin.math.abs(dx) > slop || kotlin.math.abs(dy) > slop)) {
                        dragging = true
                    }
                    if (dragging) {
                        params.x = initialX + dx.toInt()
                        params.y = initialY + dy.toInt()
                        try {
                            windowManager?.updateViewLayout(view, params)
                        } catch (_: Throwable) {
                            // View may have been removed mid-drag.
                        }
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (dragging) {
                        savedX = params.x
                        savedY = params.y
                        prefs.edit()
                            .putInt(KEY_X, savedX)
                            .putInt(KEY_Y, savedY)
                            .apply()
                    }
                    dragging
                }
                else -> false
            }
        }
    }

    private fun hideOverlay() {
        if (!showing) return
        container?.let {
            try {
                windowManager?.removeView(it)
            } catch (_: Throwable) {
            }
        }
        container = null
        currentView = null
        nextView = null
        showing = false
        stopSelf()
    }

    companion object {
        private const val PREFS = "songloft.floating_lyric"
        private const val KEY_X = "x"
        private const val KEY_Y = "y"
    }
}
