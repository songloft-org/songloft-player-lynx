package org.songloft.lynx.video

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.SurfaceView
import android.view.ViewGroup
import android.widget.FrameLayout
import org.songloft.lynx.audio.SongloftAudioEngine

/**
 * Fullscreen surface for the video track of whatever the audio engine is already
 * playing.
 *
 * It owns **no player**. The one [SongloftAudioEngine] instance keeps decoding,
 * keeps its `MediaSession`, keeps its EQ, keeps feeding progress events to JS; all
 * this screen does is lend it somewhere to draw. That is why opening and closing it
 * cannot interrupt playback, and why there is no second `MediaSession` competing for
 * the lock screen.
 *
 * Deliberately just a surface: media3's `PlayerView` would bring its own transport
 * controls, which would fight the JS store for who owns play/pause/seek. The Lynx
 * side already has those controls, and `media3-ui` is not even a dependency.
 */
class SongloftVideoActivity : Activity() {

    private var surface: SurfaceView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SongloftVideoModule.setActivity(this)

        val view = SurfaceView(this)
        surface = view
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(
                view,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    Gravity.CENTER,
                ),
            )
        }
        setContentView(root)
    }

    /**
     * Attach on the way in, detach on the way out — and do it in `onStart`/`onStop`
     * rather than create/destroy so that backgrounding the app hands the surface back
     * while audio keeps playing through the foreground service.
     */
    override fun onStart() {
        super.onStart()
        val view = surface ?: return
        SongloftAudioEngine.runOnMain {
            SongloftAudioEngine.attachVideoOutput(view) { w, h -> applyAspect(w, h) }
        }
    }

    /**
     * Letterbox the surface to the video's own aspect ratio.
     *
     * A `MATCH_PARENT` surface stretches the picture to the device's shape — a 640×360
     * clip on a portrait phone came out unrecognisably tall, which a screenshot makes
     * obvious and no state assertion ever would. media3's `AspectRatioFrameLayout`
     * would do this, but it lives in `media3-ui`, a dependency this app does not have
     * (and does not want: `PlayerView` brings transport controls that would fight the
     * Lynx ones).
     */
    private fun applyAspect(videoWidth: Int, videoHeight: Int) {
        val view = surface ?: return
        val parent = view.parent as? FrameLayout ?: return
        view.post {
            val availableWidth = parent.width
            val availableHeight = parent.height
            if (availableWidth <= 0 || availableHeight <= 0 || videoHeight <= 0) return@post
            val videoRatio = videoWidth.toFloat() / videoHeight
            val parentRatio = availableWidth.toFloat() / availableHeight
            val (w, h) = if (videoRatio > parentRatio) {
                availableWidth to (availableWidth / videoRatio).toInt()
            } else {
                (availableHeight * videoRatio).toInt() to availableHeight
            }
            view.layoutParams = FrameLayout.LayoutParams(w, h, Gravity.CENTER)
        }
    }

    override fun onStop() {
        super.onStop()
        // Skipping this would leave ExoPlayer drawing into a dead window: logcat
        // fills with `Surface … abandoned` and the next audio-only track dies inside
        // the video renderer, with nothing on screen to explain it.
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.detachVideoOutput() }
    }

    override fun onDestroy() {
        SongloftVideoModule.setActivity(null)
        surface = null
        super.onDestroy()
    }
}
