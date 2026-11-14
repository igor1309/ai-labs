import Testing
import TranscriptFinalization

typealias Handler = TranscriptFinalizationEffectHandler<String, String, String, String, String>

@Suite(.timeLimit(.minutes(1)))
struct TranscriptFinalizationEffectHandlerTests {

    @Test func diarizeDeliversTheAttributedFarSide() async {
        let (sut, spies) = makeHandler()
        await expect(sut, with: .diarize(call: callID, "raw"), toDeliver: .diarized(call: callID, "far"), on: {
            await spies.diarizing.complete(with: "far")
        })
        #expect(await spies.diarizing.payloads == [.init(call: callID, raw: "raw")])
    }

    @Test func failedDiarizationDeliversNoFarSide() async {
        let (sut, spies) = makeHandler()
        await expect(sut, with: .diarize(call: callID, "raw"), toDeliver: .diarized(call: callID, nil), on: {
            await spies.diarizing.complete(with: nil)
        })
    }

    @Test func cleanDeliversTheHeardMicrophoneSide() async {
        let (sut, spies) = makeHandler()
        await expect(sut, with: .clean(call: callID, "raw", "far"), toDeliver: .cleaned(call: callID, "heard"), on: {
            await spies.cleanup.complete(with: "heard")
        })
        #expect(await spies.cleanup.payloads == [.init(call: callID, raw: "raw", far: "far")])
    }

    @Test func keptMicrophoneDeliversNothingHeard() async {
        let (sut, spies) = makeHandler()
        await expect(sut, with: .clean(call: callID, "raw", nil), toDeliver: .cleaned(call: callID, nil), on: {
            await spies.cleanup.complete(with: nil)
        })
    }

    @Test func commitDeliversSuccessOnceReplaced() async {
        let (sut, spies) = makeHandler()
        await expect(sut, with: .commit(call: callID, "raw", "names", "far", "heard"), toDeliver: .committed(call: callID, succeeded: true), on: {
            await spies.replacement.complete(with: .success(()))
        })
        #expect(await spies.replacement.payloads == [.init(call: callID, raw: "raw", names: "names", far: "far", heard: "heard")])
    }

    @Test func failedReplacementDeliversFailure() async {
        let (sut, spies) = makeHandler()
        await expect(sut, with: .commit(call: callID, "raw", nil, nil, "heard"), toDeliver: .committed(call: callID, succeeded: false), on: {
            await spies.replacement.complete(with: .failure(Refused()))
        })
    }

    @Test func publishHandsEveryFinalOverAndDeliversPublished() async {
        let (sut, spies) = makeHandler()
        let finals = ["a": FinalTranscript(entries: ["e"], usable: true, finalWrite: true),
                      "b": FinalTranscript<String>(entries: [], usable: false, finalWrite: false)]
        async let event = sut.handle(.publish(finals))
        await spies.finals.complete(with: ())
        #expect(await event == .published(calls: ["a", "b"]))
        #expect(await spies.finals.payloads == [finals])
    }

    /// Cleanup work stops before the calls are published as written.
    @Test func stopCleaningStopsEachCallsCleanupThenPublishes() async {
        let (sut, spies) = makeHandler()
        let finals = ["a": FinalTranscript(entries: ["e"], usable: true, finalWrite: true),
                      "b": FinalTranscript(entries: ["f"], usable: true, finalWrite: true)]
        async let event = sut.handle(.stopCleaning(finals))
        await spies.stops.complete(with: ())
        #expect(await spies.finals.payloads.isEmpty)
        await spies.stops.complete(with: ())
        await spies.finals.complete(with: ())
        #expect(await event == .published(calls: ["a", "b"]))
        #expect(await spies.stops.payloads == ["a", "b"])
        #expect(await spies.finals.payloads == [finals])
    }
}

private struct Refused: Error {}

private struct Diarized: Equatable { let call: String; let raw: String }
private struct Cleaned: Equatable { let call: String; let raw: String; let far: String? }
private struct Replaced: Equatable { let call: String; let raw: String; let names: String?; let far: String?; let heard: String }

private struct Spies {
    let diarizing = Spy<Diarized, String?>()
    let cleanup = Spy<Cleaned, String?>()
    let stops = Spy<String, Void>()
    let replacement = Spy<Replaced, Result<Void, Refused>>()
    let finals = Spy<[String: FinalTranscript<String>], Void>()
}

private func makeHandler() -> (Handler, Spies) {
    let spies = Spies()
    return (Handler(diarizing: Diarizing(spy: spies.diarizing), cleanup: Cleanup(spy: spies.cleanup, stops: spies.stops),
                    replacement: Replacement(spy: spies.replacement), finals: Finals(spy: spies.finals)), spies)
}

/// Handles `effect`, runs `action` once the handler waits on a collaborator, and expects `expected` back.
private func expect(
    _ sut: Handler, with effect: Effect, toDeliver expected: Event,
    on action: @escaping @Sendable () async -> Void, sourceLocation: SourceLocation = #_sourceLocation
) async {
    async let event = sut.handle(effect)
    await action()
    #expect(await event == expected, sourceLocation: sourceLocation)
}

private struct Diarizing: TranscriptDiarizing {
    let spy: Spy<Diarized, String?>
    func diarize(call: String, _ raw: String) async -> String? { await spy.call(.init(call: call, raw: raw)) }
}

private struct Cleanup: MicrophoneCleanup {
    let spy: Spy<Cleaned, String?>
    let stops: Spy<String, Void>
    func clean(call: String, _ raw: String, far: String?) async -> String? { await spy.call(.init(call: call, raw: raw, far: far)) }
    func stop(call: String) async { await stops.call(call) }
}

private struct Replacement: TranscriptReplacement {
    let spy: Spy<Replaced, Result<Void, Refused>>
    func replace(call: String, _ raw: String, names: String?, far: String?, heard: String) async throws {
        try await spy.call(.init(call: call, raw: raw, names: names, far: far, heard: heard)).get()
    }
}

private struct Finals: FinalTranscripts {
    let spy: Spy<[String: FinalTranscript<String>], Void>
    func publish(_ finals: [String: FinalTranscript<String>]) async { await spy.call(finals) }
}

/// Holds each call until the test completes it; completing waits for the call.
private actor Spy<Payload: Sendable, Value: Sendable> {

    private(set) var payloads: [Payload] = []
    private var pending: [CheckedContinuation<Value, Never>] = []
    private var completers: [CheckedContinuation<Void, Never>] = []

    func call(_ payload: Payload) async -> Value {
        payloads.append(payload)
        return await withCheckedContinuation { continuation in
            pending.append(continuation)
            for completer in completers { completer.resume() }
            completers.removeAll()
        }
    }

    func complete(with value: Value) async {
        while pending.isEmpty { await withCheckedContinuation { completers.append($0) } }
        pending.removeFirst().resume(returning: value)
    }
}
