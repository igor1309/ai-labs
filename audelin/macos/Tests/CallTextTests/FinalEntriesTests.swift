import Synchronization
import Testing
@testable import CallText

@Suite(.timeLimit(.minutes(1)))
struct FinalEntriesTests {

    @Test func laggingTailHoldsBackTheOtherSidesFinalEntries() async {

        let mine = FinalSide(), theirs = FinalSide()
        let call = CallText(microphone: mine, call: theirs)
        await call.start()
        let myFinals = (0..<4).map { word($0) }
        let theirFinals = (0..<3).map { word($0, start: Double($0) + 0.5) }
        await mine.send(final: Array(myFinals.prefix(3)), tail: [word(3)])
        #expect(await call.state.finalCount == 0)
        await theirs.send(final: [theirFinals[0]], tail: [word(1, start: 1.5)])
        let held = await call.state
        #expect(held.finalCount == 3)
        #expect(held.entries == ordered(Array(myFinals.prefix(3)), [theirFinals[0]], myTail: [word(3)], theirTail: [word(1, start: 1.5)]))

        await mine.send(final: myFinals, tail: [word(4)])
        #expect(await call.state.finalCount == held.finalCount)
        await theirs.send(final: theirFinals, tail: [word(3, start: 3.5)])
        let caughtUp = await call.state
        #expect(caughtUp.finalCount == 7)
        #expect(caughtUp.entries == ordered(myFinals, theirFinals, myTail: [word(4)], theirTail: [word(3, start: 3.5)]))
        #expect(Array(caughtUp.entries.prefix(held.finalCount)) == Array(held.entries.prefix(held.finalCount)))
        await call.stop()
    }

    @Test func interleavingKeepsMineFirstAtEqualStartsEvenWhenItsTailIsEmpty() async {

        let mine = FinalSide(), theirs = FinalSide()
        let call = CallText(microphone: mine, call: theirs)
        await call.start()
        let first = word(0, end: 2), second = word(1, start: 2, end: 3)
        await mine.send(final: [first], tail: [])
        await theirs.send(final: [first, second], tail: [word(2, start: 3)])
        let held = await call.state
        #expect(held.entries == ordered([first], [first, second], theirTail: [word(2, start: 3)]))
        #expect(held.finalCount == 2, "mine can still arrive before theirs at the same start")
        await mine.send(final: [first, second], tail: [word(2, start: 3)])
        let advanced = await call.state
        #expect(advanced.finalCount == 4)
        #expect(advanced.entries == ordered([first, second], [first, second], myTail: [word(2, start: 3)], theirTail: [word(2, start: 3)]))
        await call.stop()
    }

    @Test func aTailWithoutFinalTextCanStillMoveBeforeTheOtherSide() async {

        let mine = FinalSide(), theirs = FinalSide()
        let call = CallText(microphone: mine, call: theirs)
        await call.start()
        let final = word(0, start: 4)
        await mine.send(final: [final], tail: [word(1, start: 5)])
        await theirs.send(final: [], tail: [word(0, start: 10)])
        #expect(await call.state.finalCount == 0)
        await theirs.send(final: [], tail: [word(0, start: 1)])
        #expect(await call.state.entries == ordered([final], [], myTail: [word(1, start: 5)], theirTail: [word(0, start: 1)]))
        #expect(await call.state.finalCount == 0)
        await call.stop()
    }

    @Test(arguments: [SideState.Status.finished, .failed("ended")])
    func anEndedSideReleasesItsBound(status: SideState.Status) async {

        let mine = FinalSide(), theirs = FinalSide()
        let call = CallText(microphone: mine, call: theirs)
        await call.start()
        let finals = [word(0), word(1)]
        await mine.send(final: finals, tail: [word(2)])
        #expect(await call.state.finalCount == 0)
        await theirs.send(final: [], tail: [], status: status)
        #expect(await call.state.finalCount == 2)
        #expect(await call.state.entries == ordered(finals, [], myTail: [word(2)]))
        #expect(await call.state.status == (status == .finished ? .listening : .failed("ended")))
        await call.stop()
    }

    @Test func anEndedSidesNonfinalTailStillPreventsSkippingAnEntry() async {

        let mine = FinalSide(), theirs = FinalSide()
        let call = CallText(microphone: mine, call: theirs)
        await call.start()
        await mine.send(final: [word(0), word(1)], tail: [word(2)])
        await theirs.send(final: [], tail: [word(0, start: 0.5)], status: .failed("ended"))
        #expect(await call.state.finalCount == 1)
        #expect(await call.state.entries == ordered([word(0), word(1)], [], myTail: [word(2)], theirTail: [word(0, start: 0.5)]))
        await call.stop()
    }

