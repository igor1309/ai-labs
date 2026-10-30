import Synchronization
import Testing
@testable import SideText

@Suite(.timeLimit(.minutes(1)))
struct FinalTextTests {

    @Test(arguments: [20, 800, 6_000])
    func liveWorkDependsOnlyOnTheTail(count: Int) async {

        let prefix = (0..<count).map { word($0, settled: true) }
        let draft = word(count)
        let revision = Text(id: count, start: draft.start, end: draft.end, pending: "revised")
        let final = Text(id: count, start: draft.start, end: draft.end, settled: "revised")
        let next = word(count + 1)
        let text = DeltaText(hearings: [
            TextUpdate(final: prefix, tail: [draft]),
            TextUpdate(final: prefix, tail: [revision]),
            TextUpdate(final: prefix + [final], tail: [next]),
            TextUpdate(final: prefix + [final], tail: [next]),
        ], finish: TextUpdate(final: prefix + [final, word(count + 1, settled: true)], tail: []))
        let work = Work(), audio = CueAudio()
        let side = SideText(
            audio: audio, text: text, fillIn: { DeltaFill(progress: nil) },
            inputQueued: {}, audioEndReceived: {}, stopRequested: {},
            identifiedEntry: { work.identified($0) }, shownEntry: { work.shown($0) }
        )
        await side.start()
        await listening(side)
        await audio.send(chunk(0))
        let retained = await side.state
        #expect(retained.finalCount == count)
        #expect(retained.entries.map(\.text) == prefix + [draft])
        #expect(work.take() == Work.Counts(identified: Array(0...count), shown: Array(0...count)))

        await audio.send(chunk(1))
        let revised = await side.state
        #expect(revised.finalCount == count)
        #expect(revised.entries.map(\.text) == prefix + [revision])
        #expect(work.take() == Work.Counts(identified: [count], shown: [count]))

        await audio.send(chunk(2))
        let advanced = await side.state
        #expect(advanced.finalCount == count + 1)
        #expect(advanced.entries.map(\.text) == prefix + [final, next])
        #expect(work.take() == Work.Counts(identified: [count, count + 1], shown: [count, count + 1]))

        await audio.send(chunk(3))
        #expect(await side.state == advanced)
        #expect(work.take() == Work.Counts(identified: [count + 1], shown: [count + 1]))
        audio.end()
        await side.waitForAudioEnd()
        let finished = await side.state
        #expect(finished.status == .finished)
        #expect(finished.finalCount == count + 2)
        #expect(finished.entries.map(\.text) == prefix + [final, word(count + 1, settled: true)])
        #expect(work.take() == Work.Counts(identified: [count + 1], shown: [count + 1]))
        #expect(retained.entries.map(\.text) == prefix + [draft])
        #expect(revised.entries.map(\.text) == prefix + [revision])
        #expect(advanced.entries.map(\.text) == prefix + [final, next])
    }

    @Test func returningTailIDGetsANewIdentityWhenItBecomesFinal() async {

        let first = word(0, settled: true), old = word(1), kept = word(2)
        let returned = Text(id: 1, start: 5, end: 6, settled: "other words")
        let text = DeltaText(hearings: [
            TextUpdate(final: [first], tail: [old, kept]),
            TextUpdate(final: [first], tail: [kept]),
            TextUpdate(final: [first, returned], tail: [kept]),
            TextUpdate(final: [first, returned], tail: [kept]),
        ], finish: TextUpdate(final: [first, returned, word(2, settled: true)], tail: []))
        let audio = CueAudio(), side = SideText(audio: audio, text: text, fillIn: { DeltaFill(progress: nil) })
        await side.start()
        await listening(side)
        for second in 0..<4 { await audio.send(chunk(second)) }
        let state = await side.state
        #expect(state.finalCount == 2)
        #expect(state.entries.map(\.text.id) == [0, 3, 2])
        #expect(state.entries.map(\.text.settled) == ["word0", "other words", ""])
        #expect(state.entries.last?.text == kept)
        audio.end()
        await side.waitForAudioEnd()
        #expect(await side.state.finalCount == 3)
        #expect(await side.state.entries.map(\.text.id) == [0, 3, 2])
    }

