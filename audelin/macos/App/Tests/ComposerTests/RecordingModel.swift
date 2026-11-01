@testable import Composer
import Recording

func composedRecording(session: any RecordingSession, initial: RecordingState = .init()) async -> RecordingInputs {
    await Composer.makeRecording(initial: initial, session: session, log: { _ in },
                                 callAudioReady: { true }, callAudioReleased: {})
}
