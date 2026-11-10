import BleedCleanup
import Testing

@Suite struct BleedCleanupTests {

    private let recording = "ended-call"
    private let samples: [Float] = [0.25, -0.5, 0.75]
    private let heard = "My own words after cleaning."
    private let raw = Transcript(call: "The far side's words.", microphone: "Raw microphone with bleed.")
    private let call = [Word(start: 10, text: "the"), Word(start: 11, text: "far"),
                        Word(start: 12, text: "side"), Word(start: 13, text: "speaks")]

    @Test(arguments: [false, true])
    func aCallWithoutBleedIsKeptAsRecorded(sharedWordsOutsideWindow: Bool) async {

        let fixture = Fixture(
            gate: BleedGate(), transcript: raw, cleaning: .success(samples),
            hearing: .success(heard), replacing: .success(())
        )
        let microphone = sharedWordsOutsideWindow
            ? call.map { Word(start: $0.start + 3, text: $0.text) }
            : [Word(start: 10, text: "my"), Word(start: 11, text: "answer")]

        let outcome = await fixture.subject.run(recording: recording, microphone: microphone, call: call, duration: 60)

        guard case .kept(.noBleedFound) = outcome else {
            Issue.record("Expected the raw transcript with no bleed found")
            return
        }
        #expect(await fixture.replacing.transcript == raw)
        #expect(await fixture.cleaning.recordings == [])
        #expect(await fixture.hearing.samples == [])
        #expect(await fixture.replacing.replacements == [])
    }

    @Test func aCallWithBleedHasItsMicrophoneSideReplaced() async {

        let fixture = Fixture(
            gate: BleedGate(), transcript: raw, cleaning: .success(samples),
            hearing: .success(heard), replacing: .success(())
        )

        let outcome = await fixture.subject.run(recording: recording, microphone: call, call: call, duration: 60)

        guard case .replaced = outcome else {
            Issue.record("Expected a replaced microphone side")
            return
        }
        #expect(await fixture.replacing.transcript == Transcript(call: raw.call, microphone: heard))
        #expect(await fixture.cleaning.recordings == [recording])
        #expect(await fixture.hearing.samples == [samples])
        #expect(await fixture.replacing.replacements == [Replacement(recording: recording, text: heard)])
    }

    @Test func aCallOfNoLengthIsKeptAsRecorded() async {

        let fixture = Fixture(
            gate: BleedGate(), transcript: raw, cleaning: .success(samples),
            hearing: .success(heard), replacing: .success(())
        )

        let outcome = await fixture.subject.run(recording: recording, microphone: call, call: call, duration: 0)

        guard case .kept(.noBleedFound) = outcome else {
            Issue.record("Expected no bleed found for a call of no length")
            return
        }
        #expect(await fixture.replacing.transcript == raw)
        #expect(await fixture.cleaning.recordings == [])
        #expect(await fixture.hearing.samples == [])
        #expect(await fixture.replacing.replacements == [])
    }

    @Test func cleaningFailingKeepsTheRawTranscript() async {

        let failure = Failure(message: "cleaning could not read the tracks")
        let fixture = Fixture(
            gate: BleedGate(), transcript: raw, cleaning: .failure(failure),
            hearing: .success(heard), replacing: .success(())
        )

        let outcome = await fixture.subject.run(recording: recording, microphone: call, call: call, duration: 60)

        expectFailure(outcome, step: .cleaning, error: failure)
        #expect(await fixture.replacing.transcript == raw)
        #expect(await fixture.cleaning.recordings == [recording])
        #expect(await fixture.hearing.samples == [])
        #expect(await fixture.replacing.replacements == [])
    }

    @Test func hearingFailingKeepsTheRawTranscript() async {

        let failure = Failure(message: "hearing could not recognise the samples")
        let fixture = Fixture(
            gate: BleedGate(), transcript: raw, cleaning: .success(samples),
            hearing: .failure(failure), replacing: .success(())
        )

        let outcome = await fixture.subject.run(recording: recording, microphone: call, call: call, duration: 60)

        expectFailure(outcome, step: .hearing, error: failure)
        #expect(await fixture.replacing.transcript == raw)
        #expect(await fixture.cleaning.recordings == [recording])
        #expect(await fixture.hearing.samples == [samples])
        #expect(await fixture.replacing.replacements == [])
    }

