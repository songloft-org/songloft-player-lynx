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
    implementation("org.lynxsdk.lynx:lynx:3.8.0")
    implementation("org.lynxsdk.lynx:lynx-jssdk:3.8.0")
    implementation("org.lynxsdk.lynx:lynx-trace:3.8.0")
    implementation("org.lynxsdk.lynx:primjs:3.8.0")

    // image-service (backs `<image>` cover art)
    implementation("org.lynxsdk.lynx:lynx-service-image:3.8.0")
    // Fresco backs the image-service; required for images to load.
    implementation("com.facebook.fresco:fresco:2.3.0")
    implementation("com.facebook.fresco:animated-gif:2.3.0")
    implementation("com.facebook.fresco:animated-webp:2.3.0")
    implementation("com.facebook.fresco:webpsupport:2.3.0")
    implementation("com.facebook.fresco:animated-base:2.3.0")

    // log-service
    implementation("org.lynxsdk.lynx:lynx-service-log:3.8.0")

    // http-service (backs the bare global `fetch` the network layer uses)
    implementation("org.lynxsdk.lynx:lynx-service-http:3.8.0")
    implementation("com.squareup.okhttp3:okhttp:4.9.0")

    // XElement family — needed by elements this app renders: `<svg>` (icons),
    // `<input>` (login / server settings), overlay (Sheet), refresh.
    implementation("org.lynxsdk.lynx:xelement:3.8.0")
    implementation("org.lynxsdk.lynx:xelement-input:3.8.0")
    implementation("org.lynxsdk.lynx:xelement-overlay:3.8.0")
    implementation("org.lynxsdk.lynx:xelement-svg:3.8.0")
    implementation("org.lynxsdk.lynx:servalsvg:0.0.1-alpha.3")
    implementation("org.lynxsdk.lynx:xelement-refresh:3.8.0")

    // ---- Native audio (SongloftAudio native module, batch B2) ----
    // androidx.media3 (ExoPlayer). 1.3.1 is a proven stable release compatible
    // with compileSdk 34 / minSdk 24. HLS support via media3-exoplayer-hls;
    // system media session / notification via media3-session.
    implementation("androidx.media3:media3-exoplayer:1.3.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.3.1")
    implementation("androidx.media3:media3-session:1.3.1")
}
