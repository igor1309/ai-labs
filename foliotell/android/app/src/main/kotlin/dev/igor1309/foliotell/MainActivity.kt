package dev.igor1309.foliotell

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import dev.igor1309.foliotell.core.PlaybackState
import dev.igor1309.foliotell.core.SpeedPreset

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    FolioTellApp()
                }
            }
        }
    }
}

@Composable
private fun FolioTellApp() {
    val context = LocalContext.current
    val speedPreferences = remember { SpeedPreferences(context) }
    var openError by remember { mutableStateOf<String?>(null) }
    var controller by remember { mutableStateOf<ReaderController?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        when (val outcome = openDocument(context.contentResolver, uri)) {
            is OpenOutcome.Opened -> {
                openError = null
                controller = ReaderController(context, outcome.document, speedPreferences.load())
            }
            is OpenOutcome.Failed -> openError = outcome.message
        }
    }

    val current = controller
    if (current == null) {
        OpenScreen(
            error = openError,
            onOpen = { picker.launch(DOCUMENT_MIME_TYPES) },
        )
    } else {
        BackHandler {
            current.stop()
            controller = null
        }
        DisposableEffect(current) {
            onDispose { current.shutdown() }
        }
        ReaderScreen(
            controller = current,
            onSelectSpeed = { preset ->
                current.selectSpeed(preset)
                speedPreferences.save(preset)
            },
        )
    }
}

@Composable
private fun OpenScreen(error: String?, onOpen: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = "FolioTell", style = MaterialTheme.typography.headlineMedium)
        Button(onClick = onOpen) {
            Text(text = "Open document")
        }
        if (error != null) {
            Text(text = error, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun ReaderScreen(controller: ReaderController, onSelectSpeed: (SpeedPreset) -> Unit) {
    val state = controller.state
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = controller.document.name, style = MaterialTheme.typography.titleLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            when (state) {
                is PlaybackState.Idle -> Button(
                    onClick = controller::play,
                    enabled = controller.isEngineReady,
                ) { Text(text = "Play") }
                is PlaybackState.Speaking -> Button(onClick = controller::pause) {
                    Text(text = "Pause")
                }
                is PlaybackState.Paused -> Button(onClick = controller::resume) {
                    Text(text = "Resume")
                }
            }
            OutlinedButton(
                onClick = controller::stop,
                enabled = state !is PlaybackState.Idle,
            ) { Text(text = "Stop") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SpeedPreset.entries.forEach { preset ->
                FilterChip(
                    selected = preset == controller.speed,
                    onClick = { onSelectSpeed(preset) },
                    label = { Text(text = preset.label) },
                )
            }
        }
        if (controller.engineFailed || controller.speechFailed) {
            Text(
                text = "Speech failed on this device.",
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

private val DOCUMENT_MIME_TYPES = arrayOf(
    "text/markdown",
    "text/plain",
    "application/octet-stream",
)
