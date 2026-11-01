import CallAppProcesses
import CallFolder
import Foundation
import struct MicrophoneCapture.AudioPiece
import Session
import Synchronization
import struct SystemAudioCapture.AudioPiece
import Testing
@testable import Audelin
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct SessionStatisticsTests {

    @Test(arguments: [false, true])
    func eachSideOffsetsEveryMeasurementAndJoinsStatisticsOnStop(stopFails: Bool) async throws {

        let clock = StatisticsClock([100, 102, 107])
        try await withStatisticsPieces(clock: clock, stopFails: stopFails) { rig in
            let collected = Task {
                var events: [SessionEvent] = []
                for await event in rig.pieces.events { events.append(event) }
                return events
            }
            try await rig.pieces.startMicrophoneCapture()
            try await rig.pieces.startCallCapture(selection: .everyAppButAudelin)
            for side in [SessionSide.microphone, .call] {
                do { try await rig.pieces.stopCapture(side); #expect(!stopFails) }
                catch { #expect(stopFails && error as? ScriptFailure == .failed) }
            }
            await rig.pieces.news.continuation.yield(.preferenceChanged(true))
            if case .terminated = rig.microphone.source.continuation.yield(.init(samples: [1], sampleRate: 100)) {} else {
                Issue.record("microphone source remained open after stop")
            }
            if case .terminated = rig.call.source.continuation.yield(.init(samples: [1], sampleRate: 100)) {} else {
                Issue.record("call source remained open after stop")
            }
            await rig.pieces.news.continuation.finish()
            let events = await collected.value
            let call = events.filter { if case .callAudioStatistics = $0 { true } else { false } }
            let microphone = events.filter { if case .microphoneLevel = $0 { true } else { false } }
            #expect(call == [
                .callAudioStatistics(start: 7, end: 7.04, hasFiniteNonzeroSample: false),
                .callAudioStatistics(start: 7.04, end: 7.06, hasFiniteNonzeroSample: true),
            ])
            #expect(microphone == [
                .microphoneLevel(start: 2, end: 2.02, rms: 0.5),
                .microphoneLevel(start: 2.02, end: 2.04, rms: 0.5),
                .microphoneLevel(start: 2.04, end: 2.06, rms: 0.25),
            ])
            #expect(events.last == .preferenceChanged(true))
            #expect(clock.reads.all == [100, 102, 107])
        }
    }

    @Test func captureStatisticsWarnAndNonzeroCallAudioClearsTheSessionWarning() async throws {

        try await withStatisticsPieces(clock: StatisticsClock([100, 100, 100]), initialPieces: false) { rig in
            let session = await makeSession(handler: rig.pieces.handler())
            let sink = StatisticsLog()
            let sessions = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                report: { _, _ in }, connect: subscribe, sink: sink,
                panel: ReadingClockSpy().panel(), makeSession: { _ in session })
            #expect(await sessions.begin(id: 1) == .ready)
            rig.call.source.continuation.yield(.init(samples: Array(repeating: 0, count: 15_000), sampleRate: 50))
            rig.microphone.source.continuation.yield(.init(samples: Array(repeating: 0.5, count: 15_000), sampleRate: 50))
            do {
                let warning = try await statisticsState(session) { $0.audioWarning == .callSilent }
                #expect(warning.phase == .recording)
                rig.call.source.continuation.yield(.init(samples: [0.25], sampleRate: 50))
                _ = try await statisticsState(session) { $0.audioWarning == nil }
            } catch {
                await sessions.end(id: 1)
                throw error
            }
            await sessions.end(id: 1)
            let logs = sink.states.all
            let warningIndex = try #require(logs.firstIndex { $0.message.contains("audioWarning=callSilent") })
            #expect(logs.dropFirst(warningIndex + 1).contains { $0.message.contains("audioWarning=none") && $0.message.contains("phase=recording") })
        }
    }
}

