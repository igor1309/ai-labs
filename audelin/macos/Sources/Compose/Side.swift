import protocol CallText.Side
import struct CallText.SideState
import struct FillIn.Position
import struct FillIn.State
import struct FillIn.Audio
import struct FillIn.Text
import protocol FillIn.LiveAudioPosition
import protocol FillIn.LiveText
import protocol FillIn.WrittenTrack
import struct SideText.Audio
import struct SideText.Text
import struct SideText.TextUpdate
import struct SideText.State
import struct SideText.FilledText
import protocol SideText.LiveAudio
import protocol SideText.LiveText
import protocol SideText.FillingIn
import Synchronization

protocol TextEngine: Sendable {

    func prepare() async throws
    func hear(_ audio: SideText.Audio) async throws -> TrackText.Update
    func finish() async throws -> TrackText.Update
    func shutdown() async
}

extension TrackText: TextEngine {}

/// Connects a call side to its retained engine and a fresh fill-in on each switch.
struct CallSide: CallText.Side {

    private let side: SideReader

    init(audio: any SideText.LiveAudio, text: any TextEngine, written: any FillIn.WrittenTrack, sampleRate: Double) {

        let audio = SideAudio(source: audio)
        let hearing = SideHearing(text: text)
        side = SideReader(audio: audio, text: hearing, fillIn: {
            Filling(written: written, text: text, audio: audio, sampleRate: sampleRate)
        })
    }

    func start(enabled: Bool) async { await side.start(enabled: enabled) }

    func setEnabled(_ enabled: Bool) async { await side.setEnabled(enabled) }

    func stop() async { await side.stop() }

    func listen(_ receive: @escaping @Sendable (SideState) async -> Void) async {

        for await snapshot in side.updates.removingRepeats() {
            let status: SideState.Status = switch snapshot.status {
            case .off: .off
            case .fillingIn: .gettingReady
            case .listening: .listening
            case .finished: .finished
            case .failed(let failure): .failed(Self.message(failure))
            }
            await receive(SideState(status: status, entries: snapshot.entries.map {
                .init(text: .init(
                    id: $0.text.id, start: $0.text.start, end: $0.text.end,
                    settled: $0.text.settled, pending: $0.text.pending
                ), writtenLater: $0.writtenLater)
            }))
        }
    }

    private static func message(_ failure: SideText.State.Failure) -> String {

        switch failure {
        case .fillingIn(let message), .hearing(let message), .finishing(let message): message
        }
    }
}

private final class SideAudio: SideText.LiveAudio, FillIn.LiveAudioPosition, Sendable {

    let source: any SideText.LiveAudio
    private let ended = Mutex(false)

    init(source: any SideText.LiveAudio) { self.source = source }

    var capturedThrough: Double { source.capturedThrough }
    var position: Position { Position(capturedThrough: capturedThrough, ended: ended.withLock { $0 }) }

    func listen(_ receive: @escaping @Sendable (SideText.Audio) async -> Void) async {

        await source.listen(receive)
        if !Task.isCancelled { ended.withLock { $0 = true } }
    }
}

private actor SideHearing: SideText.LiveText {

    let text: any TextEngine
    private var hearing: Task<TextUpdate, any Error>?

    init(text: any TextEngine) { self.text = text }

    func hear(_ audio: SideText.Audio) async throws -> TextUpdate {

        let text = text
        let operation = Task {
            let update = try await text.hear(audio)
            return TextUpdate(final: update.final, tail: update.tail)
        }
        hearing = operation
        defer { hearing = nil }
        return try await withTaskCancellationHandler {
            try await operation.value
        } onCancel: { operation.cancel() }
    }

    func cancelHearing() async {

        hearing?.cancel()
        _ = await hearing?.result
    }

    func finish() async throws -> TextUpdate {

        let update = try await text.finish()
        return TextUpdate(final: update.final, tail: update.tail)
    }
    func stop() async { await text.shutdown() }
}

private struct FillHearing: FillIn.LiveText {

    let text: any TextEngine

    func prepare() async throws { try await text.prepare() }

    func hear(_ audio: FillIn.Audio) async throws -> [FillIn.Text] {

        try await text.hear(.init(start: audio.start, samples: audio.samples, sampleRate: audio.sampleRate)).all.map {
            .init(id: $0.id, start: $0.start, end: $0.end, settled: $0.settled, pending: $0.pending)
        }
    }
}

private struct Filling: SideText.FillingIn {

    private let fill: FillReader
    private let sampleRate: Double

    init(written: any FillIn.WrittenTrack, text: any TextEngine, audio: any FillIn.LiveAudioPosition, sampleRate: Double) {

        fill = FillReader(written: written, text: FillHearing(text: text), audio: audio)
        self.sampleRate = sampleRate
    }

    func fillIn(from: Double, receive: @escaping @Sendable (FilledText) async -> Void) async throws {

        await fill.start(from: from)
        for await snapshot in fill.updates {
            if snapshot.heardThrough > from {
                await receive(.init(text: snapshot.entries.map {
                    .init(id: $0.text.id, start: $0.text.start, end: $0.text.end,
                          settled: $0.text.settled, pending: $0.text.pending)
                }, heardThrough: snapshot.heardThrough, sampleRate: sampleRate))
            }
            if case let .failed(failure) = snapshot.status {
                await fill.waitForWork()
                throw FillFailure(failure: failure)
            }
        }
        await fill.waitForWork()
    }

    func abandon() async { await fill.abandon() }
}

private struct FillFailure: Error, CustomStringConvertible {

    let failure: FillIn.State.Failure
    var description: String {
        switch failure {
        case .gettingReady(let message), .reading(let message), .hearing(let message): message
        }
    }
}
