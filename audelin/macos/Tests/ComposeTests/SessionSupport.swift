import BlockingTestWork
import AVFAudio
import CallAppProcesses
import CallFolder
import Foundation
import LiveText
import struct MicrophoneCapture.AudioPiece
import Session
import Synchronization
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection
import Testing
@testable import Compose

struct SessionProcessList: ProcessList {

    let answer: Result<[AudioProcess], ScriptFailure>

    func processes() throws -> [AudioProcess] { try answer.get() }
}

final class CaptureScript<Piece: Sendable>: Sendable {

    let source = AsyncThrowingStream<Piece, any Error>.makeStream()
    let starts = Values<Bool>()
    let stops = Values<Bool>()
    let stopped = Signal()
    let first: Piece
    let last: Piece
    let fails: Bool
    let stopFails: Bool
    let stopEndsStream: Bool
    let streamFails: Bool

    init(
        first: Piece, last: Piece, fails: Bool, stopFails: Bool = false, stopEndsStream: Bool = true,
        streamFails: Bool = false
    ) {

        self.first = first
        self.last = last
        self.fails = fails
        self.stopFails = stopFails
        self.stopEndsStream = stopEndsStream
        self.streamFails = streamFails
    }

    func start() throws -> StartedCapture<Piece> {

        starts.append(true)
        if fails { throw ScriptFailure.failed }
        if streamFails { source.continuation.finish(throwing: ScriptFailure.failed) }
        else { source.continuation.yield(first) }
        return StartedCapture(stream: source.stream, stop: {
            self.stops.append(true)
            self.source.continuation.yield(self.last)
            if self.stopEndsStream { self.source.continuation.finish() }
            self.stopped.send()
            if self.stopFails { throw ScriptFailure.failed }
        })
    }

    func end() { source.continuation.finish(); stopped.end() }
}

actor SessionRecognizer: Recognizer {

    let heard = Signal()
    let name: String
    let onHear: @Sendable () -> Void
    private(set) var chunks: [AudioChunk] = []
    private(set) var finishes = 0

    init(name: String, onHear: @escaping @Sendable () -> Void = {}) {

        self.name = name
        self.onHear = onHear
    }

    func hear(_ chunk: AudioChunk) -> Hearing {

        onHear()
        chunks.append(chunk)
        heard.send()
        return Hearing(words: [.init(name + " pending", start: 0, end: 1.0 / 48_000)])
    }

    func finish() -> Hearing {

        finishes += 1
        return Hearing(words: chunks.isEmpty ? [] : [.init(name + " final", start: 0, end: 1.0 / 48_000)])
    }
}

struct SessionRig: Sendable {

    let pieces: SessionPieces
    let session: SessionInputs
    let subscription: Task<Void, Never>
    let microphone: CaptureScript<MicrophoneCapture.AudioPiece>
    let call: CaptureScript<SystemAudioCapture.AudioPiece>
    let mine: SessionRecognizer
    let theirs: SessionRecognizer
    let selections = Values<SystemAudioCapture.ProcessSelection>()

