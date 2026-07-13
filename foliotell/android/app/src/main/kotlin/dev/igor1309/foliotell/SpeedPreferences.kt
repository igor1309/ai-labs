package dev.igor1309.foliotell

import android.content.Context
import dev.igor1309.foliotell.core.SpeedPreset

/**
 * Persists the selected speed preset across launches by enum name;
 * unknown or missing values restore the default.
 */
class SpeedPreferences(context: Context) {

    private val prefs = context.getSharedPreferences("foliotell", Context.MODE_PRIVATE)

    fun load(): SpeedPreset = SpeedPreset.fromName(prefs.getString(KEY, null))

    fun save(preset: SpeedPreset) {
        prefs.edit().putString(KEY, preset.name).apply()
    }

    private companion object {
        const val KEY = "speedPreset"
    }
}
