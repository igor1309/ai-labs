import struct CallText.SideState
import struct SideText.Audio
import struct SideText.Text
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct CallSideFinalEntriesTests {

    @Test(arguments: [20, 800, 6_000])
    func newestEntryMapsOnceRegardlessOfTheFinalPrefix(count: Int) async {

        let prefix = (0..<count).map { segment($0, settled: "word\($0)") }
        let draft = segment(count, pending: "draft")
        let revision = segment(count, pending: "revised")
        let final = segment(count, settled: "revised")
        let next = segment(count + 1, pending: "next")
        let engine = FinalEngine(script: [
            .init(final: prefix, tail: [draft]),
            .init(final: prefix, tail: [revision]),
            .init(final: prefix, tail: [revision]),
            .init(final: prefix + [final], tail: [next]),
        ], ending: .init(final: prefix + [final, segment(count + 1, settled: "next")], tail: []))
        let audio = TextAudio(), mapped = Values<Int>(), revisedSnapshotTaken = Signal()
        let side = CallSide(audio: audio, text: engine, written: TextTrack(chunks: []), sampleRate: 1, mapEntry: {
            mapped.append($0.text.id)
            return CallSide.entry($0)
        }, snapshotTaken: {
            if $0.finalCount == count, $0.tailEntries.map(\.text.pending) == ["revised"] {
                revisedSnapshotTaken.send()
            }
        })
        let snapshots = AsyncStream<SideState>.makeStream()
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
        #expect(first.tailEntries.map(\.text.pending) == ["draft"])
        #expect(mapped.all == Array(0...count))

        await audio.send(chunk(1))
        let revised = await states.next()!
        #expect(revised.finalEntries == first.finalEntries)
        #expect(revised.tailEntries.map(\.text.pending) == ["revised"])
        #expect(Array(mapped.all.dropFirst(count + 1)) == [count])
        #expect(storage(first.finalEntries) == storage(revised.finalEntries), "tail changes do not copy the mapped final prefix")
        await revisedSnapshotTaken.next()

        await audio.send(chunk(2))
        await revisedSnapshotTaken.next()
        #expect(Array(mapped.all.dropFirst(count + 2)).isEmpty, "a consumed duplicate maps nothing")
        await audio.send(chunk(3))
        let advanced = await states.next()!
        #expect(advanced.finalEntries.map(\.text.id) == Array(0...count))
        #expect(advanced.finalEntries.last?.text.settled == "revised")
        #expect(advanced.tailEntries.map(\.text.pending) == ["next"])
        #expect(Array(mapped.all.dropFirst(count + 2)) == [count, count + 1], "a repeated tail maps nothing; newly final text maps once")
        #expect(revised.tailEntries.map(\.text.pending) == ["revised"])
        audio.end()
        await side.stop()
        while let state = await states.next() {
            if state.status == .finished {
                #expect(state.finalEntries.map(\.text.id) == Array(0...count + 1))
                #expect(state.tailEntries.isEmpty)
            }
        }
        await listener.value
        #expect(Array(mapped.all.dropFirst(count + 4)) == [count + 1])
    }
}

private func segment(_ id: Int, settled: String = "", pending: String = "") -> SideText.Text {

    .init(id: id, start: Double(id), end: Double(id + 1), settled: settled, pending: pending)
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
