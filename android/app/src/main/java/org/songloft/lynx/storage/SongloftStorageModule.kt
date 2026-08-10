package org.songloft.lynx.storage

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.tasm.behavior.LynxContext

/**
 * Lynx native module `NativeModules.SongloftStorage` — persistent key/value
 * storage backed by Android **SharedPreferences**. Written exactly in the shape
 * of the official "Native Modules" guide's `NativeLocalStorageModule`
 * (`class … : LynxModule(context)`, `mContext as LynxContext`, `@LynxMethod`,
 * `com.lynx.react.bridge.Callback` for reads).
 *
 * Why it exists: batch-3's on-device storage fell back to an **in-memory** impl
 * (no `localStorage`, no native module), so tokens were dropped when the app was
 * backgrounded (JS reload / Activity recreation) and the user was bounced to
 * `/login`. Persisting to SharedPreferences fixes the re-login: `checkAuth`
 * finds the token again after restart.
 *
 * Two areas map to two prefs files:
 *   - `prefs`  → non-sensitive (server url, language, play mode, …)
 *   - `secure` → tokens. dev build uses a plain (non-encrypted) prefs file; can
 *                be upgraded to EncryptedSharedPreferences later (needs
 *                androidx.security:security-crypto). Plain is fine for dev and
 *                avoids the keyset flakiness EncryptedSharedPreferences hits on
 *                some devices.
 *
 * Registered via `LynxEnv.inst().registerModule("SongloftStorage", …)`; the
 * name + `area`/method names must match the TS binding
 * (`src/core/storage/native-storage.ts`).
 */
class SongloftStorageModule(context: Context) : LynxModule(context) {

    private fun androidContext(): Context = (mContext as LynxContext).getContext()

    private fun prefsFor(area: String) =
        androidContext().getSharedPreferences(
            if (area == AREA_SECURE) FILE_SECURE else FILE_PREFS,
            Context.MODE_PRIVATE,
        )

    @LynxMethod
    fun setItem(area: String, key: String, value: String) {
        prefsFor(area).edit().putString(key, value).apply()
    }

    @LynxMethod
    fun getItem(area: String, key: String, callback: Callback) {
        callback.invoke(prefsFor(area).getString(key, null))
    }

    @LynxMethod
    fun removeItem(area: String, key: String) {
        prefsFor(area).edit().remove(key).apply()
    }

    @LynxMethod
    fun getKeys(area: String, callback: Callback) {
        val keys = JavaOnlyArray()
        for (key in prefsFor(area).all.keys) keys.pushString(key)
        callback.invoke(keys)
    }

    @LynxMethod
    fun getPath(name: String, callback: Callback) {
        val c = androidContext()
        val path = when (name) {
            "cache" -> c.cacheDir.absolutePath
            "documents" -> (c.getExternalFilesDir(null) ?: c.filesDir).absolutePath
            else -> c.filesDir.absolutePath // appData / default
        }
        callback.invoke(path)
    }

    companion object {
        private const val AREA_SECURE = "secure"
        private const val FILE_PREFS = "songloft_prefs"
        private const val FILE_SECURE = "songloft_secure"
    }
}
