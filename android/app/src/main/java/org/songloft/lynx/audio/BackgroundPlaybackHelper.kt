package org.songloft.lynx.audio

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import org.songloft.lynx.platform.ClientFileLog

/**
 * Utilities for surviving aggressive battery management on Android,
 * particularly Chinese ROM variants (MIUI, EMUI, ColorOS, FuntouchOS).
 *
 * Two mechanisms:
 * 1. **Battery optimization exemption** — standard Android API, asks the OS
 *    to stop optimizing (killing) this app's background processes.
 * 2. **Manufacturer whitelist guidance** — detects the device manufacturer
 *    and provides the Intent to open the vendor-specific autostart / battery
 *    management settings page. These are not stable APIs and may break across
 *    ROM versions; each Intent is wrapped in a try-catch with fallback.
 */
object BackgroundPlaybackHelper {

    /** In-memory flag to avoid showing the system dialog more than once per session. */
    @Volatile
    private var hasPromptedBatteryOptimization = false

    /**
     * Request battery optimization exemption if not already granted and not
     * already prompted this session. Called automatically from
     * [SongloftAudioModule.play] so the dialog appears on first playback
     * without any JS-side integration.
     */
    fun maybeRequestBatteryOptimizationExemption(context: Context) {
        if (hasPromptedBatteryOptimization) return
        if (isIgnoringBatteryOptimizations(context)) return
        hasPromptedBatteryOptimization = true
        try {
            val intent = buildBatteryOptimizationIntent(context)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            ClientFileLog.write('I', "audio-keepalive", "auto-requested battery optimization exemption")
        } catch (e: Throwable) {
            ClientFileLog.write(
                'W', "audio-keepalive",
                "auto-request battery optimization failed: ${e.javaClass.simpleName}: ${e.message}",
            )
        }
    }

    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    @SuppressLint("BatteryLife")
    fun buildBatteryOptimizationIntent(context: Context): Intent {
        return Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
    }

    /**
     * Launch the system battery optimization exemption dialog.
     * Returns `true` if already exempt, `false` if the dialog was shown (or attempted).
     */
    @SuppressLint("BatteryLife")
    fun requestBatteryOptimizationExemption(context: Context): Boolean {
        if (isIgnoringBatteryOptimizations(context)) {
            ClientFileLog.write('I', "audio-keepalive", "already ignoring battery optimizations")
            return true
        }
        try {
            val intent = buildBatteryOptimizationIntent(context)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            ClientFileLog.write('I', "audio-keepalive", "battery optimization exemption dialog launched")
        } catch (e: Throwable) {
            ClientFileLog.write(
                'W', "audio-keepalive",
                "failed to launch battery optimization dialog: ${e.javaClass.simpleName}: ${e.message}",
            )
        }
        return false
    }

    data class ManufacturerWhitelistInfo(
        val manufacturer: String,
        val instructions: String,
    )

    fun getManufacturerWhitelistInfo(): ManufacturerWhitelistInfo? {
        val manufacturer = Build.MANUFACTURER.lowercase()
        return when {
            manufacturer.contains("xiaomi") || manufacturer.contains("redmi") ->
                ManufacturerWhitelistInfo(
                    manufacturer = "xiaomi",
                    instructions = "请前往「设置 → 应用设置 → 应用管理」找到本应用，" +
                        "开启「自启动」，并在「省电策略」中选择「无限制」",
                )
            manufacturer.contains("huawei") || manufacturer.contains("honor") ->
                ManufacturerWhitelistInfo(
                    manufacturer = "huawei",
                    instructions = "请前往「设置 → 应用和服务 → 应用启动管理」，" +
                        "关闭本应用的「自动管理」，手动开启「自启动」「关联启动」「后台活动」",
                )
            manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus") ->
                ManufacturerWhitelistInfo(
                    manufacturer = "oppo",
                    instructions = "请前往「设置 → 电池 → 更多电池设置」，" +
                        "关闭「睡眠待机优化」，并在应用耗电管理中允许本应用后台运行",
                )
            manufacturer.contains("vivo") ->
                ManufacturerWhitelistInfo(
                    manufacturer = "vivo",
                    instructions = "请前往「设置 → 电池 → 后台高耗电」中允许本应用后台运行，" +
                        "并在「i管家 → 应用管理 → 自启动管理」中开启自启动",
                )
            manufacturer.contains("samsung") ->
                ManufacturerWhitelistInfo(
                    manufacturer = "samsung",
                    instructions = "请前往「设置 → 电池 → 后台使用限制」中将本应用设为「不受限制」",
                )
            manufacturer.contains("meizu") ->
                ManufacturerWhitelistInfo(
                    manufacturer = "meizu",
                    instructions = "请前往「设置 → 电量和性能 → 后台管理」中允许本应用后台运行",
                )
            else -> null
        }
    }

    private val manufacturerIntents: List<Pair<String, List<Intent>>> = listOf(
        "xiaomi" to listOf(
            Intent().setComponent(
                ComponentName(
                    "com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity",
                ),
            ),
            Intent().setComponent(
                ComponentName(
                    "com.miui.powerkeeper",
                    "com.miui.powerkeeper.ui.HiddenAppsConfigActivity",
                ),
            ),
        ),
        "huawei" to listOf(
            Intent().setComponent(
                ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
                ),
            ),
            Intent().setComponent(
                ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.optimize.process.ProtectActivity",
                ),
            ),
        ),
        "oppo" to listOf(
            Intent().setComponent(
                ComponentName(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.startupapp.StartupAppListActivity",
                ),
            ),
            Intent().setComponent(
                ComponentName(
                    "com.oplus.safecenter",
                    "com.oplus.safecenter.startupapp.StartupAppListActivity",
                ),
            ),
        ),
        "vivo" to listOf(
            Intent().setComponent(
                ComponentName(
                    "com.iqoo.secure",
                    "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
                ),
            ),
            Intent().setComponent(
                ComponentName(
                    "com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
                ),
            ),
        ),
        "samsung" to listOf(
            Intent().setComponent(
                ComponentName(
                    "com.samsung.android.lool",
                    "com.samsung.android.sm.battery.ui.BatteryActivity",
                ),
            ),
        ),
        "meizu" to listOf(
            Intent().setComponent(
                ComponentName(
                    "com.meizu.safe",
                    "com.meizu.safe.permission.SmartBGActivity",
                ),
            ),
        ),
    )

    /**
     * Open the manufacturer-specific autostart / battery management settings.
     * Falls back to the generic app details page if no vendor intent resolves.
     * Returns `true` if any intent was successfully launched.
     */
    fun openManufacturerWhitelist(context: Context): Boolean {
        val manufacturer = Build.MANUFACTURER.lowercase()
        for ((key, intents) in manufacturerIntents) {
            if (!manufacturer.contains(key)) continue
            for (intent in intents) {
                try {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    ClientFileLog.write(
                        'I', "audio-keepalive",
                        "opened manufacturer whitelist: $key -> ${intent.component}",
                    )
                    return true
                } catch (_: Throwable) {
                    // Intent not available on this ROM version, try next.
                }
            }
        }
        // Fallback: generic app detail settings.
        try {
            val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(fallback)
            ClientFileLog.write('I', "audio-keepalive", "opened generic app details (fallback)")
            return true
        } catch (e: Throwable) {
            ClientFileLog.write(
                'W', "audio-keepalive",
                "failed to open any settings: ${e.javaClass.simpleName}: ${e.message}",
            )
            return false
        }
    }
}