    @Test func hearingNothingKeepsTheRawTranscript() async {

        let fixture = Fixture(
            gate: BleedGate(), transcript: raw, cleaning: .success(samples),
            hearing: .success(nil), replacing: .success(())
        )

        let outcome = await fixture.subject.run(recording: recording, microphone: call, call: call, duration: 60)

        guard case .kept(.nothingHeard) = outcome else {
            Issue.record("Expected the raw transcript because nothing was heard")
            return
        }
        #expect(await fixture.replacing.transcript == raw)
        #expect(await fixture.cleaning.recordings == [recording])
        #expect(await fixture.hearing.samples == [samples])
        #expect(await fixture.replacing.replacements == [])
    }

    @Test func replacingFailingKeepsTheRawTranscript() async {

        let failure = Failure(message: "replacement could not save the transcript")
        let fixture = Fixture(
            gate: BleedGate(), transcript: raw, cleaning: .success(samples),
            hearing: .success(heard), replacing: .failure(failure)
        )

        let outcome = await fixture.subject.run(recording: recording, microphone: call, call: call, duration: 60)

        expectFailure(outcome, step: .replacing, error: failure)
        #expect(await fixture.replacing.transcript == raw)
        #expect(await fixture.cleaning.recordings == [recording])
        #expect(await fixture.hearing.samples == [samples])
        #expect(await fixture.replacing.replacements == [Replacement(recording: recording, text: heard)])
    }

    @Test func theSuppliedGateDecidesWhetherToClean() async {

        let fixture = Fixture(
            gate: BleedGate(perMinute: 5), transcript: raw, cleaning: .success(samples),
            hearing: .success(heard), replacing: .success(())
        )

        let outcome = await fixture.subject.run(recording: recording, microphone: call, call: call, duration: 60)

        guard case .kept(.noBleedFound) = outcome else {
            Issue.record("Expected four leaked words to fall below the supplied gate's threshold")
            return
        }
        #expect(await fixture.replacing.transcript == raw)
        #expect(await fixture.cleaning.recordings == [])
        #expect(await fixture.hearing.samples == [])
        #expect(await fixture.replacing.replacements == [])
    }
}

private struct Transcript: Equatable, Sendable {
    var call: String
    var microphone: String
}

private struct Replacement: Equatable, Sendable {
    let recording: String
    let text: String
}

private struct Failure: Error, Equatable {
    let message: String
}

private struct Fixture {

    let cleaning: CleaningFake
    let hearing: HearingFake
    let replacing: ReplacingFake
    let subject: BleedCleanup<String, [Float], String>

    init(
        gate: BleedGate, transcript: Transcript, cleaning: Result<[Float], Failure>,
        hearing: Result<String?, Failure>, replacing: Result<Void, Failure>
    ) {

        self.cleaning = CleaningFake(result: cleaning)
        self.hearing = HearingFake(result: hearing)
        self.replacing = ReplacingFake(transcript: transcript, result: replacing)
        subject = BleedCleanup(gate: gate, cleaning: self.cleaning, hearing: self.hearing, replacing: self.replacing)
    }
}

private actor CleaningFake: MicrophoneCleaning {

    private let result: Result<[Float], Failure>
    private(set) var recordings: [String] = []

    init(result: Result<[Float], Failure>) {

        self.result = result
    }

    func clean(_ recording: String) async throws -> [Float] {

        recordings.append(recording)
        return try result.get()
    }
}

private actor HearingFake: CleanedHearing {

    private let result: Result<String?, Failure>
    private(set) var samples: [[Float]] = []

    init(result: Result<String?, Failure>) {

        self.result = result
    }

    func hear(_ samples: [Float]) async throws -> String? {

        self.samples.append(samples)
        return try result.get()
    }
}

private actor ReplacingFake: MicrophoneReplacing {

    private let result: Result<Void, Failure>
    private(set) var transcript: Transcript
    private(set) var replacements: [Replacement] = []

    init(transcript: Transcript, result: Result<Void, Failure>) {

        self.transcript = transcript
        self.result = result
    }

    func replaceMicrophone(of recording: String, with text: String) async throws {

        replacements.append(Replacement(recording: recording, text: text))
        try result.get()
        transcript.microphone = text
    }
}

private func expectFailure(
    _ outcome: CleanupOutcome, step: CleanupStep, error: Failure,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    guard case let .kept(.failed(actualStep, actualError)) = outcome else {
        Issue.record("Expected the raw transcript with a failed step", sourceLocation: sourceLocation)
        return
    }
    #expect(actualStep == step, sourceLocation: sourceLocation)
    #expect(actualError as? Failure == error, sourceLocation: sourceLocation)
}