    @Test(arguments: [State.Speaker.mine, .theirs])
    func listenReturningAlonePublishesTheOtherSidesFinalPrefix(ending: State.Speaker) async {

        let mine = FinalSide(), theirs = FinalSide()
        let call = CallText(microphone: mine, call: theirs)
        await call.start()
        let openSide = ending == .mine ? theirs : mine
        let endingSide = ending == .mine ? mine : theirs
        let finals = [word(0), word(1)], tail = [word(2)]
        await openSide.send(final: finals, tail: tail)
        let entries = ending == .mine
            ? ordered([], finals, theirTail: tail)
            : ordered(finals, [], myTail: tail)
        let held = State(status: .listening, entries: entries, finalCount: 0)
        #expect(await call.state == held)
        var updates = call.updates.makeAsyncIterator()
        while let snapshot = await updates.next(), snapshot != held {}

        await endingSide.endListening()
        let released = State(status: .listening, entries: entries, finalCount: 2)
        #expect(await updates.next() == released)
        #expect(await call.state == released)
        await call.stop()
    }

    @Test func switchingOffAndOnKeepsThePrefixAndTheLaggingSidesBound() async {

        let mine = FinalSide(), theirs = FinalSide()
        let call = CallText(microphone: mine, call: theirs)
        await call.start()
        await mine.send(final: [word(0), word(1)], tail: [word(2)])
        await theirs.send(final: [word(0, start: 0.5)], tail: [word(1, start: 1.5)])
        let before = await call.state
        #expect(before.finalCount == 3)
        await call.setEnabled(false)
        let off = await call.state
        #expect(off.status == .off)
        #expect(off.entries == before.entries)
        #expect(off.finalCount == before.finalCount)
        await call.setEnabled(true)
        #expect(await call.state.entries == before.entries)
        #expect(await call.state.finalCount == before.finalCount)
        await mine.send(final: [word(0), word(1), word(2)], tail: [word(3)])
        #expect(await call.state.finalCount == before.finalCount)
        let recovered = word(1, start: 1.5, later: true)
        await theirs.send(final: [word(0, start: 0.5), recovered], tail: [word(2, start: 2.5, later: true)])
        let after = await call.state
        #expect(after.finalCount == 5)
        #expect(after.entries == ordered([word(0), word(1), word(2)], [word(0, start: 0.5), recovered], myTail: [word(3)], theirTail: [word(2, start: 2.5, later: true)]))
        #expect(Array(after.entries.prefix(before.finalCount)) == Array(before.entries.prefix(before.finalCount)))
        await call.stop()
    }

    @Test func aQuietSideLetsTheOtherSidesFinalEntriesThroughUpToItsBound() async {

        let mine = FinalSide(), theirs = FinalSide()
        let call = CallText(microphone: mine, call: theirs)
        await call.start()
        await mine.send(final: (0..<4).map { word($0) }, tail: [])
        #expect(await call.state.finalCount == 0)

        await theirs.send(final: [], tail: [], noTextBefore: 2)
        #expect(await call.state.finalCount == 3)

        // A word arriving at the bound still lands after what went final.
        await theirs.send(final: [], tail: [word(0, start: 2)], noTextBefore: 2)
        let state = await call.state
        #expect(state.finalCount == 3)
        #expect(state.entries.map(\.text.start) == [0, 1, 2, 2, 3])
        #expect(state.entries[2].speaker == .mine)
        await call.stop()
    }

    @Test func aQuietSidesOpenEntryHoldsBackWhatFollowsIt() async {

        let mine = FinalSide(), theirs = FinalSide()
        let call = CallText(microphone: mine, call: theirs)
        await call.start()
        await mine.send(final: (0..<4).map { word($0) }, tail: [])
        await theirs.send(final: [], tail: [word(0, start: 1.5)], noTextBefore: 3)
        #expect(await call.state.finalCount == 2)
        await call.stop()
    }

    @Test func switchingOffKeepsASidesBound() async {

        let mine = FinalSide(), theirs = FinalSide()
        let call = CallText(microphone: mine, call: theirs)
        await call.start()
        await theirs.send(final: [], tail: [], noTextBefore: 2)
        await call.setEnabled(false)
        await mine.send(final: (0..<4).map { word($0) }, tail: [], status: .off)
        #expect(await call.state.finalCount == 3)
        await call.stop()
    }

