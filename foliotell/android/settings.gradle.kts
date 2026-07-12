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

// The app module needs Google Maven (AGP, androidx), which restricted dev
// sandboxes cannot reach (only Maven Central). `-PskipAndroidApp=true` keeps
// the pure-JVM :core buildable and testable there; CI always builds both.
if (providers.gradleProperty("skipAndroidApp").orNull != "true") {
    include(":app")
}
