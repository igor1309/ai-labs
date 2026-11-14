import CallNames
import CallDiarizer
import CallText
import Foundation
import LiveText
import SummaryJobs
import Testing
import TranscriptFinalization
import TranscriptFormat
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1)))
struct TranscriptFinalizationPortsTests {
    enum CleanupCase: CaseIterable {
        case cleaned, noBleed, differentWordTimes, longRecording, silent, emptyWords, cleaningFails, hearingFails
    }

    @Test(arguments: CleanupCase.allCases)
    func cleanupReturnsOnlyTheHeardMicrophoneAndKeepsGateDecisionsAndLogs(scenario: CleanupCase) async throws {
        let call = line(scenario == .noBleed ? "their own speech" : "shared words here", start: 0)
        let timed = scenario == .differentWordTimes
            ? TranscriptSegment(id: 0, start: 0, end: 21, words: call.words.map {
                Word($0.text, start: $0.start + 20, end: $0.end + 20)
            }, settledCount: call.settledCount) : call
        let raw = try await publishedCall(status: .finished, mine: [.init(text: line("shared words here", start: 1))], theirs: [.init(text: timed)])
        let heard = [line("my actual answer", start: 3)]
        let cleaning = Values<CleanupRecording>(), hearing = Values<[Float]>()
        let log = FixtureLog(), bytes = FinalizationBytes()
        let names = RecordingNames()
        let opened = openedTranscript(bytes: bytes, names: names, diarizer: .unused, sink: log)
        let resources = FinalizationResources()
        let recording = CleanupRecording(microphoneURL: URL(fileURLWithPath: "/mic"), callURL: URL(fileURLWithPath: "/call"))
        resources.add(call: "a", transcript: opened, cleanup: TranscriptCleanup(recording: recording,
            duration: { scenario == .longRecording ? 120 : 60 }, cleaning: CleaningStub {
                cleaning.append($0)
                if scenario == .cleaningFails { throw FinalizationFailure.failed }
                return [0.25, -0.5]
            }, hearing: HearingStub {
                hearing.append($0)
                if scenario == .hearingFails { throw FinalizationFailure.failed }
                if scenario == .silent { return nil }
                if scenario == .emptyWords { return [.init(id: 0, start: 0, end: 1, words: [], settledCount: 0)] }
                return heard
            }, sink: log), speakers: { _ in }, finishReading: {})
        let sut = FinalizationCleanup(resources: resources)
        #expect(await sut.clean(call: "a", raw, far: nil) == (scenario == .cleaned ? heard : nil))
        #expect(await bytes.replacements.isEmpty)
        let gated = scenario != .noBleed && scenario != .differentWordTimes && scenario != .longRecording
        #expect(cleaning.all == (gated ? [recording] : []))
        #expect(hearing.all == (gated && scenario != .cleaningFails ? [[0.25, -0.5]] : []))
        let kept = log.entries.all.filter { $0.message.hasPrefix("bleed cleanup kept raw:") }
        if scenario == .cleaned { #expect(kept.isEmpty) }
        else if !gated { #expect(kept == [.init(category: .session, message: "bleed cleanup kept raw: no bleed found", level: .debug)]) }
        else if scenario == .silent || scenario == .emptyWords {
            #expect(kept == [.init(category: .session, message: "bleed cleanup kept raw: nothing heard")])
        } else {
            let step = scenario == .cleaningFails ? "cleaning" : "hearing"
            #expect(kept == [.init(category: .session, message: "bleed cleanup kept raw: \(step) failed", error: "failed")])
        }
        await resources.published(call: "a")
    }

    @Test(arguments: [false, true])
    func replacementRendersTheFarSideAndPropagatesFailure(fails: Bool) async throws {
        let raw = try await publishedCall(status: .finished, mine: [.init(text: line("raw mic", start: 1))],
                                          theirs: [.init(text: line("raw far", start: 0))])
        let bytes = FinalizationBytes(fails: fails), log = FixtureLog()
        let resources = FinalizationResources()
        add(call: "a", to: resources, opened: openedTranscript(bytes: bytes, names: RecordingNames(), diarizer: .unused, sink: log), sink: log)
        let sut = FinalizationReplacement(resources: resources)
        do {
            try await sut.replace(call: "a", raw, names: liveNames([0: "Boris"]), far: attributedFar, heard: [line("my answer", start: 3)])
            #expect(!fails)
        } catch { #expect(fails && error as? FinalizationFailure == .failed) }
        if fails {
            #expect(await bytes.replacements.isEmpty)
            #expect(log.entries.all == [.init(category: .session, message: "bleed cleanup kept raw: replacing failed", error: "failed")])
        } else {
            // The attributed far side names its own speakers; the names taken at close are not read.
            let text = try #require(await bytes.replacements.first)
            #expect(text.contains("**Them 1** 00:00:00\ntheir words"))
            #expect(text.contains("**Them 2** 00:00:02\nlater words"))
            #expect(text.contains("**Me** 00:00:03\nmy answer"))
            #expect(text.contains("- Them 1: Anna"))
            #expect(!text.contains("raw mic") && !text.contains("raw far") && !text.contains("Boris"))
        }
        await resources.published(call: "a")
    }

    /// Without attribution the replacement renders with the names the commit carries, not the ones the recording publishes later.
    @Test func replacementWithoutAttributionUsesTheNamesTakenAtClose() async throws {
        let raw = try await publishedCall(status: .finished, mine: [.init(text: line("raw mic", start: 1))],
                                          theirs: [.init(text: line("raw far", start: 0))])
        let bytes = FinalizationBytes(), log = FixtureLog(), names = RecordingNames()
        let resources = FinalizationResources()
        add(call: "a", to: resources, opened: openedTranscript(bytes: bytes, names: names, diarizer: .unused, sink: log), sink: log)
        names.published(liveNames([0: "Boris"]))
        try await FinalizationReplacement(resources: resources).replace(
            call: "a", raw, names: liveNames([0: "Anna"]), far: nil, heard: [line("my answer", start: 3)])
        let text = try #require(await bytes.replacements.first)
        #expect(text.contains("- Them: Anna") && !text.contains("Boris"))
        await resources.published(call: "a")
    }

    @Test nonisolated func diarizingUsesTheCallsPassAndPublishesTheSavedFarSide() async throws {
        try await withCallTrack { track in
            let names = RecordingNames(), bytes = FinalizationBytes(), log = FixtureLog()
            let samples = Values<Int>()
            let diarizer = CallDiarizer(binding: FinalizationDiarizer { samples.append($0.count) })
            let resources = await FinalizationResources()
            await add(call: "a", to: resources, opened: openedTranscript(bytes: bytes, names: names, track: track, diarizer: diarizer, sink: log), sink: log)
            let raw = try await publishedCall(status: .finished, mine: [], theirs: [
                .init(text: line("first", start: 0)), .init(text: line("second", start: 2)),
            ])
            let sut = FinalizationDiarizing(resources: resources)
            #expect(await sut.diarize(call: "missing", raw) == nil)
            #expect(samples.all.isEmpty)
            let far = try #require(await sut.diarize(call: "a", raw))
            #expect(far.rows == [0: 1, 2: 2])
            #expect(far.speakers.map(\.id) == ["d0", "d1"])
            #expect(samples.all == [160])
            let text = try #require(await bytes.replacements.first)
            #expect(text.contains("**Them 1** 00:00:00\nfirst"))
            #expect(text.contains("**Them 2** 00:00:02\nsecond"))
            await resources.published(call: "a")
        }
    }

    @Test func finalTranscriptsPublishesEachCallWithoutChangingItsFlagsOrEntries() async throws {
        let stream = AsyncStream<FinalTranscriptsPort.Publication>.makeStream()
        defer { stream.continuation.finish() }
        let sut = FinalTranscriptsPort(output: stream.continuation)
        let finals = ["a": FinalTranscript(entries: [Job.Entry(label: "Me", time: "3", text: "answer")], usable: true, finalWrite: true),
                      "b": FinalTranscript<Job.Entry>(entries: [], usable: false, finalWrite: false)]
        await sut.publish(finals)
        var iterator = stream.stream.makeAsyncIterator()
        var received: [String: FinalTranscript<Job.Entry>] = [:]
        for _ in finals { let value = try #require(await iterator.next()); received[value.call] = value.transcript }
        #expect(received == finals)
    }

    @Test func publishedCallReleasesItsHandlesAndFinishesOnlyItsReadingFeed() async throws {
        let resources = FinalizationResources(), log = FixtureLog()
        let finished = Values<String>(), rows = Values<[Int: Int]>()
        let opened = openedTranscript(bytes: FinalizationBytes(), names: RecordingNames(), diarizer: .unused, sink: log)
        resources.add(call: "a", transcript: opened, cleanup: unusedCleanup(sink: log),
                      speakers: { rows.append($0) }, finishReading: { finished.append("a") })
        resources.add(call: "b", transcript: opened, cleanup: unusedCleanup(sink: log),
                      speakers: { _ in Issue.record("wrong reading feed") }, finishReading: { finished.append("b") })
        await resources.showSpeakers(.init(calls: ["a": .init(stage: .cleaning, far: .init(far: [], speakers: [], rows: [4: 2]))]))
        #expect(rows.all == [[4: 2]])
        await resources.published(call: "a")
        #expect(resources.resource(call: "a") == nil)
        #expect(resources.resource(call: "b") != nil)
        #expect(finished.all == ["a"])
        await resources.published(call: "b")
        await resources.drain()
        #expect(finished.all == ["a", "b"])
    }
}

private let attributedFar = AttributedFar(
    far: [.init(side: .theirs, start: 0, settled: "their words", pending: "", speaker: "d0"),
          .init(side: .theirs, start: 2, settled: "later words", pending: "", speaker: "d1")],
    speakers: [.init(id: "d0", name: "Anna", state: "confirmed"), .init(id: "d1", name: nil, state: "diarized")])

private func line(_ text: String, start: Double) -> TranscriptSegment {
    let words = text.split(separator: " ").enumerated().map {
        Word(String($0.element), start: start + Double($0.offset) * 0.1, end: start + Double($0.offset + 1) * 0.1)
    }
    return .init(id: Int(start), start: start, end: start + 1, words: words, settledCount: words.count)
}

private func openedTranscript(bytes: FinalizationBytes, names: RecordingNames, track: URL? = nil, diarizer: CallDiarizer, sink: any LogSink) -> OpenedTranscript {
    let writer = WritingTranscript(file: bytes, format: TranscriptFormat(), names: names, sink: sink)
    return OpenedTranscript(writer: writer, pass: AfterCallPass(writer: writer, track: track, names: names, diarizer: diarizer, sink: sink), names: names)
}

@MainActor private func add(call: String, to resources: FinalizationResources, opened: OpenedTranscript, sink: any LogSink) {
    resources.add(call: call, transcript: opened, cleanup: unusedCleanup(sink: sink), speakers: { _ in }, finishReading: {})
}

private func unusedCleanup(sink: any LogSink) -> TranscriptCleanup {
    TranscriptCleanup(recording: .init(microphoneURL: URL(fileURLWithPath: "/mic"), callURL: URL(fileURLWithPath: "/call")),
        duration: { 60 }, cleaning: CleaningStub { _ in Issue.record("unexpected cleaning"); return [] },
        hearing: HearingStub { _ in Issue.record("unexpected hearing"); return nil }, sink: sink)
}

private enum FinalizationFailure: Error { case failed }
private actor FinalizationBytes: TranscriptBytes {
    let fails: Bool
    private(set) var replacements: [String] = []
    init(fails: Bool = false) { self.fails = fails }
    func write(_ chunks: [Data], finalLength: Int?) {}
    func replace(_ chunks: [Data], finalLength: Int?) throws {
        if fails { throw FinalizationFailure.failed }
        replacements.append(String(decoding: chunks.reduce(Data(), +), as: UTF8.self))
    }
    func close() {}
}
private struct FinalizationDiarizer: DiarizationBinding {
    let samples: @Sendable ([Float]) -> Void
    var nemotronSlots: Int { 8 }
    func loadNemotron() async throws -> @Sendable ([Float]) async throws -> [EngineTurn] {
        { audio in
            samples(audio)
            return [.init(speaker: "0", start: 0, end: 1), .init(speaker: "1", start: 2, end: 3)]
        }
    }
    func vbx(_ samples: [Float], speakers: Int?) throws -> [EngineTurn] { throw FinalizationFailure.failed }
}
