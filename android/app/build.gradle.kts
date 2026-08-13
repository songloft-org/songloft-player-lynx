import java.io.FileInputStream
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
}

// Read key.properties (local dev); CI passes env vars instead.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "org.songloft.lynx"
    compileSdk = 34

    defaultConfig {
        applicationId = "org.songloft.lynx"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0-dev"
    }

    signingConfigs {
        create("release") {
            val storeFilePath = System.getenv("ANDROID_KEYSTORE_PATH")
                ?: keystoreProperties.getProperty("storeFile")
            val storePass = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                ?: keystoreProperties.getProperty("storePassword")
            val keyAliasVal = System.getenv("ANDROID_KEY_ALIAS")
                ?: keystoreProperties.getProperty("keyAlias")
            val keyPass = System.getenv("ANDROID_KEY_PASSWORD")
                ?: keystoreProperties.getProperty("keyPassword")

            if (storeFilePath != null) {
                storeFile = file(storeFilePath)
                storePassword = storePass
                keyAlias = keyAliasVal
                keyPassword = keyPass
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            val releaseConfig = signingConfigs.findByName("release")
            signingConfig = if (releaseConfig?.storeFile != null) releaseConfig
                else signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)

    // ---- Lynx SDK (coordinates + versions copied verbatim from the official
    // integrating-lynx-demo-projects KotlinEmptyProject @ 3.8.0) ----
    // Upgraded to 4.0.0 to get `<webview>` element support (xelement-webview).
    implementation("org.lynxsdk.lynx:lynx:4.0.0")
    implementation("org.lynxsdk.lynx:lynx-jssdk:4.0.0")
    implementation("org.lynxsdk.lynx:lynx-trace:4.0.0")
    implementation("org.lynxsdk.lynx:primjs:4.0.0")

    // image-service (backs `<image>` cover art)
    implementation("org.lynxsdk.lynx:lynx-service-image:4.0.0")
    // Fresco backs the image-service; required for images to load.
    implementation("com.facebook.fresco:fresco:2.3.0")
    implementation("com.facebook.fresco:animated-gif:2.3.0")
    implementation("com.facebook.fresco:animated-webp:2.3.0")
    implementation("com.facebook.fresco:webpsupport:2.3.0")
    implementation("com.facebook.fresco:animated-base:2.3.0")

    // log-service
    implementation("org.lynxsdk.lynx:lynx-service-log:4.0.0")

    // http-service (backs the bare global `fetch` the network layer uses)
    implementation("org.lynxsdk.lynx:lynx-service-http:4.0.0")
    implementation("com.squareup.okhttp3:okhttp:4.9.0")

    // devtool-service (Lynx Inspector Protocol for e2e testing via WebSocket)
    implementation("org.lynxsdk.lynx:lynx-service-devtool:4.0.0")
    implementation("org.lynxsdk.lynx:debug-router:0.0.20")

    // XElement family — needed by elements this app renders: `<svg>` (icons),
    // `<input>` (login / server settings), overlay (Sheet), refresh,
    // `<webview>` (plugin pages).
    implementation("org.lynxsdk.lynx:xelement:4.0.0")
    implementation("org.lynxsdk.lynx:xelement-input:4.0.0")
    implementation("org.lynxsdk.lynx:xelement-overlay:4.0.0")
    implementation("org.lynxsdk.lynx:xelement-svg:4.0.0")
    implementation("org.lynxsdk.lynx:servalsvg:0.1.1")
    implementation("org.lynxsdk.lynx:xelement-refresh:4.0.0")
    implementation("org.lynxsdk.lynx:xelement-webview:4.0.0")

    // `<refresh>` hard requirement, NOT declared by xelement-refresh.
    // xelement-refresh embeds SmartRefreshLayout, whose SmartUtil.isContentView()
    // resolves androidx.viewpager2.widget.ViewPager2 to pick the scrollable child.
    // Without viewpager2 on the classpath that lookup throws NoClassDefFoundError
    // from SmartRefreshLayout.onAttachedToWindow — i.e. every `<refresh>` element
    // dies on attach (LynxError 990200), taking its subtree's gestures with it.
    // This is the real root cause behind what batches 20 and 25 misdiagnosed as
    // "<refresh> swallows horizontal gestures" / "SmartRefreshLayout 3.0.0-alpha
    // nested-scroll regression": the container never finished attaching at all.
    implementation("androidx.viewpager2:viewpager2:1.0.0")

    // ---- Native audio (SongloftAudio native module, batch B2) ----
    // androidx.media3 (ExoPlayer). 1.3.1 is a proven stable release compatible
    // with compileSdk 34 / minSdk 24. HLS support via media3-exoplayer-hls;
    // system media session / notification via media3-session.
    implementation("androidx.media3:media3-exoplayer:1.3.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.3.1")
    implementation("androidx.media3:media3-session:1.3.1")
}
