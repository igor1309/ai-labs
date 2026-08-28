package dev.igor1309.foliotell.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class ReaderPlaybackTests {

    private val playback = ReaderPlayback(chunkCount = 3)

    @Test
    fun test_init_shouldThrow_onNonPositiveChunkCount() {
        assertFailsWith<IllegalArgumentException> { ReaderPlayback(chunkCount = 0) }
    }

    @Test
    fun test_play_shouldTransitionToSpeakingChunkZero_onIdle() {
        val transition = playback.reduce(PlaybackState.Idle, PlaybackEvent.Play)

        assertEquals(PlaybackState.Speaking(0), transition.state)
    }

    @Test
    fun test_play_shouldEmitSpeakFromChunkZero_onIdle() {
        val transition = playback.reduce(PlaybackState.Idle, PlaybackEvent.Play)

        assertEquals(PlaybackEffect.Speak(0), transition.effect)
    }

    @Test
    fun test_pause_shouldTransitionToPausedAtCurrentChunk_onSpeaking() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.Pause)

        assertEquals(PlaybackState.Paused(1), transition.state)
    }

    @Test
    fun test_pause_shouldEmitStopSpeech_onSpeaking() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.Pause)

        assertEquals(PlaybackEffect.StopSpeech, transition.effect)
    }

    @Test
    fun test_stop_shouldTransitionToIdle_onSpeaking() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.Stop)

        assertEquals(PlaybackState.Idle, transition.state)
    }

    @Test
    fun test_stop_shouldEmitStopSpeech_onSpeaking() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.Stop)

        assertEquals(PlaybackEffect.StopSpeech, transition.effect)
    }

    @Test
    fun test_chunkDone_shouldAdvanceToNextChunk_onSpeakingNonLastChunk() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.ChunkDone(1))

        assertEquals(PlaybackState.Speaking(2), transition.state)
    }

    @Test
    fun test_chunkDone_shouldEmitNoEffect_onSpeakingNonLastChunk() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.ChunkDone(1))

        assertNull(transition.effect)
    }

    @Test
    fun test_chunkDone_shouldTransitionToIdle_onSpeakingLastChunk() {
        val transition = playback.reduce(PlaybackState.Speaking(2), PlaybackEvent.ChunkDone(2))

        assertEquals(PlaybackState.Idle, transition.state)
    }

    @Test
    fun test_chunkDone_shouldEmitNoEffect_onSpeakingLastChunk() {
        val transition = playback.reduce(PlaybackState.Speaking(2), PlaybackEvent.ChunkDone(2))

        assertNull(transition.effect)
    }

    @Test
    fun test_chunkDone_shouldBeIgnored_onSpeakingWithMismatchedIndex() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.ChunkDone(0))

        assertEquals(Transition(PlaybackState.Speaking(1), effect = null), transition)
    }

    @Test
    fun test_chunkDone_shouldBeIgnored_onIdle() {
        val transition = playback.reduce(PlaybackState.Idle, PlaybackEvent.ChunkDone(2))

        assertEquals(Transition(PlaybackState.Idle, effect = null), transition)
    }

    @Test
    fun test_chunkDone_shouldBeIgnored_onPaused() {
        val transition = playback.reduce(PlaybackState.Paused(1), PlaybackEvent.ChunkDone(1))

        assertEquals(Transition(PlaybackState.Paused(1), effect = null), transition)
    }

    @Test
    fun test_speedChanged_shouldStaySpeakingAtCurrentChunk_onSpeaking() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.SpeedChanged)

        assertEquals(PlaybackState.Speaking(1), transition.state)
    }

    @Test
    fun test_speedChanged_shouldEmitSpeakFromCurrentChunk_onSpeaking() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.SpeedChanged)

        assertEquals(PlaybackEffect.Speak(1), transition.effect)
    }

    @Test
    fun test_speedChanged_shouldBeIgnored_onPaused() {
        val transition = playback.reduce(PlaybackState.Paused(1), PlaybackEvent.SpeedChanged)

        assertEquals(Transition(PlaybackState.Paused(1), effect = null), transition)
    }

    @Test
    fun test_speechError_shouldTransitionToIdle_onSpeaking() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.SpeechError)

        assertEquals(PlaybackState.Idle, transition.state)
    }

    @Test
    fun test_speechError_shouldEmitStopSpeech_onSpeaking() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.SpeechError)

        assertEquals(PlaybackEffect.StopSpeech, transition.effect)
    }

    @Test
    fun test_speechError_shouldBeIgnored_onIdle() {
        val transition = playback.reduce(PlaybackState.Idle, PlaybackEvent.SpeechError)

        assertEquals(Transition(PlaybackState.Idle, effect = null), transition)
    }

    @Test
    fun test_speechError_shouldBeIgnored_onPaused() {
        val transition = playback.reduce(PlaybackState.Paused(1), PlaybackEvent.SpeechError)

        assertEquals(Transition(PlaybackState.Paused(1), effect = null), transition)
    }

    @Test
    fun test_resume_shouldTransitionToSpeakingAtPausedChunk_onPaused() {
        val transition = playback.reduce(PlaybackState.Paused(1), PlaybackEvent.Resume)

        assertEquals(PlaybackState.Speaking(1), transition.state)
    }

    @Test
    fun test_resume_shouldEmitSpeakFromPausedChunk_onPaused() {
        val transition = playback.reduce(PlaybackState.Paused(1), PlaybackEvent.Resume)

        assertEquals(PlaybackEffect.Speak(1), transition.effect)
    }

    @Test
    fun test_play_shouldActAsResume_onPaused() {
        val transition = playback.reduce(PlaybackState.Paused(1), PlaybackEvent.Play)

        assertEquals(PlaybackState.Speaking(1), transition.state)
    }

    @Test
    fun test_play_shouldEmitSpeakFromPausedChunk_onPaused() {
        val transition = playback.reduce(PlaybackState.Paused(1), PlaybackEvent.Play)

        assertEquals(PlaybackEffect.Speak(1), transition.effect)
    }

    @Test
    fun test_stop_shouldTransitionToIdle_onPaused() {
        val transition = playback.reduce(PlaybackState.Paused(1), PlaybackEvent.Stop)

        assertEquals(PlaybackState.Idle, transition.state)
    }

    @Test
    fun test_stop_shouldEmitNoEffect_onPaused() {
        val transition = playback.reduce(PlaybackState.Paused(1), PlaybackEvent.Stop)

        assertNull(transition.effect)
    }

    @Test
    fun test_play_shouldBeIgnored_onSpeaking() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.Play)

        assertEquals(Transition(PlaybackState.Speaking(1), effect = null), transition)
    }

    @Test
    fun test_resume_shouldBeIgnored_onSpeaking() {
        val transition = playback.reduce(PlaybackState.Speaking(1), PlaybackEvent.Resume)

        assertEquals(Transition(PlaybackState.Speaking(1), effect = null), transition)
    }
}
