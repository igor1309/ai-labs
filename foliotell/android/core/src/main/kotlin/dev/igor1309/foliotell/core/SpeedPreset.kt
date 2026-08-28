package dev.igor1309.foliotell.core

/**
 * Playback speed presets — the single mapping from UI speed choices to the
 * TextToSpeech rate (1.0 is the engine's normal rate).
 */
enum class SpeedPreset(val rate: Float, val label: String) {
    X1(1.0f, "1×"),
    X1_25(1.25f, "1.25×"),
    X1_5(1.5f, "1.5×"),
    X1_75(1.75f, "1.75×"),
    X2(2.0f, "2×"),
    ;

    companion object {
        val DEFAULT: SpeedPreset = X1

        fun fromName(name: String?): SpeedPreset =
            entries.firstOrNull { it.name == name } ?: DEFAULT
    }
}
