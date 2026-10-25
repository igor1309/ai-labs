import Testing
@testable import CallText

struct CallTextTests {

    @Test func microphoneWordsAppearAsMineBeforeTheNextWord() async {

        let rig = Rig()
        await rig.call.start()
        for word in 0..<12 {
            await rig.microphone.say(word)
            #expect(await rig.call.state == State(status: .listening, entries: entries(0...word, speaker: .mine)))
        }
        await rig.call.stop()
    }

    @Test func callWordsAppearAsTheirsBeforeTheNextWord() async {

        let rig = Rig()
        await rig.call.start()
        for word in 0..<4 {
            await rig.other.say(word)
            #expect(await rig.call.state == State(status: .listening, entries: entries(0...word, speaker: .theirs)))
        }
        await rig.call.stop()
    }

    @Test(arguments: [false, true])
    func loadingLiveTextIsReportedAsGettingReady(onCallSide: Bool) async {

        let rig = Rig(microphoneLoading: !onCallSide, callLoading: onCallSide)
        await rig.call.start()
        #expect(await rig.call.state == State(status: .gettingReady, entries: []))
        await (onCallSide ? rig.other : rig.microphone).release()
        #expect(await rig.call.state.status == .listening)
        await rig.call.stop()
    }

    @Test func thirtySecondsWhileLoadingAreReadFromTheStartInOrder() async {

        let rig = Rig(microphoneLoading: true, callLoading: true)
        await rig.call.start()
        for word in 0..<30 {
            await rig.microphone.say(word)
            await rig.other.say(word + 100, at: word)
        }
        #expect(await rig.call.state.entries.isEmpty)
        await rig.microphone.release()
        await rig.other.release()
        #expect(await rig.call.state == State(status: .listening, entries: ordered(
            entries(0...29, speaker: .mine) + entries(100...129, speaker: .theirs)
        )))
        await rig.call.stop()
    }

    @Test func switchingOffKeepsEarlierTextAndAddsNoLaterWords() async {

        let rig = Rig()
        await rig.call.start()
        await rig.microphone.say(0)
        await rig.other.say(100, at: 0)
        let frozen = await rig.call.state.entries
        #expect(frozen == ordered(entries(0...0, speaker: .mine) + entries(100...100, speaker: .theirs)))
        await rig.call.setEnabled(false)
        for word in 1..<8 {
            await rig.microphone.say(word)
            await rig.other.say(word + 100, at: word)
        }
        #expect(await rig.call.state == State(status: .off, entries: frozen))
        #expect(await rig.microphone.switches == [false])
        #expect(await rig.other.switches == [false])
        await rig.call.stop()
    }

    @Test func switchingOnReadsTwentySecondsFromTheStartAsWrittenLater() async {

        let rig = Rig()
        await rig.call.start(enabled: false)
        for word in 0..<20 {
            await rig.microphone.say(word)
            await rig.other.say(word + 100, at: word)
        }
        #expect(await rig.call.state == State(status: .off, entries: []))
        await rig.call.setEnabled(true)
        let recovered = ordered(entries(0...19, speaker: .mine, later: true) + entries(100...119, speaker: .theirs, later: true))
        #expect(await rig.call.state == State(status: .listening, entries: recovered))
        await rig.microphone.say(20)
        await rig.other.say(120, at: 20)
        #expect(await rig.call.state == State(status: .listening, entries: recovered + entries(20...20, speaker: .mine) + entries(120...120, speaker: .theirs)))
        #expect(await rig.microphone.switches == [true])
        #expect(await rig.other.switches == [true])
        await rig.call.stop()
    }

    @Test func liveWordsArriveBeforeAnyAudioIsWritten() async {

        let rig = Rig()
        await rig.call.start()
        for word in 0..<5 {
            await rig.microphone.say(word, write: false)
            #expect(await rig.call.state == State(status: .listening, entries: entries(0...word, speaker: .mine)))
        }
        #expect(await rig.microphone.written.isEmpty)
        await rig.call.stop()
    }

    @Test func liveRevisionsReplaceEarlierText() async {

        let rig = Rig()
        await rig.call.start()
        await rig.microphone.say(0)
        await rig.other.say(100, at: 0)
        let revision = SideState.Entry(text: Text(id: 0, start: 0, end: 1, settled: "revised"), writtenLater: true)
        await rig.microphone.revise([revision])
        #expect(await rig.call.state == State(status: .listening, entries: [
            .init(speaker: .mine, text: revision.text, writtenLater: true),
        ] + entries(100...100, speaker: .theirs)))
        await rig.call.stop()
    }

    @Test(arguments: [false, true])
    func liveTextFailureIsReportedAndKeepsTheTextSoFar(onCallTrack: Bool) async {

        let rig = Rig()
        await rig.call.start()
        await rig.microphone.say(0)
        await rig.other.say(100, at: 0)
        let retained = await rig.call.state.entries
        let failing = onCallTrack ? rig.other : rig.microphone
        await failing.fail()
        var final: State?
        for await snapshot in rig.call.updates { final = snapshot }
        #expect(final == State(status: .failed("Live text failed"), entries: retained))
        #expect(await (onCallTrack ? rig.microphone : rig.other).abandoned)
        await rig.call.stop()
    }

    @Test func stopFinalizesJoinedInputsAndPreservesTextWhenOff() async {

        let rig = Rig()
        await rig.call.start()
        await rig.microphone.say(0)
        await rig.call.setEnabled(false)
        let retained = await rig.call.state.entries
        await rig.call.stop()
        #expect(await rig.call.state == State(status: .finished, entries: retained))
        #expect(await rig.microphone.stopped)
        #expect(await rig.other.stopped)
        var final: State?
        for await snapshot in rig.call.updates { final = snapshot }
        #expect(final == State(status: .finished, entries: retained))
    }
}