private func statisticsState(_ session: SessionInputs, matches: (SessionState) -> Bool) async throws -> SessionState {

    for await state in await session.states() { if matches(state) { return state } }
    throw ScriptFailure.failed
}

private final class StatisticsClock: Sendable {

    private let remaining: Mutex<[Double]>
    let reads = Values<Double>()

    init(_ times: [Double]) { remaining = Mutex(times) }

    func now() -> Double {

        let value = remaining.withLock { $0.removeFirst() }
        reads.append(value)
        return value
    }
}

private final class StatisticsCapture<Piece: Sendable>: Sendable {

    let source = AsyncThrowingStream<Piece, any Error>.makeStream()
    let first: Piece?
    let last: Piece?
    let stopFails: Bool

    init(first: Piece?, last: Piece?, stopFails: Bool) {
        self.first = first; self.last = last; self.stopFails = stopFails
    }

    func start() -> StartedCapture<Piece> {

        if let first { source.continuation.yield(first) }
        return StartedCapture(stream: source.stream, stop: {
            if let last = self.last { self.source.continuation.yield(last) }
            self.source.continuation.finish()
            if self.stopFails { throw ScriptFailure.failed }
        })
    }
}

private struct StatisticsTrack: RecordingTrack {
    func write(_ samples: [Float], sampleRate: Double) async throws {}
}

private struct StatisticsPieces {
    let pieces: SessionPieces
    let microphone: StatisticsCapture<MicrophoneCapture.AudioPiece>
    let call: StatisticsCapture<SystemAudioCapture.AudioPiece>
}

private func withStatisticsPieces(
    clock: StatisticsClock, stopFails: Bool = false, initialPieces: Bool = true,
    body: (StatisticsPieces) async throws -> Void
) async throws {

    try await withComposeFolder { root in
        let microphone = StatisticsCapture<MicrophoneCapture.AudioPiece>(
            first: initialPieces ? .init(samples: [0.5, 0.5, 0.5, 0.5], sampleRate: 100) : nil,
            last: initialPieces ? .init(samples: [0.25, 0.25], sampleRate: 100) : nil, stopFails: stopFails)
        let call = StatisticsCapture<SystemAudioCapture.AudioPiece>(
            first: initialPieces ? .init(samples: [0, 0, 0, 0], sampleRate: 100) : nil,
            last: initialPieces ? .init(samples: [0, 0.25], sampleRate: 100) : nil, stopFails: stopFails)
        let pieces = SessionPieces(
            folder: CallFolder(callsURL: root, now: { Date(timeIntervalSince1970: 0) }, timeZone: TimeZone(secondsFromGMT: 0)!),
            processes: CallAppProcesses(app: "meeting", list: SessionProcessList(answer: .success([]))),
            startMicrophone: { microphone.start() }, startCall: { _ in call.start() },
            microphoneRecognizerSource: { preconditionFailure("Live text is disabled") },
            callRecognizerSource: { preconditionFailure("Live text is disabled") },
            missingModels: { [] }, monotonicNow: { clock.now() }, recordingTrack: { _, _ in StatisticsTrack() })
        if initialPieces {
            let folder = try await pieces.create()
            try await pieces.openTrack(.microphone, in: folder)
            try await pieces.openTrack(.call, in: folder)
        }
        let result: Result<Void, any Error>
        do { result = .success(try await body(.init(pieces: pieces, microphone: microphone, call: call))) }
        catch { result = .failure(error) }
        for side in [SessionSide.microphone, .call] {
            try? await pieces.stopCapture(side)
            try await pieces.closeTrack(side)
        }
        try await pieces.closeTranscript()
        try result.get()
    }
}

private final class StatisticsLog: LogSink {
    let states = Values<LogEntry>()
    func write(_ entry: LogEntry) {
        if entry.category == .session && entry.message.hasPrefix("state ") { states.append(entry) }
    }
}
