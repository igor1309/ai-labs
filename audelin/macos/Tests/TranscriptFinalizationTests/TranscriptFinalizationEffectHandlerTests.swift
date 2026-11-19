import Testing
import TranscriptFinalization

typealias Handler = TranscriptFinalizationEffectHandler<String, String, String, String, String>

@Suite(.timeLimit(.minutes(1)))
struct TranscriptFinalizationEffectHandlerTests {

    @Test func diarizeDeliversTheAttributedFarSide() async {
        let (sut, spies) = makeHandler()
        await expect(sut, with: .diarize(call: callID, "raw", .init()), toDeliver: .diarized(call: callID, .init(far: "far", diarizer: "nemotron")), on: {
            await spies.diarizing.complete(with: .init(far: "far", diarizer: "nemotron"))
        })
        #expect(await spies.diarizing.payloads == [.init(call: callID, raw: "raw", outcomes: .init())])
    }

    @Test func failedDiarizationDeliversNoFarSide() async {
        let (sut, spies) = makeHandler()
        await expect(sut, with: .diarize(call: callID, "raw", .init()), toDeliver: .diarized(call: callID, nil), on: {
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
        await expect(sut, with: .commit(call: callID, "raw", "names", "far", "heard", .init(cleaning: .done)), toDeliver: .committed(call: callID, succeeded: true), on: {
            await spies.replacement.complete(with: .success(()))
        })
        #expect(await spies.replacement.payloads == [.init(call: callID, raw: "raw", names: "names", far: "far", heard: "heard", outcomes: .init(cleaning: .done))])
    }

    @Test func failedReplacementDeliversFailure() async {
        let (sut, spies) = makeHandler()
        await expect(sut, with: .commit(call: callID, "raw", nil, nil, "heard", .init(cleaning: .done)), toDeliver: .committed(call: callID, succeeded: false), on: {
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

    @Test(arguments: ["nemotron", "vbx", "failed", "names-only"], [false, true])
    func finishingCommitCarriesOutcomesAndWaitsForReplacement(split: String, heard: Bool) async {
        for succeeds in [false, true] {
        let (handler, spies) = makeHandler()
        let reducer = makeSUT().sut
        let initial = makeState(makeCall())
        let (diarizing, diarize) = reducer.reduce(initial, .closed(call: callID, names: "names"))
        async let splitEvent = handler.handle(diarize!)
        let saved: SavedDiarization<String>? = split == "failed" ? nil : .init(far: "far", diarizer: split == "names-only" ? nil : split)
        await spies.diarizing.complete(with: saved)
        #expect(await spies.diarizing.payloads == [.init(call: callID, raw: "raw", outcomes: .init())])
        let (cleaning, clean) = reducer.reduce(diarizing, await splitEvent)
        async let cleanEvent = handler.handle(clean!)
        await spies.cleanup.complete(with: heard ? "heard" : nil)
        let (committing, commit) = reducer.reduce(cleaning, await cleanEvent)
        async let commitEvent = handler.handle(commit!)
        await spies.replacement.waitForCall()
        #expect(await spies.finals.payloads.isEmpty)
        await spies.replacement.complete(with: succeeds ? .success(()) : .failure(Refused()))
        #expect(await spies.finals.payloads.isEmpty)
        let outcome = FinishingOutcomes(split: split == "failed" || split == "names-only" ? .nothingKept : .done(diarizer: split),
                                        cleaning: heard ? .done : .nothingKept)
        #expect(await spies.replacement.payloads == [.init(call: callID, raw: "raw", names: "names", far: saved?.far,
                                                          heard: heard ? "heard" : nil, outcomes: outcome)])
        let (_, publish) = reducer.reduce(committing, await commitEvent)
        async let publishedEvent = handler.handle(publish!)
        await spies.finals.complete(with: ())
        #expect(await publishedEvent == .published(calls: [callID]))
        #expect(await spies.finals.payloads == [[callID: final()]])
        #expect(await spies.replacement.payloads.count == 1)
        }
    }

    /// Every cleanup stops before any replacement begins; publication follows the reducer's commit result.
    @Test func stopCleaningStopsEachCallThenCommits() async {
        let (sut, spies) = makeHandler()
        let outcomes = FinishingOutcomes(split: .done(diarizer: "vbx"), cleaning: .skipped)
        let commits = ["a": commit("ra", outcomes: outcomes), "b": commit("rb", outcomes: outcomes)]
        async let event = sut.handle(.stopCleaning(commits))
        await spies.stops.complete(with: ())
        #expect(await spies.replacement.payloads.isEmpty)
        await spies.stops.complete(with: ())
        await spies.replacement.complete(with: .success(()))
        await spies.replacement.complete(with: .failure(Refused()))
        #expect(await event == .committedCalls(["a": true, "b": false]))
        #expect(await spies.stops.payloads == ["a", "b"])
        #expect(await spies.replacement.payloads == [
            .init(call: "a", raw: "ra", names: nil, far: nil, heard: nil, outcomes: outcomes),
            .init(call: "b", raw: "rb", names: nil, far: nil, heard: nil, outcomes: outcomes)])
        #expect(await spies.finals.payloads.isEmpty)
    }

}

private struct Refused: Error {}

private struct Diarized: Equatable { let call: String; let raw: String; let outcomes: FinishingOutcomes }
private struct Cleaned: Equatable { let call: String; let raw: String; let far: String? }
private struct Replaced: Equatable { let call: String; let raw: String; let names: String?; let far: String?; let heard: String?; let outcomes: FinishingOutcomes }

private struct Spies {
    let diarizing = Spy<Diarized, SavedDiarization<String>?>()
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
    let spy: Spy<Diarized, SavedDiarization<String>?>
    func diarize(call: String, _ raw: String, outcomes: FinishingOutcomes) async -> SavedDiarization<String>? { await spy.call(.init(call: call, raw: raw, outcomes: outcomes)) }
}

private struct Cleanup: MicrophoneCleanup {
    let spy: Spy<Cleaned, String?>
    let stops: Spy<String, Void>
    func clean(call: String, _ raw: String, far: String?) async -> String? { await spy.call(.init(call: call, raw: raw, far: far)) }
    func stop(call: String) async { await stops.call(call) }
}

private struct Replacement: TranscriptReplacement {
    let spy: Spy<Replaced, Result<Void, Refused>>
    func replace(call: String, _ raw: String, names: String?, far: String?, heard: String?, outcomes: FinishingOutcomes) async throws {
        try await spy.call(.init(call: call, raw: raw, names: names, far: far, heard: heard, outcomes: outcomes)).get()
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

    func waitForCall() async {
        while pending.isEmpty { await withCheckedContinuation { completers.append($0) } }
    }

    func complete(with value: Value) async {
        await waitForCall()
        pending.removeFirst().resume(returning: value)
    }
}