private struct Rig {

    let microphone: CueSide
    let other: CueSide
    let call: CallText

    init(microphoneLoading: Bool = false, callLoading: Bool = false) {

        microphone = CueSide(loading: microphoneLoading)
        other = CueSide(loading: callLoading)
        call = CallText(microphone: microphone, call: other)
    }
}

/// Words are supplied on cue; only the side decides when they become visible.
private actor CueSide: Side {

    private struct Delivery {
        let snapshot: SideState
        let received: CheckedContinuation<Void, Never>?
    }

    private let delivery = AsyncStream<Delivery>.makeStream()
    private var loading: Bool
    private var enabled = false
    private var ended = false
    private var spoken: [SideState.Entry] = []
    private var visible: [SideState.Entry] = []
    private(set) var written: [Int] = []
    private(set) var switches: [Bool] = []
    private(set) var stopped = false
    private(set) var abandoned = false

    init(loading: Bool) { self.loading = loading }

    func listen(_ receive: @escaping @Sendable (SideState) async -> Void) async {

        for await item in delivery.stream {
            await receive(item.snapshot)
            item.received?.resume()
        }
    }

    func start(enabled: Bool) async {

        self.enabled = enabled
        await publish()
    }

    func setEnabled(_ enabled: Bool) async {

        switches.append(enabled)
        self.enabled = enabled
        if enabled {
            spoken = spoken.map { .init(text: $0.text, writtenLater: true) }
            if !loading { visible = spoken }
        }
        await publish()
    }

    func say(_ word: Int, at start: Int? = nil, write: Bool = true) async {

        let start = Double(start ?? word)
        spoken.append(.init(text: Text(id: spoken.count, start: start, end: start + 1, pending: "word\(word)")))
        if write { written.append(word) }
        if enabled, !loading { visible = spoken; await publish() }
    }

    func release() async { loading = false; visible = spoken; await publish() }
    func revise(_ entries: [SideState.Entry]) async { visible = entries; await publish() }

    func fail() async {

        await emit(.init(status: .failed("Live text failed"), entries: visible))
        ended = true
        delivery.continuation.finish()
    }

    func stop() async { stopped = true; await end() }
    func abandon() async { abandoned = true; await end() }

    private func end() async {

        guard !ended else { return }
        ended = true
        // Ending need not wait for the subscriber to consume the final snapshot.
        delivery.continuation.yield(Delivery(snapshot: .init(status: .finished, entries: visible), received: nil))
        delivery.continuation.finish()
    }

    private func publish() async {

        await emit(.init(status: !enabled ? .off : (loading ? .gettingReady : .listening), entries: visible))
    }

    private func emit(_ snapshot: SideState) async {

        await withCheckedContinuation { received in
            if case .terminated = delivery.continuation.yield(Delivery(snapshot: snapshot, received: received)) {
                received.resume()
            }
        }
    }
}

private func entries(_ words: ClosedRange<Int>, speaker: State.Speaker, later: Bool = false) -> [State.Entry] {

    words.map { word in
        let start = Double(word % 100)
        return .init(speaker: speaker, text: Text(id: word % 100, start: start, end: start + 1, pending: "word\(word)"), writtenLater: later)
    }
}

private func ordered(_ entries: [State.Entry]) -> [State.Entry] {

    entries.sorted {
        if $0.text.start != $1.text.start { return $0.text.start < $1.text.start }
        return $0.speaker == .mine && $1.speaker == .theirs
    }
}
