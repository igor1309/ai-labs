package dev.igor1309.foliotell

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.igor1309.foliotell.core.Document
import dev.igor1309.foliotell.core.PlaybackEffect
import dev.igor1309.foliotell.core.PlaybackEvent
import dev.igor1309.foliotell.core.PlaybackState
import dev.igor1309.foliotell.core.ReaderPlayback
import dev.igor1309.foliotell.core.SpeedPreset
import dev.igor1309.foliotell.core.UtteranceChunker

/**
 * Drives one document's playback: feeds transport taps and engine callbacks
 * through the core [ReaderPlayback] reducer and performs the returned
 * effects on the platform [TextToSpeech] engine. Utterance ids carry the
 * chunk index so engine callbacks map back onto reducer events.
 */
class ReaderController(
    context: Context,
    val document: Document,
    initialSpeed: SpeedPreset,
) {

    var state: PlaybackState by mutableStateOf(PlaybackState.Idle)
        private set
    var speed: SpeedPreset by mutableStateOf(initialSpeed)
        private set
    var isEngineReady: Boolean by mutableStateOf(false)
        private set

    /** The engine never initialized; permanent for this reader. */
    var engineFailed: Boolean by mutableStateOf(false)
        private set

    /** An utterance failed; cleared by the next transport action. */
    var speechFailed: Boolean by mutableStateOf(false)
        private set

    private val chunks = UtteranceChunker.chunk(document.text, TextToSpeech.getMaxSpeechInputLength())
    private val playback = ReaderPlayback(chunkCount = chunks.size)
    private val mainHandler = Handler(Looper.getMainLooper())
    private var shutDown = false

    private val tts = TextToSpeech(context) { status ->
        mainHandler.post {
            if (shutDown) return@post
            if (status == TextToSpeech.SUCCESS) isEngineReady = true else engineFailed = true
        }
    }

    init {
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit

            override fun onDone(utteranceId: String?) {
                val index = utteranceId?.toIntOrNull() ?: return
                onMain { dispatch(PlaybackEvent.ChunkDone(index)) }
            }

            @Deprecated("Deprecated in the platform; the sibling overload is the live path.")
            override fun onError(utteranceId: String?) {
                onMain { failSpeech() }
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                onMain { failSpeech() }
            }
        })
    }

    fun play() = clearErrorAnd(PlaybackEvent.Play)

    fun pause() = clearErrorAnd(PlaybackEvent.Pause)

    fun resume() = clearErrorAnd(PlaybackEvent.Resume)

    fun stop() = clearErrorAnd(PlaybackEvent.Stop)

    fun selectSpeed(preset: SpeedPreset) {
        speed = preset
        clearErrorAnd(PlaybackEvent.SpeedChanged)
    }

    fun shutdown() {
        if (shutDown) return
        shutDown = true
        tts.stop()
        tts.shutdown()
    }

    private fun clearErrorAnd(event: PlaybackEvent) {
        speechFailed = false
        dispatch(event)
    }

    private fun dispatch(event: PlaybackEvent) {
        if (shutDown) return
        val transition = playback.reduce(state, event)
        state = transition.state
        when (val effect = transition.effect) {
            is PlaybackEffect.Speak -> speak(effect.fromChunkIndex)
            PlaybackEffect.StopSpeech -> tts.stop()
            null -> Unit
        }
    }

    private fun speak(fromChunkIndex: Int) {
        tts.setSpeechRate(speed.rate)
        var queueMode = TextToSpeech.QUEUE_FLUSH
        for (index in fromChunkIndex until chunks.size) {
            val queued = tts.speak(chunks[index], queueMode, null, index.toString())
            if (queued == TextToSpeech.ERROR) {
                failSpeech()
                return
            }
            queueMode = TextToSpeech.QUEUE_ADD
        }
    }

    private fun failSpeech() {
        speechFailed = true
        dispatch(PlaybackEvent.SpeechError)
    }

    private fun onMain(block: () -> Unit) {
        mainHandler.post {
            if (!shutDown) block()
        }
    }
}
