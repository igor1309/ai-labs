import BlockingTestWork
import Composer
import Foundation
import Preferences
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct PreferencesCompositionTests {
    @Test(arguments: [false, true])
    func recordingStartsWithStoredAutomatic(automatic: Bool) async throws {
        try await withComposition(preferences: { .init(automaticRecording: automatic, callsFolder: $0) }) { rig in
            let initial = try await rig.state { $0.phase == .idle }
            #expect(initial.automatic == automatic)
            #expect(initial.missing.isEmpty)
            #expect(rig.microphone.starts.all.isEmpty && rig.call.starts.all.isEmpty)
            await rig.menu.perform(.setAutomatic(!automatic))
            let changed = try await rig.state { $0.automatic == !automatic }
            #expect(changed.phase == .idle)
            let url = rig.root.appendingPathComponent("preferences.json")
            #expect(await offPool { PreferencesStore(fileURL: url).read().automaticRecording } == !automatic)
        }
    }

    @Test func liveTextReadsTheChangedPreferenceForTheNextSession() async throws {
        try await withComposition(preferences: { .init(automaticRecording: false, liveText: false, callsFolder: $0) }) { rig in
            try await rig.start()
            _ = try await rig.panel { if case .liveTextOff = $0.log { true } else { false } }
            #expect(await rig.mine.chunks.isEmpty)
            try await rig.stop()
            await rig.menu.perform(.setLiveText(true))
            try await rig.start()
            await rig.mine.heard.next(); await rig.theirs.heard.next()
            _ = try await rig.panel { if case let .lines(lines) = $0.log { lines.entries.count == 2 } else { false } }
            try await rig.stop()
            #expect(await rig.mine.chunks.flatMap(\.samples) == [0.25, -0.5, 0.125])
            #expect(await rig.theirs.chunks.flatMap(\.samples) == [-0.25, 0.5, -0.125])
        }
    }
}
