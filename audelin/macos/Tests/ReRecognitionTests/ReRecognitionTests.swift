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

    @Test(arguments: [1, 2])
    func finishingLastsUntilPublicationReturns(count: Int) async {
        let spy = Spy(held: .publish)
        let task = Task { await spy.run(originals: Array([original, second].prefix(count))) }
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

    @Test func emptyOriginalsAreRejectedBeforeAnyPort() async {
        let spy = Spy()
        #expect(await spy.run(originals: []) ==
                .failed(original: nil, reason: "At least one original call is required."))
        #expect(spy.calls == [.outcome(.failed(original: nil, reason: "At least one original call is required."))])
    }

    @Test func oneFractionOverEveryTrack() async {
        let spy = Spy(held: .split, fractions: [0, 0.5, 0.2, .nan, .infinity, -1])
        let task = Task { await spy.run(originals: [original, second]) }
        await spy.gate.waitUntilEntered()
        let hearing: [Call] = [
            .wait(.preparing), .hear("far-track"),
            .wait(.hearing(0)), .wait(.hearing(0.125)), .returned(.hearFar), .wait(.hearing(0.25)),
            .hear("mic-track"), .wait(.hearing(0.375)), .returned(.hearMicrophone), .wait(.hearing(0.5)),
            .hear("far-track-2"), .wait(.hearing(0.625)), .returned(.hearFar), .wait(.hearing(0.75)),
            .hear("mic-track-2"), .wait(.hearing(0.875)), .returned(.hearMicrophone), .wait(.hearing(1)),
            .wait(.finishing), .split(original, [word("far-track")]),
        ]
        #expect(spy.calls == hearing)
        #expect(spy.publications.isEmpty)
        await spy.gate.release()
        #expect(await task.value == .made)
        #expect(spy.calls.filter { if case .wait = $0 { true } else { false } } ==
                hearing.filter { if case .wait = $0 { true } else { false } })
    }

    @Test func mergedNamesComeOnlyFromTheCurrentTranscriptCutPerOriginal() async {
        let old = [
            R.OldSpeaker(name: "Anna", ranges: [.init(start: -2, end: 3), .init(start: 19, end: 52)]),
            R.OldSpeaker(name: nil, ranges: [.init(start: 51, end: 54)]),
            R.OldSpeaker(name: "In the gap", ranges: [.init(start: 20, end: 50)]),
            R.OldSpeaker(name: "After both", ranges: [.init(start: 60, end: 70)]),
        ]
        let spy = Spy(old: old)
        let sut = spy.component { clipped, _ in
            clipped[1].ranges.isEmpty ? [7: "carried first"] : [7: "carried second"]
        }
        #expect(await spy.run(sut, originals: [original, second]) == .made)
        let speakers = [R.Speaker(id: 7, name: nil, words: [word("split")])]
        #expect(spy.calls.filter { if case .read = $0 { true } else { false } } == [.read("current")])
        #expect(spy.calls.filter { if case .names = $0 { true } else { false } } == [
            .names([
                .init(name: "Anna", ranges: [.init(start: 0, end: 3), .init(start: 19, end: 20)]),
                .init(name: nil, ranges: []), .init(name: "In the gap", ranges: []),
                .init(name: "After both", ranges: []),
            ], speakers),
            .names([
                .init(name: "Anna", ranges: [.init(start: 0, end: 2)]),
                .init(name: nil, ranges: [.init(start: 1, end: 4)]), .init(name: "In the gap", ranges: []),
                .init(name: "After both", ranges: []),
            ], speakers),
        ])
        #expect(spy.publications.first?.originals.map { $0.far } == [
            [.init(id: 7, name: "carried first", words: [word("split")])],
            [.init(id: 7, name: "carried second", words: [word("split")])],
        ])
    }

    @Test(arguments: ["far-track-2", "mic-track-2", "far-track-3", "mic-track-3"])
    func aMergedCallNamesTheFailingOriginal(track: String) async {
        // A merge of a merge arrives as its ordered original calls, never nested containers.
        let originals = [original, second, third]
        let spy = Spy(failure: .hearing, hearingFailureTrack: track)
        let failed = track.hasSuffix("2") ? second : third
        #expect(await spy.run(originals: originals) == .failed(original: failed.id, reason: "hearing"))
        #expect(spy.publications.isEmpty)
        #expect(!spy.calls.contains { if case .split = $0 { true } else { false } })
        #expect(spy.calls.filter { if case .hear = $0 { true } else { false } }.last == .hear(track))
    }

    @Test func originalCallsAreJoined() async {
        // Flattened originals preserve a positive gap and an overlap for publish to join.
        let originals = [original, second, third]
        let spy = Spy(splits: [
            original.id: .init(speakers: [.init(id: 7, name: nil, words: [word("first new")])], diarizer: "first split"),
            second.id: .init(speakers: [.init(id: 7, name: nil, words: [word("second new", 0, 2)])], diarizer: "second split"),
            third.id: .init(speakers: [.init(id: 7, name: nil, words: [word("third new", 4, 6)])], diarizer: "third split"),
        ], cleans: [original.id: [word("first clean")], second.id: [], third.id: [word("third clean", 7, 8)]])
        #expect(await spy.run(originals: originals) == .made)
        let expected = R.Transcript(originals: [
            .init(original: original, far: [.init(id: 7, name: nil, words: [word("first new")])],
                  microphone: [word("first clean")], origin: .init(
                    build: build, farModel: "model-far-track", microphoneModel: "model-mic-track",
                    splitting: .done(diarizer: "first split"), cleaning: .done)),
            .init(original: second, far: [.init(id: 7, name: nil, words: [word("second new", 0, 2)])],
                  microphone: [], origin: .init(
                    build: build, farModel: "model-far-track-2", microphoneModel: "model-mic-track-2",
                    splitting: .done(diarizer: "second split"), cleaning: .done)),
            .init(original: third, far: [.init(id: 7, name: nil, words: [word("third new", 4, 6)])],
                  microphone: [word("third clean", 7, 8)], origin: .init(
                    build: build, farModel: "model-far-track-3", microphoneModel: "model-mic-track-3",
                    splitting: .done(diarizer: "third split"), cleaning: .done)),
        ], merger: build)
        #expect(spy.publications == [expected])
        let finishing = spy.calls.filter {
            switch $0 { case .split, .clean, .read, .names: true; default: false }
        }
        #expect(finishing == [
            .split(original, [word("far-track")]),
            .clean(original, [word("mic-track")], expected.originals[0].far),
            .split(second, [word("far-track-2")]),
            .clean(second, [word("mic-track-2")], expected.originals[1].far),
            .split(third, [word("far-track-3")]),
            .clean(third, [word("mic-track-3")], expected.originals[2].far),
            .read("current"), .names([], expected.originals[0].far),
            .names([], expected.originals[1].far), .names([], expected.originals[2].far),
        ])
        #expect(spy.calls.filter { if case .hear = $0 { true } else { false } } == [
            .hear("far-track"), .hear("mic-track"), .hear("far-track-2"), .hear("mic-track-2"),
            .hear("far-track-3"), .hear("mic-track-3"),
        ])
    }

    @Test func aFailedMergedPublishFailsTheWholeRun() async {
        let spy = Spy(failure: .publishing)
        #expect(await spy.run(originals: [original, second]) == .failed(original: nil, reason: "publishing"))
        #expect(spy.publications.count == 1)
        #expect(spy.publications.first?.originals.map(\.original) == [original, second])
    }

    @Test func runsKeepNothingBetweenThem() async {
        let spy = Spy()
        let sut = spy.component()
        #expect(await spy.run(sut) == .made)
        #expect(await spy.run(sut) == .made)
        #expect(spy.publications == [expectedTranscript(), expectedTranscript()])
    }
}