    @Test(arguments: [1.0, 3.0, 48_000.0])
    func wholeCallFillPreservesFinalEntriesAndMarksOnlyTheRecoverableTail(sampleRate: Double) async {

        let words = (0..<4).map { word($0, sampleRate: sampleRate) }
        let finals = (0..<4).map { word($0, settled: true, sampleRate: sampleRate) }
        let text = DeltaText(hearings: [
            TextUpdate(final: Array(finals.prefix(2)), tail: [words[2]]),
            TextUpdate(final: finals, tail: [word(4, sampleRate: sampleRate)]),
        ], finish: TextUpdate(final: finals + [word(4, settled: true, sampleRate: sampleRate)], tail: []))
        let fills = Mutex([
            FilledText(text: Array(words.prefix(2)), heardThrough: 2 / sampleRate, sampleRate: sampleRate),
            FilledText(text: words, heardThrough: 4 / sampleRate, sampleRate: sampleRate),
        ])
        let audio = CueAudio(), side = SideText(audio: audio, text: text, fillIn: {
            DeltaFill(progress: fills.withLock { $0.removeFirst() })
        })
        await side.start(enabled: false)
        audio.capture(Audio(start: 0, samples: [0, 1], sampleRate: sampleRate))
        await side.setEnabled(true)
        await listening(side)
        await audio.send(chunk(2, sampleRate: sampleRate))
        let retained = await side.state
        #expect(retained.finalCount == 2)
        #expect(retained.entries.map(\.writtenLater) == [true, true, false])
        await side.setEnabled(false)
        audio.capture(chunk(3, sampleRate: sampleRate))
        await side.setEnabled(true)
        await listening(side)
        #expect(await side.state.finalCount == 2)
        #expect(await side.state.entries.map(\.writtenLater) == [true, true, false, true])
        await audio.send(chunk(4, sampleRate: sampleRate))
        #expect(await side.state.finalCount == 4)
        #expect(await side.state.entries.map(\.text) == finals + [word(4, sampleRate: sampleRate)])
        #expect(await side.state.entries.map(\.writtenLater) == [true, true, false, true, false])
        #expect(retained.entries.map(\.writtenLater) == [true, true, false])
        audio.end()
        await side.waitForAudioEnd()
        #expect(await side.state.finalCount == 5)
    }

    @Test func finalTextArrivingWhileOffStaysHiddenUntilRecoveredAudioIsMarked() async {

        let finals = [word(0, settled: true), word(1, settled: true)]
        let text = DeltaText(hearings: [
            TextUpdate(final: [], tail: [word(0)]),
            TextUpdate(final: finals, tail: []),
        ], finish: TextUpdate(final: finals, tail: []))
        let audio = CueAudio(), side = SideText(audio: audio, text: text, fillIn: { DeltaFill(progress: nil) })
        await side.start()
        await listening(side)
        await audio.send(chunk(0))
        let gate = Gate()
        await text.holdNextHearing(gate)
        let delivery = Task { await audio.send(chunk(1)) }
        await gate.entered()
        await side.setEnabled(false)
        let frozen = await side.state
        await gate.release()
        await delivery.value
        #expect(await side.state == frozen)
        await side.setEnabled(true)
        await listening(side)
        #expect(await side.state.finalCount == 2)
        #expect(await side.state.entries.map(\.text) == finals)
        #expect(await side.state.entries.map(\.writtenLater) == [false, true])
        audio.end()
        await side.waitForAudioEnd()
    }
}

private func word(_ id: Int, settled: Bool = false, sampleRate: Double = 1) -> Text {

    Text(id: id, start: Double(id) / sampleRate, end: Double(id + 1) / sampleRate,
         settled: settled ? "word\(id)" : "", pending: settled ? "" : "word\(id)")
}

private func chunk(_ second: Int, sampleRate: Double = 1) -> Audio {

    Audio(start: Double(second) / sampleRate, samples: [0], sampleRate: sampleRate)
}

private func listening(_ side: SideText) async {

    for await state in side.updates where state.status == .listening { return }
    Issue.record("Text ended before listening")
}

private actor DeltaText: LiveText {

    private var hearings: [TextUpdate]
    private let ending: TextUpdate
    private var gate: Gate?

    init(hearings: [TextUpdate], finish: TextUpdate) {

        self.hearings = hearings
        ending = finish
    }

    func holdNextHearing(_ gate: Gate) { self.gate = gate }

    func hear(_ audio: Audio) async -> TextUpdate {

        let held = gate
        gate = nil
        await held?.wait()
        return hearings.removeFirst()
    }

    func cancelHearing() {}
    func finish() -> TextUpdate { ending }
    func stop() {}
}

private struct DeltaFill: FillingIn {

    let progress: FilledText?

    func fillIn(from: Double, receive: @escaping @Sendable (FilledText) async -> Void) async {

        if let progress { await receive(progress) }
    }

    func abandon() {}
}

private final class Work: Sendable {

    struct Counts: Equatable {

        var identified: [Int] = []
        var shown: [Int] = []
    }

    private let counts = Mutex(Counts())

    func identified(_ text: Text) { counts.withLock { $0.identified.append(text.id) } }
    func shown(_ text: Text) { counts.withLock { $0.shown.append(text.id) } }

    func take() -> Counts {

        counts.withLock { value in
            defer { value = Counts() }
            return value
        }
    }
}
