import Composer
import Foundation
import LiveText
import SessionRehearsal
import Testing

/// The recogniser reaches a side through the boundary's source, at the time
/// the session asks for it.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RecognizerSourceTests {

    @Test func aSideWaitsForItsSourceThenHearsFromTheStart() async throws {

        let held = DrainGate(), profiling = ProfileIntervalSpy()
        defer { held.release() }
        let mine = SessionRecognizer(name: "ready", onHear: { #expect(profiling.active("Hearing") >= 1) })
        try await withComposition(configure: { boundary in
            boundary.intervals = profiling.intervals
            boundary.recognizers = source { side in
                guard side == .microphone else { return SessionRecognizer(name: "theirs") }
                await held.wait()
                return mine
            }
        }) { rig in
            try await rig.start()
            await held.waitUntilEntered()
            #expect(await mine.chunks.isEmpty)
            held.release()
            await mine.heard.next()
            #expect(await mine.chunks.first == .init(samples: [0.25, -0.5], sampleRate: 48_000))
            try await rig.stop()
            #expect(await mine.chunks.flatMap(\.samples) == [0.25, -0.5, 0.125])
            let hearing = profiling.began.all.filter { $0 == "Hearing" }
            #expect(!hearing.isEmpty)
            #expect(profiling.ended.all.filter { $0 == "Hearing" }.count == hearing.count)
        }
    }

    @Test func aSourceFailureLeavesTheRecordingAndTheOtherSideGoing() async throws {

        let theirs = SessionRecognizer(name: "theirs")
        try await withComposition(configure: { boundary in
            boundary.recognizers = source { side in
                guard side == .call else { throw ScriptFailure.failed }
                return theirs
            }
        }) { rig in
            try await rig.start()
            _ = try await rig.panel { entries(of: $0).contains { $0.speaker == .them } }
            #expect(try await rig.state { _ in true }.phase == .recording)
            try await rig.stop()
            let transcript = try await transcriptText(of: rig)
            #expect(transcript.contains("theirs final"))
            #expect(!transcript.contains("mine"))
            #expect(try await recordedSamples(rig.folder().appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.125])
        }
    }

    @Test func stoppingWhileTheSourceIsHeldEndsTheSessionAndHearsNothingLater() async throws {

        let held = DrainGate()
        defer { held.release() }
        let mine = SessionRecognizer(name: "late")
        try await withComposition(configure: { boundary in
            boundary.recognizers = source { side in
                guard side == .microphone else { return SessionRecognizer(name: "theirs") }
                await held.wait()
                return mine
            }
        }) { rig in
            try await rig.start()
            await held.waitUntilEntered()
            try await rig.stop()
            held.release()
            #expect(await mine.chunks.isEmpty)
        }
    }

    /// Each side asks once per session, including when Live text comes on later.
    @Test(arguments: [true, false])
    func eachSessionAsksForEachSidesRecognizerOnce(liveText: Bool) async throws {

        let builds = Values<ComposerSide>()
        try await withComposition(preferences: { .init(automaticRecording: false, liveText: liveText, callsFolder: $0) }, configure: { boundary in
            boundary.recognizers = source { side in
                builds.append(side)
                return SessionRecognizer(name: String(describing: side))
            }
        }) { rig in
            for session in 1...2 {
                try await rig.start()
                if !liveText {
                    #expect(builds.all.count == (session - 1) * 2)
                    await rig.menu.sendPanel(.switchLiveTextOn)
                }
                _ = try await rig.panel { entries(of: $0).count == 2 }
                try await rig.stop()
                #expect(builds.all.filter { $0 == .microphone }.count == session)
                #expect(builds.all.filter { $0 == .call }.count == session)
            }
        }
    }
}

private func source(_ recognizer: @escaping @Sendable (ComposerSide) async throws -> any Recognizer) -> FixtureRecognizers {

    FixtureRecognizers(source: { RehearsalRecognizer(try await recognizer($0)) }, missing: { [] },
                       load: { Task {} })
}
