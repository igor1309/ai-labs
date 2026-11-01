@testable import Composer
import Recording
@testable import Audelin

let makeRecording: MakeRecordingModel = { initial, session, log, ready, released in
    await Composer.makeRecording(initial: initial, session: session, log: log, callAudioReady: ready, callAudioReleased: released)
}

/// Recording composed as the app composes it, with no state log.
func composedRecording(session: any RecordingSession, initial: RecordingState = .init()) async -> RecordingInputs {

    await makeRecording(initial, session, { _ in }, { true }, {})
}
