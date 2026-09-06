package org.songloft.lynx.platform

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Process-wide client log file — the native-side sibling of the TS
 * `client-logger` (`src/core/logging/client-logger.ts`). Both write the same
 * `filesDir/logs/songloft_<yyyy-MM-dd>.log` file, so an exported log bundle
 * carries native diagnostics (ExoPlayer / MediaSession / service lifecycle)
 * right next to the JS ones. Before this object existed, every Kotlin code
 * path logged nowhere but logcat — invisible to "export logs", which is what
 * made the notification-lyric bug impossible to diagnose from an export.
 *
 * Line shapes:
 * - [writeRaw] appends verbatim — used by `SongloftPlatformModule.logWrite`,
 *   whose lines are already formatted (timestamp + redaction) by the TS layer.
 * - [write] stamps `[HH:mm:ss.SSS] L/tag ` in the same shape the TS layer
 *   uses (`formatLogEntry`), so the file reads as one continuous timeline.
 *
 * File lifecycle (per-day name, 3-day sweep, 20 MB per-session cap) moved here
 * verbatim from [SongloftPlatformModule], which now delegates its `logWrite` /
 * `logRead` JS methods.
 */
object ClientFileLog {
    private val executor = Executors.newSingleThreadExecutor()
    private var appContext: Context? = null
    private var logFile: File? = null
    private var sessionBytes = 0L
    private var capReached = false
    private val timeFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

    /** Idempotent; call from any holder of a context (modules, the service). */
    fun init(context: Context) {
        if (appContext != null) return
        appContext = context.applicationContext
    }

    /**
     * Append one already-formatted line. Fire-and-forget; the TS `logWrite`
     * path lands here (it owns timestamps and token redaction).
     */
    fun writeRaw(line: String) {
        append(line)
    }

    /**
     * Append one line, prefixed `[HH:mm:ss.SSS] L/tag ` to match the TS
     * layer's entry shape. Fire-and-forget, thread-safe (single executor),
     * never throws into the caller.
     */
    fun write(level: Char, tag: String, message: String) {
        append("[${timeFormat.format(Date())}] $level/$tag $message")
    }

    /**
     * Read the current log file on the log thread. `onResult` receives
     * `(error, content)`: error is non-null on failure, content is null when
     * no file exists yet. The callback runs on the log thread — post it
     * wherever the result is consumed.
     */
    fun read(onResult: (String?, String?) -> Unit) {
        val ctx = appContext
        if (ctx == null) {
            onResult("not initialized", null)
            return
        }
        executor.execute {
            try {
                val file = ensureLogFile(ctx)
                val content = if (file != null && file.exists()) file.readText() else null
                onResult(null, content)
            } catch (e: Throwable) {
                onResult(e.message ?: "read_failed", null)
            }
        }
    }

    /**
     * Copy the current log file to [dest], then report how many bytes landed
     * (0 = nothing to copy). Runs on the log thread **on purpose**: every line
     * queued before this call is already written by the time the copy starts,
     * which is the same ordering guarantee [read] gives — an export must not
     * miss the lines the user just produced while reproducing the bug.
     *
     * Streamed, not read into memory: the file is capped at 20 MB and this used
     * to reach JS as one `String` across the bridge, which is half of why the
     * export felt slow. `onResult` runs on the log thread; post it wherever it
     * is consumed.
     */
    fun copyTo(dest: File, onResult: (Long) -> Unit) {
        val ctx = appContext
        if (ctx == null) {
            onResult(0L)
            return
        }
        executor.execute {
            var copied = 0L
            try {
                val file = ensureLogFile(ctx)
                if (file != null && file.exists()) {
                    file.inputStream().use { input ->
                        dest.outputStream().use { output ->
                            copied = input.copyTo(output)
                        }
                    }
                }
            } catch (_: Throwable) {
                // A half-written copy must not reach the archive as if it were
                // the whole log.
                try { dest.delete() } catch (_: Throwable) {}
                copied = 0L
            }
            onResult(copied)
        }
    }

    private fun append(line: String) {
        val ctx = appContext
        if (ctx == null) {
            // No context yet (a native write before any module/service init):
            // the file is unreachable, so the line is lost — say so in logcat.
            Log.w("ClientFileLog", "dropped (not initialized): $line")
            return
        }
        executor.execute {
            try {
                if (capReached) return@execute
                val file = ensureLogFile(ctx) ?: return@execute
                val bytes = line.toByteArray(Charsets.UTF_8)
                if (sessionBytes + bytes.size + 1 > LOG_MAX_SESSION_BYTES) {
                    capReached = true
                    file.appendText(
                        "[ClientFileLog] session log cap reached "
                            + "(${LOG_MAX_SESSION_BYTES / (1024 * 1024)}MB); further lines go to logcat only\n"
                    )
                    return@execute
                }
                file.appendText(line + "\n")
                sessionBytes += bytes.size + 1
            } catch (_: Throwable) {
                // Logging must never crash the code path being logged.
            }
        }
    }

    /** Lazily create today's log file and sweep files older than 3 days. */
    private fun ensureLogFile(ctx: Context): File? {
        logFile?.let { return it }
        return try {
            val dir = File(ctx.filesDir, LOG_DIR)
            if (!dir.exists()) dir.mkdirs()
            cleanOldLogs(dir)
            val file = File(dir, "songloft_${LOG_DATE_FORMAT.format(Date())}.log")
            logFile = file
            file
        } catch (_: Throwable) {
            null
        }
    }

    private fun cleanOldLogs(dir: File) {
        try {
            val cutoff = System.currentTimeMillis() - LOG_MAX_AGE_DAYS * 24L * 60L * 60L * 1000L
            dir.listFiles()?.forEach { file ->
                val match = LOG_NAME_PATTERN.matchEntire(file.name) ?: return@forEach
                val date = try {
                    LOG_DATE_FORMAT.parse(match.groupValues[1])
                } catch (_: Throwable) {
                    null
                }
                if (date != null && date.time < cutoff) file.delete()
            }
        } catch (_: Throwable) {
            // Cleanup is best-effort; never block logging on it.
        }
    }

    private const val LOG_DIR = "logs"
    private const val LOG_MAX_SESSION_BYTES = 20L * 1024L * 1024L
    private const val LOG_MAX_AGE_DAYS = 3L

    // Same file-name shape as Flutter's `_logNamePattern`, so cleanup only
    // ever touches files this feature wrote.
    private val LOG_NAME_PATTERN =
        Regex("^songloft_(\\d{4}-\\d{2}-\\d{2})(?:_[A-Za-z0-9]+)?\\.log$")
    private val LOG_DATE_FORMAT = SimpleDateFormat("yyyy-MM-dd", Locale.US)
}
