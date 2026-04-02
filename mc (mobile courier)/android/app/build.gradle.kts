import java.util.Properties
import org.gradle.api.GradleException

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
val hasReleaseKeystore: Boolean =
    keystorePropertiesFile.exists().also { exists ->
        if (exists) {
            keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
        }
    }

android {
    namespace = "com.warehouse.mobile_courier"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.warehouse.mobile_courier"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storePassword = keystoreProperties.getProperty("storePassword")
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile")!!)
            }
        }
    }

    buildTypes {
        release {
            signingConfig =
                if (hasReleaseKeystore) {
                    signingConfigs.getByName("release")
                } else {
                    signingConfigs.getByName("debug")
                }
        }
    }
}

// Google Play rejects AABs signed with the debug key. Require a real upload keystore for bundleRelease.
afterEvaluate {
    tasks.named("bundleRelease").configure {
        doFirst {
            if (!hasReleaseKeystore) {
                throw GradleException(
                    "Release App Bundle needs a upload keystore. Copy android/key.properties.example to " +
                        "android/key.properties, fill it in, and create the .jks file (see comments in the example). " +
                        "https://developer.android.com/studio/publish/app-signing",
                )
            }
        }
    }
}

flutter {
    source = "../.."
}
