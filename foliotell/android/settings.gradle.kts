pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "foliotell-android"

include(":core")

// There is no root build script and each module declares its own plugins:
// a root `apply false` block would either put AGP on the root classpath
// (unresolvable in sandboxes limited to Maven Central) or put the Kotlin
// plugin classes on the parent classpath, which breaks :app's versioned
// `org.jetbrains.kotlin.android` request.
//
// The app module needs Google Maven (AGP, androidx), which restricted dev
// sandboxes cannot reach (only Maven Central). `-PskipAndroidApp=true` keeps
// the pure-JVM :core buildable and testable there; CI always builds both.
if (providers.gradleProperty("skipAndroidApp").orNull != "true") {
    include(":app")
}
