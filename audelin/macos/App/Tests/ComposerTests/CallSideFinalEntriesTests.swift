import LiveText
import struct CallText.SideState
import struct SideText.Audio
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct CallSideFinalEntriesTests {

    @Test(arguments: [20, 800, 6_000])
    func newestEntryRevisionsKeepTheMappedFinalPrefix(count: Int) async {

        let prefix = (0..<count).map { segment($0, text: "word\($0)", settled: true) }
        let draft = segment(count, text: "draft", settled: false)
        let revision = segment(count, text: "revised", settled: false)
        let final = segment(count, text: "revised", settled: true)
        let next = segment(count + 1, text: "next", settled: false)
        let engine = FinalEngine(script: [
            .init(final: prefix, tail: [draft]),
            .init(final: prefix, tail: [revision]),
            .init(final: prefix, tail: [revision]),
            .init(final: prefix + [final], tail: [next]),
        ], ending: .init(final: prefix + [final, segment(count + 1, text: "next", settled: true)], tail: []))
        let audio = TextAudio()
        let side = CallSide(audio: audio, text: engine, written: TextTrack(chunks: []), sampleRate: 1)
        let snapshots = AsyncStream<SideState<TranscriptSegment>>.makeStream()
        let listener = Task {
            await side.listen { snapshots.continuation.yield($0) }
            snapshots.continuation.finish()
        }
        await side.start(enabled: true)
        var states = snapshots.stream.makeAsyncIterator()
        while let state = await states.next(), state.status != .listening {}
        await audio.send(chunk(0))
        let first = await states.next()!
        #expect(first.finalEntries.map(\.text.id) == Array(0..<count))
        #expect(first.tailEntries.map { $0.text.words.dropFirst($0.text.settledCount).map(\.text).joined(separator: " ") } == ["draft"])

        await audio.send(chunk(1))
        let revised = await states.next()!
        #expect(revised.finalEntries == first.finalEntries)
        #expect(revised.tailEntries.map { $0.text.words.dropFirst($0.text.settledCount).map(\.text).joined(separator: " ") } == ["revised"])
        #expect(storage(first.finalEntries) == storage(revised.finalEntries), "tail changes do not copy the mapped final prefix")

        // A repeated snapshot publishes nothing: the next state is the advanced one.
        await audio.send(chunk(2))
        await audio.send(chunk(3))
        let advanced = await states.next()!
        #expect(advanced.finalEntries.map(\.text.id) == Array(0...count))
        #expect(advanced.finalEntries.last?.text == final)
        #expect(advanced.tailEntries.map { $0.text.words.dropFirst($0.text.settledCount).map(\.text).joined(separator: " ") } == ["next"])
        #expect(Array(advanced.finalEntries.prefix(count)) == first.finalEntries)
        #expect(revised.tailEntries.map { $0.text.words.dropFirst($0.text.settledCount).map(\.text).joined(separator: " ") } == ["revised"])
        audio.end()
        await side.stop()
        while let state = await states.next() {
            if state.status == .finished {
                #expect(state.finalEntries.map(\.text.id) == Array(0...count + 1))
                #expect(state.tailEntries.isEmpty)
            }
        }
        await listener.value
    }
}

private func segment(_ id: Int, text: String, settled: Bool) -> TranscriptSegment {

    .init(id: id, start: Double(id), end: Double(id + 1), words: [.init(text, start: Double(id), end: Double(id + 1))], settledCount: settled ? 1 : 0)
}

private func chunk(_ second: Int) -> SideText.Audio {

    .init(start: Double(second), samples: [0], sampleRate: 1)
}

private func storage<T>(_ entries: [T]) -> UInt {

    entries.withUnsafeBufferPointer { UInt(bitPattern: $0.baseAddress) }
}

private actor FinalEngine: TextEngine {

    private var script: [TrackText.Update]
    private let ending: TrackText.Update

    init(script: [TrackText.Update], ending: TrackText.Update) {

        self.script = script
        self.ending = ending
    }

    func prepare() {}
    func hear(_ audio: SideText.Audio) -> TrackText.Update { script.removeFirst() }
    func finish() -> TrackText.Update { ending }
    func shutdown() {}
}
