import CallDiarizer
import Foundation
import Observation
import Preferences
import Recordings
import Testing
import TranscriptFormat
@testable import Composer

/// A recording that starts through the application's own inputs stops a running
/// transcript, with no calls-window action, and the call keeps its old transcript.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct TranscriptAgainRecordingStartTests {
    enum Start: CaseIterable { case automatic, manual }

    @Test(arguments: Start.allCases)
    func aRecordingStartStopsTheRunAndKeepsTheOldTranscript(start: Start) async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-1000", folder = root.appendingPathComponent(id)
            try await FixtureTrack.write(far: 1, microphone: 2, seconds: 4, in: folder)
            let old = Data("# Transcript\n\n**Me** 00:00:00\nOld words.\n".utf8)
            try old.write(to: folder.appendingPathComponent("transcript.md"))
            let binding = CallBinding(fails: false, input: false), entered = Signal()
            let held = folder.appendingPathComponent("call.caf").resolvingSymlinksInPath().path
            let rig = try await ComposeFixture.make(root: root,
                preferences: .init(automaticRecording: start == .automatic, liveText: false, callsFolder: root),
                configure: { boundary in
                    boundary.processes = FixtureProcesses(binding: binding)
                    boundary.recognizers = TrackRecognizers(answers: [1: [.init("New call", start: 1, end: 1.8)]])
                    // The run is held in its split until it is stopped; other tracks are not split.
                    boundary.diarizer = TrackDiarizer(model: .nemotron, calls: Values()) { track in
                        guard track.resolvingSymlinksInPath().path == held else { return [] }
                        entered.continuation.yield(())
                        try await Task.sleep(for: .seconds(3600))
                        return []
                    }
                })
            do {
                let calls = try #require(rig.menu.calls)
                calls.show()
                for await state in Observations({ calls.recordingsState }) where state.transcriptOffers[id]?.run == .available { break }
                await calls.send(.makeTranscriptAgain(id))
                var split = entered.stream.makeAsyncIterator()
                _ = await split.next()
                switch start {
                case .automatic: binding.setInput(true)
                case .manual: await rig.menu.perform(.start)
                }
                for await state in Observations({ calls.recordingsState })
                where state.transcriptRun == nil && state.failure?.kind == .transcriptStopped { break }
                #expect(calls.recordingsState.failure?.id == id)
                #expect(calls.recordingsState.transcriptChanged == nil)
                #expect(try Data(contentsOf: folder.appendingPathComponent("transcript.md")) == old)
                #expect(!FileManager.default.fileExists(atPath: folder.appendingPathComponent("transcript-previous.md").path))
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }
}