    @Test(arguments: [20, 800, 6_000])
    func newestEntrySortWorkDoesNotGrowWithTheFinalPrefix(count: Int) async {

        let mine = FinalSide(), theirs = FinalSide(), work = SortedWork()
        let call = CallText(microphone: mine, call: theirs, sortedEntry: { work.record($0) })
        await call.start()
        let myFinals = (0..<count / 2).map { word($0, start: Double($0 * 2), end: Double($0 * 2 + 2)) }
        let theirFinals = (0..<count / 2).map { word($0, start: Double($0 * 2 + 1), end: Double($0 * 2 + 3)) }
        let myTail = word(count / 2, start: Double(count))
        await mine.send(final: myFinals, tail: [myTail])
        await theirs.send(final: theirFinals, tail: [word(count / 2, start: Double(count + 1))])
        let first = await call.state
        #expect(first.finalCount == count)
        #expect(first.entries == ordered(myFinals, theirFinals, myTail: [myTail], theirTail: [word(count / 2, start: Double(count + 1))]))
        _ = work.take()

        // Retain every snapshot, as an unread stream or a slow reader does.
        var retained = [first]
        for revision in 1...3 {
            let newest = word(count / 2, start: Double(count + 1), pending: "revision\(revision)")
            await theirs.send(final: theirFinals, tail: [newest])
            let next = await call.state
            #expect(work.take() == [myTail.text, newest.text])
            #expect(next.finalCount == count)
            #expect(Array(next.entries.prefix(count)) == Array(first.entries.prefix(count)))
            #expect(next.entries.last?.text == newest.text)
            #expect(storage(next.entries.sealed) == storage(retained.last!.entries.sealed), "an update shares the final entries with a held state")
            retained.append(next)
        }
        let final = word(count / 2, start: Double(count), end: Double(count + 2))
        let nextTail = word(count / 2 + 1, start: Double(count + 2))
        await mine.send(final: myFinals + [final], tail: [nextTail])
        #expect(await call.state.finalCount == count + 1)
        #expect(work.take() == [final.text, nextTail.text, retained.last!.entries.last!.text])
        #expect(retained.first == first)
        await call.stop()
    }
}

private func word(_ id: Int, start: Double? = nil, end: Double? = nil, pending: String = "", later: Bool = false) -> SideState.Entry {

    let start = start ?? Double(id)
    return .init(text: .init(id: id, start: start, end: end ?? start + 1, settled: pending.isEmpty ? "word\(id)" : "", pending: pending), writtenLater: later)
}

private func ordered(_ mine: [SideState.Entry], _ theirs: [SideState.Entry], myTail: [SideState.Entry] = [], theirTail: [SideState.Entry] = []) -> [State.Entry] {

    let mine = (mine + myTail).map { State.Entry(speaker: .mine, text: $0.text, writtenLater: $0.writtenLater) }
    let theirs = (theirs + theirTail).map { State.Entry(speaker: .theirs, text: $0.text, writtenLater: $0.writtenLater) }
    return (mine + theirs).sorted {
        $0.text.start != $1.text.start ? $0.text.start < $1.text.start : $0.speaker == .mine && $1.speaker == .theirs
    }
}

private func storage<T>(_ entries: [T]) -> UInt {

    entries.withUnsafeBufferPointer { UInt(bitPattern: $0.baseAddress) }
}

private final class SortedWork: Sendable {

    private let entries = Mutex<[Text]>([])

    func record(_ entry: State.Entry) { entries.withLock { $0.append(entry.text) } }

    func take() -> [Text] {

        entries.withLock { value in
            defer { value = [] }
            return value
        }
    }
}

private actor FinalSide: Side {

    private struct Delivery {
        let state: SideState
        let received: CheckedContinuation<Void, Never>
    }

    private let deliveries = AsyncStream<Delivery>.makeStream()
    private var state = SideState(status: .listening, entries: [])

    func listen(_ receive: @escaping @Sendable (SideState) async -> Void) async {

        for await delivery in deliveries.stream {
            await receive(delivery.state)
            delivery.received.resume()
        }
    }

    func start(enabled: Bool) async { await setEnabled(enabled) }

    func setEnabled(_ enabled: Bool) async {

        await send(
            final: state.finalEntries, tail: state.tailEntries, status: enabled ? .listening : .off,
            noTextBefore: state.noTextBefore
        )
    }

    func send(
        final: [SideState.Entry], tail: [SideState.Entry], status: SideState.Status = .listening,
        noTextBefore: Double? = nil
    ) async {

        state = .init(status: status, finalEntries: final, tailEntries: tail, noTextBefore: noTextBefore)
        await withCheckedContinuation { deliveries.continuation.yield(Delivery(state: state, received: $0)) }
    }

    func endListening() { deliveries.continuation.finish() }

    func stop() { endListening() }
}
