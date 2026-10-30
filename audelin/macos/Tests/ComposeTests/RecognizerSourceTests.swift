import CallAppProcesses
import CallFolder
import Foundation
import LiveText
import struct MicrophoneCapture.AudioPiece
import Session
import struct SystemAudioCapture.AudioPiece
import Testing
@testable import Compose

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
            return recognizer
        }, executor: nil, intervals: profiling.intervals)
        let preparing = Task { try await adapter.prepare() }
        defer { release.release(); preparing.cancel(); began.end() }
        await began.next()
        await #expect(throws: TrackText.Failure.notPrepared) {
            try await adapter.hear(.init(start: 0, samples: [0.25], sampleRate: 48_000))
        }
        release.release()
        try await preparing.value
        #expect(try await adapter.hear(.init(start: 0, samples: [0.25], sampleRate: 48_000)) == [
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
        #expect(try await adapter.hear(.init(start: 0, samples: [0.5], sampleRate: 48_000)).first?.pending == "ready pending")
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
        #expect(try await adapter.finish().first?.settled == "once final")
        try await adapter.prepare()
        _ = try await adapter.hear(.init(start: 0, samples: [0.5], sampleRate: 48_000))
        #expect(try await adapter.finish().first?.settled == "once final")
        #expect(builds.all == [true])
        #expect(await recognizer.chunks.map(\.samples) == [[0.25], [0.5]])
        #expect(await recognizer.finishes == 2)
    }

    @Test func sessionRecordsWhileGettingReadyThenReadsBothTracksFromStart() async throws {

        try await withComposeFolder { root in
            let microphone = CaptureScript<MicrophoneCapture.AudioPiece>(
                first: .init(samples: [0.25, -0.5], sampleRate: 48_000),
                last: .init(samples: [0.125], sampleRate: 48_000), fails: false
            )
            let call = CaptureScript<SystemAudioCapture.AudioPiece>(
                first: .init(samples: [-0.25, 0.5], sampleRate: 48_000),
                last: .init(samples: [-0.125], sampleRate: 48_000), fails: false
            )
            let mine = SessionRecognizer(name: "mine"), theirs = SessionRecognizer(name: "theirs")
            let beganMine = Signal(), beganTheirs = Signal(), release = DrainGate()
            defer { microphone.end(); call.end(); beganMine.end(); beganTheirs.end(); release.release() }
            let pieces = composeSessionPieces(
                folder: CallFolder(callsURL: root, now: { Date(timeIntervalSince1970: 0) }, timeZone: TimeZone(secondsFromGMT: 0)!),
                processes: CallAppProcesses(app: "meeting", list: SessionProcessList(answer: .success([]))),
                startMicrophone: { try microphone.start() }, startCall: { _ in try call.start() },
                microphoneRecognizerSource: { beganMine.send(); await release.wait(); return mine },
                callRecognizerSource: { beganTheirs.send(); await release.wait(); return theirs },
                missingModels: { [] }
            )
            let session = await makeSession(pieces.handler())
            let subscription = subscribe(pieces, to: session)
            do {
                await session.send(.begin(liveText: true))
                for await state in await session.states() {
                    if state.phase == .recording { break }
                }
                await beganMine.next()
                await beganTheirs.next()
                let text = try #require(await pieces.text)
                #expect(await text.state.status == .gettingReady)
                #expect(await mine.chunks.isEmpty)
                #expect(await theirs.chunks.isEmpty)

                try await pieces.microphoneCapture.stop()
                try await pieces.callCapture.stop()
                try await pieces.microphoneTrack.close()
                try await pieces.callTrack.close()
                let folder = root.appendingPathComponent("1970.01.01-0000")
                #expect(try await recordedSamples(folder.appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.125])
                #expect(try await recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
                #expect(await text.state.status == .gettingReady)

                release.release()
                for await state in text.updates {
                    if state.status == .finished { break }
                }
                let caughtUp = await text.state
                #expect(caughtUp.status == .finished)
                #expect(caughtUp.entries.map(\.speaker) == [.mine, .theirs])
                #expect(caughtUp.entries.map(\.text.start) == [0, 0])
                #expect(caughtUp.entries.map(\.text.settled) == ["mine final", "theirs final"])
                #expect(await mine.chunks.flatMap(\.samples) == [0.25, -0.5, 0.125])
                #expect(await theirs.chunks.flatMap(\.samples) == [-0.25, 0.5, -0.125])
            } catch {
                release.release()
                await session.send(.end)
                for await state in await session.states() { if state.phase == .ended { break } }
                await session.end()
                subscription.cancel()
                await subscription.value
                throw error
            }
            await session.send(.end)
            for await state in await session.states() { if state.phase == .ended { break } }
            await session.end()
            subscription.cancel()
            await subscription.value
        }
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
