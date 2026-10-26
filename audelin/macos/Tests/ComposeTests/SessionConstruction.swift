import struct CallText.State
import Foundation
import LiveAudio
import Session
import struct SideText.Audio
import TrackFile
import TranscriptFile
import protocol TranscriptWriting.CallText
@testable import Compose

struct SessionConstruction: Sendable {

    var executor: (any TaskExecutor)?
    var recordingTrack: @Sendable (SessionSide, TrackFile) -> any RecordingTrack = { _, track in CaptureTrack(track: track) }
    var closeTrack: @Sendable (SessionSide, TrackFile) async throws -> Void = { _, track in try await track.close() }
    var makeCaptureAudio: @Sendable (SessionSide, LiveAudio) -> any CaptureAudio = { _, live in LiveCaptureAudio(capture: live) }
    var openTranscript: @Sendable (URL) throws -> any SessionTranscriptFile = { try WritingTranscript(file: TranscriptFile(url: $0)) }
    var makeCallText: @Sendable (CallReader) -> any TranscriptWriting.CallText<State> = { WritingCallText(text: $0) }
}

/// Forwards the real text and holds start until both sides are listening.
final class ReadyCallText: TranscriptWriting.CallText, Sendable {

    let updates: AsyncStream<State>
    private let text: CallReader
    private let ready = Signal()
    private let forwarding: Task<Void, Never>
    private let afterStart: @Sendable () async -> Void

    init(text: CallReader, afterStart: @escaping @Sendable () async -> Void = {}) {

        self.text = text
        self.afterStart = afterStart
        let output = AsyncStream<State>.makeStream(bufferingPolicy: .bufferingNewest(1))
        updates = output.stream
        let ready = ready
        forwarding = Task {
            for await state in text.updates {
                output.continuation.yield(state)
                if state.status == .listening { ready.send() }
            }
            output.continuation.finish()
            ready.end()
        }
    }

    func start(enabled: Bool) async {

        await text.start(enabled: enabled)
        if enabled { await ready.next() }
        await afterStart()
    }

    func setEnabled(_ enabled: Bool) async { await text.setEnabled(enabled) }
    func stop() async { await text.stop(); await forwarding.value }

    deinit { forwarding.cancel(); ready.end() }
}

struct HeldCaptureAudio: CaptureAudio {

    let base: any CaptureAudio
    let release: @Sendable () async -> Void

    var capturedThrough: Double { base.capturedThrough }

    func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async {

        await release()
        await base.listen(receive)
    }
}

struct ControlledTranscript: SessionTranscriptFile {

    let base: any SessionTranscriptFile
    let beforeWrite: @Sendable (State) async throws -> Void

    func write(_ state: State) async throws {

        try await beforeWrite(state)
        try await base.write(state)
    }

    func close() async { await base.close() }
}
