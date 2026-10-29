import Compose
import Recording
@testable import Audelin

let makeRecording: MakeRecordingModel = { initial, session, log in
    await Audelin.makeRecording(initial: initial, session: session, log: log)
}

/// Recording composed as the app composes it, with no state log.
func composedRecording(session: any RecordingSession, initial: RecordingState = .init()) async -> RecordingInputs {

    await makeRecording(initial, session, { _ in })
}
