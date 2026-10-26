import Recording

/// Detection must be stopped before quitting so another call cannot start a session.
public func quitRecording(_ recording: Recording, terminate: @Sendable () async -> Void) async {

    recording.send(.userStop)
    // Drain queued call events and the stop before observing the current phase.
    _ = await recording.snapshot()
    let states = await recording.states()
    for await state in states {
        if state.phase == .idle { break }
    }
    await recording.end()
    await terminate()
}
