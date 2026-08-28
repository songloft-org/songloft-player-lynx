package org.songloft.lynx.lyric

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings

/**
 * The `SYSTEM_ALERT_WINDOW` grant, bridged to a callback.
 *
 * `Settings.ACTION_MANAGE_OVERLAY_PERMISSION` is a **system screen with no
 * result**: it cannot be started for result, it reports nothing back, and the
 * grant it produces is only observable once the app returns to the foreground.
 * The first implementation answered `false` right after `startActivity`, i.e. it
 * told JS "denied" for every grant the user was *about to* make — the settings
 * toggle stayed on with no overlay behind it, and only a second off/on
 * round-trip (which finds the grant already in place) ever brought the lyrics
 * up. Real-device report, and invisible to every gate in the repo because every
 * call on this path resolves successfully either way.
 *
 * So a request parks its waiter here and [onAppForegrounded] — wired from
 * `MainActivity.onResume`, the only moment the return trip is observable —
 * answers it. The grant is re-read a few times because some ROMs flip
 * `canDrawOverlays` a beat after the resume rather than before it.
 *
 * Waiters are added from the Lynx JS thread and answered on the main thread, so
 * the list is guarded; [answer] drains it, which also keeps each bridge
 * `Callback` invoked exactly once (invoking one twice throws).
 */
object OverlayPermission {

    /** How many times the grant is re-read after the user returns, and how far apart. */
    private const val RECHECK_ATTEMPTS = 4
    private const val RECHECK_DELAY_MS = 250L

    private val handler = Handler(Looper.getMainLooper())
    private val waiters = mutableListOf<(Boolean) -> Unit>()

    /** Pre-M grants the permission at install time; there is nothing to ask for. */
    fun isGranted(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx)

    /**
     * Grant already in place → [onResult] runs immediately, on the caller's
     * thread. Otherwise the system screen opens and [onResult] runs when the
     * user comes back, with whatever the grant is *then*. A screen that cannot
     * be opened is answered right away rather than parking a waiter nothing will
     * ever resume.
     */
    fun request(ctx: Context, onResult: (Boolean) -> Unit) {
        if (isGranted(ctx)) {
            onResult(true)
            return
        }
        synchronized(waiters) { waiters.add(onResult) }
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${ctx.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            ctx.startActivity(intent)
        } catch (_: Exception) {
            answer(false)
        }
    }

    /** Wired from `MainActivity.onResume` — the return trip from the system screen. */
    fun onAppForegrounded(ctx: Context) {
        if (!hasWaiters()) return
        recheck(ctx.applicationContext, RECHECK_ATTEMPTS)
    }

    private fun recheck(ctx: Context, attemptsLeft: Int) {
        if (!hasWaiters()) return
        if (isGranted(ctx)) {
            answer(true)
            return
        }
        if (attemptsLeft <= 1) {
            answer(false)
            return
        }
        handler.postDelayed({ recheck(ctx, attemptsLeft - 1) }, RECHECK_DELAY_MS)
    }

    private fun hasWaiters(): Boolean = synchronized(waiters) { waiters.isNotEmpty() }

    private fun answer(granted: Boolean) {
        val pending = synchronized(waiters) { waiters.toList().also { waiters.clear() } }
        for (waiter in pending) waiter(granted)
    }
}
