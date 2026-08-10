plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
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

    buildTypes {
        // debug: signed with the auto-generated debug keystore → installable via
        // side-load without any release signing config. This is the CI artifact.
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
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
}
