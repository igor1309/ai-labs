import struct CallText.State
import Foundation
import LiveAudio
import Session
import struct SideText.Audio
import TrackFile
import protocol TranscriptWriting.CallText
@testable import Compose

struct SessionConstruction: Sendable {

    var executor: (any TaskExecutor)?
    var recordingTrack: @Sendable (SessionSide, TrackFile) -> any RecordingTrack = SessionPieces.defaultRecordingTrack
    var closeTrack: @Sendable (SessionSide, TrackFile) async throws -> Void = SessionPieces.defaultCloseTrack
    var makeCaptureAudio: @Sendable (SessionSide, LiveAudio) -> any CaptureAudio = SessionPieces.defaultMakeCaptureAudio
    var openTranscript: @Sendable (URL) async throws -> any SessionTranscriptFile = SessionPieces.defaultOpenTranscript
    var makeCallText: @Sendable (CallReader) -> any TranscriptWriting.CallText<State> = SessionPieces.defaultMakeCallText
    /// The rig plays calls faster than real time, so its clock ends every pause at once.
    var transcriptClock: any Clock<Duration> = PassingClock()
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
