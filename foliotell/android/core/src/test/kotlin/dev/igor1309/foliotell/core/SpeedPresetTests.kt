package dev.igor1309.foliotell.core

import kotlin.test.Test
import kotlin.test.assertEquals

class SpeedPresetTests {

    @Test
    fun test_presets_shouldExposeExactlyFiveDistinctRates() {
        val rates = SpeedPreset.entries.map { it.rate }
        assertEquals(5, rates.size)
        assertEquals(rates.size, rates.distinct().size)
    }

    @Test
    fun test_presets_shouldMapToExpectedRates() {
        assertEquals(
            listOf(1.0f, 1.25f, 1.5f, 1.75f, 2.0f),
            SpeedPreset.entries.map { it.rate },
        )
    }

    @Test
    fun test_presets_shouldExposeExpectedLabels() {
        assertEquals(
            listOf("1×", "1.25×", "1.5×", "1.75×", "2×"),
            SpeedPreset.entries.map { it.label },
        )
    }

    @Test
    fun test_default_shouldBeOneX() {
        assertEquals(SpeedPreset.X1, SpeedPreset.DEFAULT)
    }

    @Test
    fun test_fromName_shouldReturnPreset_onKnownName() {
        assertEquals(SpeedPreset.X1_75, SpeedPreset.fromName("X1_75"))
    }

    @Test
    fun test_fromName_shouldReturnDefault_onUnknownName() {
        assertEquals(SpeedPreset.DEFAULT, SpeedPreset.fromName("X3"))
    }

    @Test
    fun test_fromName_shouldReturnDefault_onNull() {
        assertEquals(SpeedPreset.DEFAULT, SpeedPreset.fromName(null))
    }
}
