package org.songloft.lynx.navigation

import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * The host's cached answer to "does JS want the next back press?".
 *
 * `Activity.onBackPressed()` has to decide **synchronously**, and Lynx offers no
 * synchronous call into JS (nor may native block on a Promise). So JS mirrors a
 * single boolean here whenever its own state changes — see
 * `src/core/navigation/back-controller.ts` — and the Activity reads this object.
 *
 * That inversion also makes exiting robust. JS deliberately lowers `consumable`
 * while "press back again to exit" is armed, so the *second* press is executed by
 * the Activity with no round trip: nothing for a fast double tap to race, and a
 * wedged JS thread at a tab root can still be dismissed.
 *
 * Process-level (`object`), not per-Activity: the flag has to outlive the
 * `LynxModule` instance that writes it.
 */
object BackKeyState {

    /**
     * How many presses may go unanswered before the host stops trusting the flag.
     *
     * The watchdog covers the one case the flag cannot: JS wedged while
     * `consumable` is true (an overlay open, or on a sub-page), which would
     * otherwise make the back key dead for the rest of the session. Counting
     * presses rather than running a timer is deliberate — a timeout would exit the
     * app out from under a merely *slow* JS thread.
     */
    const val MAX_UNANSWERED = 3

    private val consumable = AtomicBoolean(false)
    private val seq = AtomicInteger(0)
    private val unanswered = AtomicInteger(0)

    @Volatile
    private var lastAckedSeq = 0

    /**
     * Mirror from JS. Any call also clears the watchdog: it is proof that JS is
     * running, so a thread that recovers gets its back key back.
     */
    fun setConsumable(value: Boolean) {
        consumable.set(value)
        unanswered.set(0)
    }

    /** JS finished handling the press carrying [handledSeq]. */
    fun ackHandled(handledSeq: Int) {
        lastAckedSeq = handledSeq
        unanswered.set(0)
    }

    /** True to forward the press to JS; false to run the system default. */
    fun shouldForward(): Boolean =
        consumable.get() && unanswered.get() < MAX_UNANSWERED

    /** Record a forwarded press and return the sequence number to send with it. */
    fun noteForwarded(): Int {
        unanswered.incrementAndGet()
        return seq.incrementAndGet()
    }

    /** The last sequence JS acknowledged — for `adb` diagnosis of a stuck key. */
    fun lastAcked(): Int = lastAckedSeq

    /**
     * Back to launch defaults: back exits. Called when the host Activity goes away,
     * because this object survives it and a fresh page must not inherit a stale
     * "JS will handle it" from the previous one.
     */
    fun reset() {
        consumable.set(false)
        unanswered.set(0)
        seq.set(0)
        lastAckedSeq = 0
    }
}
