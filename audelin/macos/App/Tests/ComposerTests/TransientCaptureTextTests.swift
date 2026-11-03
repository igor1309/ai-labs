import Composer
import LiveText
import PanelUI
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct TransientCaptureTextTests {
    /// A transient capture writes no track, so there is nothing to fill in from: audio
    /// captured while the recognizer gets ready must still be heard, live.
    @Test func audioCapturedBeforeTheRecognizerIsReadyIsHeardLive() async throws {
        let microphone = FedCapture(), call = FedCapture()
        defer { microphone.end(); call.end() }
        let ready = Signal()
        try await withComposition(recognizers: (Saying("hello."), Saying(nil)), configure: { boundary in
            boundary.capturePersistence = .transient
            boundary.recognizers = HeldMicrophone(base: boundary.recognizers, ready: ready)
            boundary.microphone = FixtureMicrophone { microphone.started }
            boundary.callAudio = FixtureCallAudio { _ in call.started }
        }) { rig in
            try await rig.start()
            // A warning that the call is silent while the microphone speaks is
            // measured only from audio already captured on both sides.
            call.send(Array(repeating: 0, count: 15_001), rate: 50)
            microphone.send(Array(repeating: 0.5, count: 15_001), rate: 50)
            _ = try await rig.state { $0.callSilent }
            ready.send()
            _ = try await rig.panel { entries(of: $0).contains { $0.speaker == .me && $0.pending == "hello." } }
            try await rig.stop()
        }
    }
}

/// Holds the microphone's recognizer until the test lets it get ready.
private struct HeldMicrophone: RecognizerSource {
    let base: any RecognizerSource
    let ready: Signal

    func recognizer(for side: ComposerSide) async throws -> any SpeechRecognizer {
        if side == .microphone { await ready.next() }
        return try await base.recognizer(for: side)
    }
    func missingModels() -> [String] { base.missingModels() }
    func startLoading() -> Task<Void, any Error> { base.startLoading() }
}

/// Hears one word, or nothing, in every chunk.
private struct Saying: Recognizer {
    let word: String?

    init(_ word: String?) { self.word = word }

    func hear(_ chunk: AudioChunk) async throws -> Hearing {
        Hearing(words: word.map { [Word($0, start: 1, end: 2)] } ?? [])
    }
    func finish() async throws -> Hearing { Hearing(words: []) }
}
