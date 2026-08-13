package org.songloft.lynx

import android.app.Application
import com.facebook.drawee.backends.pipeline.Fresco
import com.facebook.imagepipeline.core.ImagePipelineConfig
import com.facebook.imagepipeline.memory.PoolConfig
import com.facebook.imagepipeline.memory.PoolFactory
import com.lynx.service.devtool.LynxDevToolService
import com.lynx.service.http.LynxHttpService
import com.lynx.service.image.LynxImageService
import com.lynx.service.log.LynxLogService
import com.lynx.tasm.LynxEnv
import com.lynx.tasm.service.LynxServiceCenter
import org.songloft.lynx.audio.SongloftAudioModule
import org.songloft.lynx.platform.SongloftPlatformModule
import org.songloft.lynx.storage.SongloftStorageModule
import org.songloft.lynx.test.SongloftTestBridgeModule
import org.songloft.lynx.test.TestBridgeServer

/**
 * Application entry: initialises the Lynx runtime once, before any LynxView is
 * created. Registration order and service set mirror the official
 * `integrating-lynx-demo-projects` KotlinEmptyProject (Lynx SDK 3.8.0), trimmed
 * to the three services this app actually needs:
 *   - image  → `<image>` cover art (backed by Fresco)
 *   - log    → engine logging
 *   - http   → the host HTTP service that backs the bare global `fetch` the
 *              network layer relies on (see AGENTS.md §3; Android 2.18+)
 * DevTool service is included to enable the Lynx Inspector Protocol (WebSocket)
 * for e2e behavior testing via the `e2e/` driver.
 */
class SongloftApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        initLynxService()
        initLynxEnv()
    }

    private fun initLynxService() {
        // Fresco backs LynxImageService; initialise it first.
        val factory = PoolFactory(PoolConfig.newBuilder().build())
        val builder = ImagePipelineConfig.newBuilder(applicationContext).setPoolFactory(factory)
        Fresco.initialize(applicationContext, builder.build())

        LynxServiceCenter.inst().registerService(LynxImageService.getInstance())
        LynxServiceCenter.inst().registerService(LynxLogService)
        LynxServiceCenter.inst().registerService(LynxHttpService)
        LynxServiceCenter.inst().registerService(LynxDevToolService.INSTANCE)
        LynxDevToolService.INSTANCE.devtoolEnvInit(this)
        LynxDevToolService.INSTANCE.lynxDebugPresetValue = true
    }

    private fun initLynxEnv() {
        LynxEnv.inst().init(
            this,
            null,
            null,
            null,
        )
        LynxEnv.inst().enableDevtool(true)
        LynxEnv.inst().enableLynxDebug(true)
        // Register the real native audio backend (ExoPlayer). Exposed to JS as
        // `NativeModules.SongloftAudio`; the name MUST match the TS facade's
        // detection + the interface spec (`docs/lynx_native_modules_spec.md#1`).
        // Pattern copied verbatim from the official Native Modules guide.
        LynxEnv.inst().registerModule("SongloftAudio", SongloftAudioModule::class.java)
        // Persistent key/value storage (SharedPreferences). Exposed as
        // `NativeModules.SongloftStorage`; makes tokens / prefs / language
        // survive app restart so the user is no longer bounced to /login after
        // backgrounding. Name + methods match `src/core/storage/native-storage.ts`.
        LynxEnv.inst().registerModule("SongloftStorage", SongloftStorageModule::class.java)
        LynxEnv.inst().registerModule("SongloftPlatform", SongloftPlatformModule::class.java)
        LynxEnv.inst().registerModule("SongloftTestBridge", SongloftTestBridgeModule::class.java)

        // Start the TCP test bridge server for e2e driver communication
        TestBridgeServer().start()
    }
}
