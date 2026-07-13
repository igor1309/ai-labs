package dev.igor1309.foliotell.core

sealed interface PlaybackState {
    data object Idle : PlaybackState
    data class Speaking(val chunkIndex: Int) : PlaybackState
    data class Paused(val chunkIndex: Int) : PlaybackState
}

sealed interface PlaybackEvent {
    data object Play : PlaybackEvent
    data object Pause : PlaybackEvent
    data object Resume : PlaybackEvent
    data object Stop : PlaybackEvent
    data class ChunkDone(val chunkIndex: Int) : PlaybackEvent
    data object SpeedChanged : PlaybackEvent
    data object SpeechError : PlaybackEvent
}

sealed interface PlaybackEffect {
    data class Speak(val fromChunkIndex: Int) : PlaybackEffect
    data object StopSpeech : PlaybackEffect
}

data class Transition(val state: PlaybackState, val effect: PlaybackEffect?)

/**
 * Pure playback reducer over the Stage 1 spec's state × event matrix. The
 * app performs the returned effect on the TTS engine; the platform engine
 * has no pause, so Pause maps to stop-now and Resume restarts from the
 * beginning of the chunk that was playing.
 */
class ReaderPlayback(private val chunkCount: Int) {

    init {
        require(chunkCount >= 1) { "chunkCount must be positive: $chunkCount" }
    }

    fun reduce(state: PlaybackState, event: PlaybackEvent): Transition = when (state) {
        is PlaybackState.Idle -> when (event) {
            PlaybackEvent.Play ->
                Transition(PlaybackState.Speaking(0), PlaybackEffect.Speak(0))
            else -> ignore(state)
        }
        is PlaybackState.Speaking -> when (event) {
            PlaybackEvent.Pause ->
                Transition(PlaybackState.Paused(state.chunkIndex), PlaybackEffect.StopSpeech)
            PlaybackEvent.Stop ->
                Transition(PlaybackState.Idle, PlaybackEffect.StopSpeech)
            is PlaybackEvent.ChunkDone -> when {
                event.chunkIndex != state.chunkIndex -> ignore(state)
                state.chunkIndex < chunkCount - 1 ->
                    Transition(PlaybackState.Speaking(state.chunkIndex + 1), effect = null)
                else -> Transition(PlaybackState.Idle, effect = null)
            }
            PlaybackEvent.SpeedChanged ->
                Transition(state, PlaybackEffect.Speak(state.chunkIndex))
            PlaybackEvent.SpeechError ->
                Transition(PlaybackState.Idle, PlaybackEffect.StopSpeech)
            else -> ignore(state)
        }
        is PlaybackState.Paused -> when (event) {
            // Play acts as Resume so the transport never dead-ends on a
            // paused reader.
            PlaybackEvent.Play, PlaybackEvent.Resume ->
                Transition(PlaybackState.Speaking(state.chunkIndex), PlaybackEffect.Speak(state.chunkIndex))
            PlaybackEvent.Stop -> Transition(PlaybackState.Idle, effect = null)
            else -> ignore(state)
        }
    }

    private fun ignore(state: PlaybackState) = Transition(state, null)
}
