import CallAppProcesses
import CallFolder
import Foundation
import LiveText
import Session
import Testing
@testable import Audelin
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct RecognizerSourceTests {

    @Test func prepareWaitsForSourceThenHears() async throws {

        let began = Signal(), release = DrainGate()
        let profiling = ProfileIntervalSpy()
        let recognizer = SessionRecognizer(name: "ready", onHear: {
            #expect(profiling.active("Hearing") == 1)
        })
        let adapter = TrackText(recognizerSource: {
            began.send()
            await release.wait()
            return SignpostedRecognizer(base: recognizer, intervals: profiling.intervals)
        })
        let preparing = Task { try await adapter.prepare() }
        defer { release.release(); preparing.cancel(); began.end() }
        await began.next()
        await #expect(throws: TrackText.Failure.notPrepared) {
            try await adapter.hear(.init(start: 0, samples: [0.25], sampleRate: 48_000))
        }
        release.release()
        try await preparing.value
        #expect(try await adapter.hear(.init(start: 0, samples: [0.25], sampleRate: 48_000)).all == [
            .init(id: 0, start: 0, end: 1.0 / 48_000, pending: "ready pending"),
        ])
        #expect(await recognizer.chunks == [.init(samples: [0.25], sampleRate: 48_000)])
        await adapter.shutdown()
        #expect(profiling.began.all == ["Hearing"])
        #expect(profiling.ended.all == ["Hearing"])
    }

    @Test func sourceFailureIsThrownByPrepare() async {

        let adapter = TrackText(recognizerSource: { throw ScriptFailure.failed })
        await #expect(throws: ScriptFailure.failed) { try await adapter.prepare() }
        await #expect(throws: TrackText.Failure.notPrepared) {
            try await adapter.hear(.init(start: 0, samples: [0.25], sampleRate: 48_000))
        }
    }

    @Test func cancellationEndsPrepareWhileSourceRemainsPending() async throws {

        let began = Signal(), release = DrainGate(), builds = Values<Bool>()
        let recognizer = SessionRecognizer(name: "ready")
        let adapter = TrackText(recognizerSource: {
            builds.append(true)
            began.send()
            await release.wait()
            return recognizer
        })
        let preparing = Task { try await adapter.prepare() }
        defer { release.release(); preparing.cancel(); began.end() }
        await began.next()
        preparing.cancel()
        await #expect(throws: CancellationError.self) { try await preparing.value }
        release.release()
        try await adapter.prepare()
        #expect(builds.all == [true])
        #expect(try await adapter.hear(.init(start: 0, samples: [0.5], sampleRate: 48_000)).all.first?.pending == "ready pending")
        await adapter.shutdown()
    }

    @Test func concurrentAndRepeatedPreparesBuildOnce() async throws {

        let began = Signal(), release = DrainGate(), builds = Values<Bool>()
        let recognizer = SessionRecognizer(name: "once")
        let adapter = TrackText(recognizerSource: {
            builds.append(true)
            began.send()
            await release.wait()
            return recognizer
        })
        let first = Task { try await adapter.prepare() }
        let second = Task { try await adapter.prepare() }
        defer { release.release(); first.cancel(); second.cancel(); began.end() }
        await began.next()
        release.release()
        try await first.value
        try await second.value
        _ = try await adapter.hear(.init(start: 0, samples: [0.25], sampleRate: 48_000))
        #expect(try await adapter.finish().all.first?.settled == "once final")
        try await adapter.prepare()
        _ = try await adapter.hear(.init(start: 0, samples: [0.5], sampleRate: 48_000))
        #expect(try await adapter.finish().all.first?.settled == "once final")
        #expect(builds.all == [true])
        #expect(await recognizer.chunks.map(\.samples) == [[0.25], [0.5]])
        #expect(await recognizer.finishes == 2)
    }

    @Test func launchStartsLoadingWithoutWaiting() async throws {

        let began = Signal(), release = DrainGate()
        let recognizer = SessionRecognizer(name: "launch")
        let loading = startLiveModelLoading(recognizerSource: {
            began.send()
            await release.wait()
            return recognizer
        })
        defer { release.release(); loading.cancel(); began.end() }
        await began.next()
        #expect(await recognizer.chunks.isEmpty)
        release.release()
        try await loading.value
    }
}
