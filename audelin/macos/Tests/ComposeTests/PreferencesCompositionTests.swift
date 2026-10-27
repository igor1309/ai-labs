import Foundation
import Preferences
import Recording
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct PreferencesCompositionTests {

    @Test func recordingStartsWithStoredAutomatic() async throws {

        try await withComposeFolder { root in
            let store = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            for automatic in [false, true] {
                let folder = root.appendingPathComponent("calls-\(automatic)")
                // Only the stored folder of the second pass exists.
                if automatic { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
                try store.write(Preferences(automaticRecording: automatic, callsFolder: folder))
                let (recording, conditions) = await composeRecordingWithPreferences(preferences: store, makePieces: { _ in
                    preconditionFailure("An idle recording must not build a session")
                })
                #expect(await recording.snapshot() == RecordingState(automatic: automatic))
                conditions.refresh()
                // A snapshot reads after every event already sent is reduced.
                #expect(await recording.snapshot().missing.contains(.callsFolder) != automatic)
                await recording.end()
            }
        }
    }

    @Test func liveTextReadsTheChangedPreferenceForTheNextSession() async throws {

        try await withSessionRig(connect: { _, _ in Task {} }) { first, _ in
            try await withSessionRig(connect: { _, _ in Task {} }) { second, _ in
                try await withComposeFolder { root in
                    let store = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
                    var preferences = Preferences(liveText: false, callsFolder: root)
                    try store.write(preferences)
                    let (recording, _) = await composeRecordingWithPreferences(
                        preferences: store, makePieces: { $0 == 1 ? first.pieces : second.pieces }
                    )
                    for condition in RecordingCondition.allCases {
                        recording.send(.conditionChanged(condition, available: true))
                    }
                    do {
                        for (rig, enabled) in [(first, false), (second, true)] {
                            preferences.liveText = enabled
                            try store.write(preferences)
                            recording.send(.userStart)
                            try await waitForPhase(.recording, in: recording)
                            let text = try #require(await rig.pieces.text)
                            #expect(await (text.state.status != .off) == enabled)
                            recording.send(.userStop)
                            try await waitForPhase(.idle, in: recording)
                        }
                        await recording.end()
                    } catch {
                        recording.send(.userStop)
                        try? await waitForPhase(.idle, in: recording)
                        await recording.end()
                        throw error
                    }
                }
            }
        }
    }
}

private func waitForPhase(_ phase: RecordingState.Phase, in recording: Recording) async throws {

    for await state in await recording.states() {
        try Task.checkCancellation()
        if state.phase == phase { return }
    }
    throw ScriptFailure.failed
}
