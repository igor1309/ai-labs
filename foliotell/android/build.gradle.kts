// AGP and the Android/Compose Kotlin plugins are referenced only in
// app/build.gradle.kts: they resolve from Google Maven, which is not
// reachable from every dev sandbox, and keeping them out of the root
// classpath lets `./gradlew :core:test --configure-on-demand` run the
// pure-JVM core with Maven Central access alone.
plugins {
    alias(libs.plugins.kotlin.jvm) apply false
}
