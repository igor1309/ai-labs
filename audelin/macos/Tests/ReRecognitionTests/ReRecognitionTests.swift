import ReRecognition
import Testing

@Suite struct ReRecognitionTests {
    @Test func aCallIsMadeInOrder() async {
        let spy = Spy()
        #expect(await spy.run() == .made)
        let far = [R.Speaker(id: 7, name: nil, words: [word("split")])]
        #expect(spy.calls == [
            .wait(.preparing), .hear("far-track"),
            .wait(.hearing(0)), .wait(.hearing(0.25)), .wait(.hearing(0.5)), .returned(.hearFar),
            .hear("mic-track"), .wait(.hearing(0.75)), .wait(.hearing(1)),
            .returned(.hearMicrophone), .wait(.finishing),
            .split(original, [word("far-track")]), .returned(.split),
            .clean(original, [word("mic-track")], far), .returned(.clean),
            .read("current"), .returned(.read), .names([], far),
            .publish("current", expectedTranscript()), .returned(.publish), .outcome(.made),
        ])
    }

    @Test func preparingIsReportedFirst() async {
        let spy = Spy(held: .hearFar)
        let task = Task { await spy.run() }
        await spy.gate.waitUntilEntered()
        #expect(spy.calls == [.wait(.preparing), .hear("far-track")])
        await spy.gate.release()
        #expect(await task.value == .made)
    }

    @Test(arguments: [Answer.nothing, .failed])
    func aSplitThatKeepsNothingStillPublishes(answer: Answer) async {
        let spy = Spy(split: answer)
        #expect(await spy.run() == .made)
        #expect(spy.publications == [expectedTranscript(split: false)])
        #expect(spy.calls.contains(.clean(original, [word("mic-track")], [
            .init(id: 0, name: nil, words: [word("far-track")]),
        ])))
    }

    @Test(arguments: [Answer.nothing, .failed])
    func aCleanThatKeepsNothingStillPublishes(answer: Answer) async {
        let spy = Spy(clean: answer)
        #expect(await spy.run() == .made)
        #expect(spy.publications == [expectedTranscript(cleaned: false)])
    }

    @Test func carriedNamesArePublished() async {
        let old = [R.OldSpeaker(name: "Anna", ranges: [.init(start: -2, end: 3), .init(start: 19, end: 25)])]
        let spy = Spy(old: old, carried: [7: "Anna"])
        #expect(await spy.run() == .made)
        #expect(spy.publications == [expectedTranscript(name: "Anna")])
        #expect(spy.calls.contains(.names([
            .init(name: "Anna", ranges: [.init(start: 0, end: 3), .init(start: 19, end: 20)]),
        ], [.init(id: 7, name: nil, words: [word("split")])])))
    }

    @Test(arguments: ["far-track", "mic-track"])
    func aTrackThatCannotBeHeardFails(track: String) async {
        let spy = Spy(failure: .hearing, hearingFailureTrack: track)
        #expect(await spy.run() == .failed(original: "original", reason: "hearing"))
        #expect(spy.publications.isEmpty)
        #expect(!spy.calls.contains { if case .split = $0 { true } else { false } })
    }

    @Test(arguments: [Stage.hearFar, .hearMicrophone, .split, .clean, .read])
    func stoppingPublishesNothing(stage: Stage) async {
        let spy = Spy(held: stage)
        let task = Task { await spy.run() }
        await spy.gate.waitUntilEntered()
        task.cancel()
        #expect(!spy.calls.contains(.outcome(.stopped)))
        await spy.gate.release()
        #expect(await task.value == .stopped)
        #expect(spy.publications.isEmpty)
        #expect(Array(spy.calls.suffix(2)) == [.returned(stage), .outcome(.stopped)])
    }

    @Test func aFailedPublishFails() async {
        let spy = Spy(failure: .publishing)
        #expect(await spy.run() == .failed(original: "original", reason: "publishing"))
        #expect(spy.publications == [expectedTranscript()])
    }

    @Test func theModelsFailToLoad() async {
        let spy = Spy(failure: .loading)
        #expect(await spy.run() == .failed(original: "original", reason: "loading"))
        #expect(spy.calls == [.wait(.preparing), .hear("far-track"), .returned(.hearFar),
                             .outcome(.failed(original: "original", reason: "loading"))])
    }

    @Test func aStopDuringPublishingReportsMade() async {
        let spy = Spy(held: .publish)
        let task = Task { await spy.run() }
        await spy.gate.waitUntilEntered()
        task.cancel()
        await spy.gate.release()
        #expect(await task.value == .made)
        #expect(spy.publications == [expectedTranscript()])
        #expect(Array(spy.calls.suffix(2)) == [.returned(.publish), .outcome(.made)])
    }

    @Test func aStopDuringFailedPublishingReportsFailure() async {
        let spy = Spy(failure: .publishing, held: .publish)
        let task = Task { await spy.run() }
        await spy.gate.waitUntilEntered()
        task.cancel()
        await spy.gate.release()
        #expect(await task.value == .failed(original: "original", reason: "publishing"))
    }

    @Test func noOldTranscriptCarriesNoNames() async {
        let spy = Spy(failure: .reading, old: [.init(name: "unread", ranges: [.init(start: 1, end: 3)])])
        #expect(await spy.run() == .made)
        #expect(spy.publications == [expectedTranscript()])
        #expect(spy.calls.contains(.names([], [.init(id: 7, name: nil, words: [word("split")])])))
    }

    @Test func fractionsOnlyRiseAcrossBothTracks() async {
        let spy = Spy(fractions: [0, 0.8, 0.2, .nan, .infinity, -1, 2])
        #expect(await spy.run() == .made)
        let waits = spy.calls.compactMap { if case let .wait(wait) = $0 { wait } else { nil } }
        #expect(waits == [.preparing, .hearing(0), .hearing(0.4), .hearing(0.5),
                          .hearing(0.9), .hearing(1), .finishing])
    }

    @Test func finishingLastsUntilPublicationReturns() async {
        let spy = Spy(held: .publish)
        let task = Task { await spy.run() }
        await spy.gate.waitUntilEntered()
        let waits = spy.calls.compactMap { if case let .wait(wait) = $0 { wait } else { nil } }
        #expect(waits.last == .finishing)
        #expect(!spy.calls.contains(.outcome(.made)))
        await spy.gate.release()
        #expect(await task.value == .made)
    }

    @Test func realNameCarryUsesSpeakerTimes() async {
        let spy = Spy(old: [.init(name: "Anna", ranges: [.init(start: 1, end: 3)])])
        #expect(await spy.run(spy.component(names: R.carryNames)) == .made)
        #expect(spy.publications == [expectedTranscript(name: "Anna")])
    }

    @Test func realNameCarryLeavesAmbiguousSpeakersUnnamed() {
        let old = [R.OldSpeaker(name: "Anna", ranges: [.init(start: 0, end: 4)])]
        let new = [R.Speaker(id: 1, name: nil, words: [word("first", 0, 2)]),
                   R.Speaker(id: 2, name: nil, words: [word("second", 2, 4)])]
        #expect(R.carryNames(old: old, new: new) == [:])
    }

    @Test(arguments: [0, 2])
    func joiningIsRejectedBeforeAnyPort(count: Int) async {
        let spy = Spy()
        #expect(await spy.run(originals: Array(repeating: original, count: count)) ==
                .failed(original: nil, reason: "Exactly one original call is supported."))
        #expect(spy.calls == [.outcome(.failed(original: nil, reason: "Exactly one original call is supported."))])
    }

    @Test func runsKeepNothingBetweenThem() async {
        let spy = Spy()
        let sut = spy.component()
        #expect(await spy.run(sut) == .made)
        #expect(await spy.run(sut) == .made)
        #expect(spy.publications == [expectedTranscript(), expectedTranscript()])
    }
}