    init(
        root: URL, microphoneFails: Bool, processesFail: Bool, construction: SessionConstruction,
        stopFailure: SessionSide?, stopEndsStream: Bool, streamFailure: SessionSide?, rates: [Double]?,
        recognizers: (any Recognizer, any Recognizer)?,
        connect: (@Sendable (SessionPieces, SessionInputs) -> Task<Void, Never>)? = nil,
        beforeForward: @escaping @Sendable (SessionEvent) async -> Void = { _ in },
        beforeMicrophoneStartReturns: @escaping @Sendable () async -> Void = {}
    ) async {

        let firstSamples = rates.map { Array(repeating: Float(0), count: Int($0[0] / 100)) }
        let lastSamples = rates.map { Array(repeating: Float(0), count: Int($0[1] / 100)) }
        microphone = CaptureScript(
            first: .init(samples: firstSamples ?? [0.25, -0.5], sampleRate: rates?[0] ?? 48_000),
            last: .init(samples: lastSamples ?? [0.125], sampleRate: rates?[1] ?? 48_000),
            fails: microphoneFails, stopFails: stopFailure == .microphone,
            stopEndsStream: stopFailure == .microphone ? stopEndsStream : true,
            streamFails: streamFailure == .microphone
        )
        call = CaptureScript(
            first: .init(samples: firstSamples ?? [-0.25, 0.5], sampleRate: rates?[0] ?? 48_000),
            last: .init(samples: lastSamples ?? [-0.125], sampleRate: rates?[1] ?? 48_000),
            fails: false, stopFails: stopFailure == .call,
            stopEndsStream: stopFailure == .call ? stopEndsStream : true,
            streamFails: streamFailure == .call
        )
        mine = SessionRecognizer(name: "mine")
        theirs = SessionRecognizer(name: "theirs")
        let microphone = microphone, call = call, selections = selections
        pieces = SessionPieces(
            folder: CallFolder(callsURL: root, now: { Date(timeIntervalSince1970: 0) }, timeZone: TimeZone(secondsFromGMT: 0)!),
            processes: CallAppProcesses(app: "meeting", list: SessionProcessList(answer: processesFail ? .failure(.failed) : .success([
                AudioProcess(pid: 72, bundleID: "meeting", name: "meeting", isAudelin: false),
                AudioProcess(pid: 73, bundleID: "meeting.helper", name: "meeting Helper", isAudelin: false),
                AudioProcess(pid: 99, bundleID: nil, name: "other", isAudelin: false),
            ]))),
            startMicrophone: {
                let started = try microphone.start()
                await beforeMicrophoneStartReturns()
                return started
            },
            startCall: { selection in selections.append(selection); return try call.start() },
            microphoneRecognizer: recognizers?.0 ?? mine, callRecognizer: recognizers?.1 ?? theirs,
            missingModels: { [] },
            executor: construction.executor, recordingTrack: construction.recordingTrack,
            closeTrack: construction.closeTrack, makeCaptureAudio: construction.makeCaptureAudio,
            openTranscript: construction.openTranscript, makeCallText: construction.makeCallText,
            transcriptPause: construction.transcriptPause
        )
        session = await makeSession(pieces.handler())
        subscription = connect?(pieces, session) ?? subscribe(pieces, to: session, beforeForward: beforeForward)
    }

    func state(where matches: (SessionState) -> Bool) async throws -> SessionState {

        for await state in await session.states() {
            try Task.checkCancellation()
            if matches(state) { return state }
        }
        throw ScriptFailure.failed
    }

    func finish() async {

        await session.send(.end)
        _ = try? await state { $0.phase == .ended }
        await session.end()
        subscription.cancel()
        await subscription.value
        microphone.end()
        call.end()
    }
}

func withSessionRig(
    microphoneFails: Bool = false, processesFail: Bool = false, construction: SessionConstruction = .init(),
    stopFailure: SessionSide? = nil, stopEndsStream: Bool = true, streamFailure: SessionSide? = nil, rates: [Double]? = nil,
    recognizers: (any Recognizer, any Recognizer)? = nil,
    connect: (@Sendable (SessionPieces, SessionInputs) -> Task<Void, Never>)? = nil,
    beforeForward: @escaping @Sendable (SessionEvent) async -> Void = { _ in },
    beforeMicrophoneStartReturns: @escaping @Sendable () async -> Void = {},
    _ body: (SessionRig, URL) async throws -> Void
) async throws {

    try await withComposeFolder { root in
        let rig = await SessionRig(
            root: root, microphoneFails: microphoneFails, processesFail: processesFail, construction: construction,
            stopFailure: stopFailure, stopEndsStream: stopEndsStream, streamFailure: streamFailure, rates: rates, recognizers: recognizers,
            connect: connect, beforeForward: beforeForward, beforeMicrophoneStartReturns: beforeMicrophoneStartReturns
        )
        do {
            try await body(rig, root.appendingPathComponent("1970.01.01-0000"))
            await rig.finish()
        } catch {
            await rig.finish()
            throw error
        }
    }
}

func recordedSamples(_ url: URL) async throws -> [Float] {

    try await audioFile(url).samples
}
