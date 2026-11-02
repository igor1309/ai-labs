import BlockingTestWork
import Composer
import Foundation
import SessionRehearsal
import Synchronization
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RecordingPiecesTests {
    @Test func folderUsesStoredSnapshotAndSessionTimeZone() async throws {
        let zone = Mutex(TimeZone.gmt)
        try await withComposeFolder { root in
            let calls = root.appendingPathComponent("calls")
            try await offPool { try FileManager.default.createDirectory(at: calls, withIntermediateDirectories: false) }
            let rig = try await ComposeFixture.make(root: root,
                preferences: .init(automaticRecording: false, liveText: false, callsFolder: calls), configure: { boundary in
                    let time = boundary.time
                    boundary.time = ComposerTime(now: time.now, timeZone: { zone.withLock { $0 } },
                        monotonicNow: time.monotonicNow, sleep: time.sleep, after: time.after, ticks: time.ticks)
                })
            do {
                zone.withLock { $0 = TimeZone(secondsFromGMT: 3600)! }
                try await rig.start()
                try await rig.stop()
                let name = "1970.01.01-0100"
                #expect(await offPool { isFolder(calls.appendingPathComponent(name).path) })
                #expect(try await recordedSamples(calls.appendingPathComponent(name).appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
                #expect(rig.menu.preferences.callsFolder == calls)
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }

    @Test func callFolderIsNamedWithTheCallAppAndAManualOneIsNot() async throws {
        try await withComposition { rig in
            try await rig.start(); try await rig.stop()
            #expect(await offPool { isFolder(rig.folder().path) })
        }
        try await withComposition(configure: { $0.processes = FixtureProcesses(binding: CallBinding(fails: false)) }) { rig in
            _ = try await rig.state { $0.callOn }
            try await rig.start(); try await rig.stop()
            #expect(await offPool { isFolder(rig.folder("1970.01.01-0000 Zoom").path) })
            #expect(rig.selections.all == [.only([42])])
        }
    }

    @Test func sourcesAreLazyAndGiveEachSideItsOwnRecognizer() async throws {
        let recognizers = Values<SessionRecognizer>()
        try await withComposition(configure: { boundary in
            boundary.recognizers = FixtureRecognizers(source: { side in
                let recognizer = SessionRecognizer(name: side == .microphone ? "mine" : "theirs")
                recognizers.append(recognizer)
                return RehearsalRecognizer(recognizer)
            }, missing: { [] }, load: { Task {} })
        }) { rig in
            #expect(rig.microphone.starts.all.isEmpty && rig.call.starts.all.isEmpty)
            #expect(recognizers.all.isEmpty)
            for id in 1...2 {
                try await rig.start()
                await rig.menu.perform(.start)
                let state = try await rig.state { $0.phase == .recording }
                #expect(state.lastSessionID == UInt64(id))
                _ = try await rig.panel { if case let .lines(lines) = $0.log { lines.entries.count == 2 } else { false } }
                try await rig.stop()
                let reset = try await rig.panel { $0.recording == .off }
                #expect(reset.log == .empty)
            }
            #expect(rig.microphone.starts.all == [true, true] && rig.call.starts.all == [true, true])
            #expect(rig.microphone.stops.all == [true, true] && rig.call.stops.all == [true, true])
            #expect(recognizers.all.count == 4)
            for recognizer in recognizers.all {
                let expected: [Float] = recognizer.name == "mine" ? [0.25, -0.5, 0.125] : [-0.25, 0.5, -0.125]
                #expect(await recognizer.chunks.flatMap(\.samples) == expected)
            }
            for name in ["1970.01.01-0000", "1970.01.01-0000-2"] {
                #expect(try await recordedSamples(rig.folder(name).appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.125])
                #expect(try await recordedSamples(rig.folder(name).appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
            }
        }
    }

    @Test(arguments: [["Parakeet v3"], ["Parakeet v3", "Nemotron"]])
    func missingModelRefusesTheRecordingBeforeAnythingIsMade(missing: [String]) async throws {
        try await withComposition(configure: { boundary in
            let recognizers = boundary.recognizers
            boundary.recognizers = FixtureRecognizers(source: { try await recognizers.recognizer(for: $0) },
                missing: { missing }, load: { recognizers.startLoading() })
        }) { rig in
            await rig.menu.perform(.start)
            let state = try await rig.state { $0.phase == .idle && $0.cannotRecord != nil }
            #expect(state.cannotRecord == "model: \(missing.joined(separator: ", ")) not on disk")
            #expect(rig.microphone.starts.all.isEmpty && rig.call.starts.all.isEmpty)
            #expect(rig.log.entries.all.filter { $0.category == .model } == [
                .init(category: .model, message: "recording refused", error: "\(missing.joined(separator: ", ")) not on disk"),
            ])
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: rig.root.path) } == ["preferences.json"])
        }
    }
}
