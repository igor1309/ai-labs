import Synchronization
import Testing
@testable import CallText

@Suite(.timeLimit(.minutes(1)))
struct CallTextTests {

    @Test func heldConsumerReceivesOmissionsBeforeReusedIDs() async {

        let rig = Rig()
        await rig.call.start()
        var updates = rig.call.updates.makeAsyncIterator()
        while let state = await updates.next() {
            if state.status == .listening { break }
        }
        let original = [SideState.Entry(text: Text(id: 7, start: 2, end: 3, pending: "old"))]
        let reused = [SideState.Entry(text: Text(id: 7, start: 12, end: 13, pending: "new"))]
        await rig.microphone.revise(original)
        await rig.microphone.revise([])
        await rig.microphone.revise(reused)
        await rig.call.stop()

        var listening: [State] = []
        while let state = await updates.next() {
            if state.status == .listening { listening.append(state) }
        }
        #expect(Array(listening.prefix(3)) == [original, [], reused].map { entries in
            State(status: .listening, entries: entries.map {
                .init(speaker: .mine, text: $0.text, writtenLater: $0.writtenLater)
            })
        })
    }

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

    @Test(arguments: [false, true], [false, true])
    func overlappingSwitchesKeepTheLatestRequest(enabled: Bool, duringStart: Bool) async {

        let executor = CueExecutor()
        let held = CueGate(changed: executor.notify), requestLatest = CueGate(changed: executor.notify)
        let observed = CallObservation(changed: executor.notify)
        let microphone = CueSide(loading: false, start: duringStart ? held : nil,
                                 switching: duringStart ? nil : held, changed: executor.notify)
        let other = CueSide(loading: false, changed: executor.notify)
        let call = CallText(microphone: microphone, call: other)
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            if !duringStart { await call.start(enabled: enabled) }
            let listener = Task { await observed.listen(to: call) }
            let earlier = Task {
                if duringStart { await call.start(enabled: !enabled) }
                else { await call.setEnabled(!enabled) }
            }
            await requestLatest.wait()
            let latest = Task { await call.setEnabled(enabled) }
            await earlier.value
            await latest.value
            await call.setEnabled(enabled)
            #expect(await microphone.enabled == enabled)
            #expect(await other.enabled == enabled)
            #expect(await call.state.status == (enabled ? .listening : .off))
            await call.stop()
            await listener.value
        }
        defer { held.open(); requestLatest.open(); executor.run() }
        await executor.run(until: {
            held.entered && observed.latest?.status == (enabled ? .off : .gettingReady)
        })
        #expect(held.entered)
        requestLatest.open()
        await executor.run(until: {
            enabled
                ? observed.latest?.status == .gettingReady || observed.latest?.status == .listening
                : observed.latest?.status == .off
        })
        held.open()
        await executor.finish()
        await task.value
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
        #expect((onCallTrack ? rig.microphone : rig.other).abandoned)
        await rig.call.stop()
    }

    @Test(arguments: [false, true])
    func failureWaitsForBothSidesToReleaseLiveTextWithOtherAudioOpen(onCallTrack: Bool) async {

        let executor = CueExecutor()
        let release = CueGate(changed: executor.notify), observed = CallObservation(changed: executor.notify)
        let failing = CueSide(loading: false, changed: executor.notify)
        let other = CueSide(loading: false, release: release, changed: executor.notify)
        let call = CallText(microphone: onCallTrack ? other : failing, call: onCallTrack ? failing : other)
        let retained = ordered(entries(0...0, speaker: .mine) + entries(100...100, speaker: .theirs))
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            await call.start()
            await (onCallTrack ? other : failing).say(0)
            await (onCallTrack ? failing : other).say(100, at: 0)
            let listener = Task { await observed.listen(to: call) }
            await failing.fail()
            await call.stop()
            await listener.value
            await call.stop()
        }
        defer { release.open(); executor.run() }
        await executor.run(until: { release.entered && observed.latest?.status == .failed("Live text failed") })
        #expect(release.entered)
        #expect(observed.latest == State(status: .failed("Live text failed"), entries: retained))
        #expect(!observed.ended)
        #expect(other.abandoned)
        #expect(!other.audioEnded)
        #expect(other.stopRequests == 0)
        #expect(!other.liveTextReleased)
        release.open()
        await executor.finish()
        await task.value
        #expect(observed.ended)
        #expect(observed.latest == State(status: .failed("Live text failed"), entries: retained))
        #expect(failing.liveTextReleased)
        #expect(other.liveTextReleased)
        #expect(!other.audioEnded)
        #expect(other.stopRequests == 0)
    }

    @Test func failureDuringStopAbandonsTheOtherSidesOpenAudio() async {

        let executor = CueExecutor()
        let fail = CueGate(changed: executor.notify), stop = CueGate(changed: executor.notify)
        let release = CueGate(changed: executor.notify), observed = CallObservation(changed: executor.notify)
        let failing = CueSide(loading: false, stop: stop, changed: executor.notify)
        let other = CueSide(loading: false, release: release, stop: stop, changed: executor.notify)
        let call = CallText(microphone: failing, call: other)
        let retained = ordered(entries(0...0, speaker: .mine) + entries(100...100, speaker: .theirs))
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            await call.start()
            await failing.say(0)
            await other.say(100, at: 0)
            let listener = Task { await observed.listen(to: call) }
            let stopping = Task { await call.stop() }
            await fail.wait()
            await failing.fail()
            await stopping.value
            await listener.value
        }
        defer { fail.open(); stop.open(); release.open(); executor.run() }
        await executor.run(until: { failing.stopRequested.isOpen && other.stopRequested.isOpen })
        fail.open()
        await executor.run(until: { release.entered && observed.latest?.status == .failed("Live text failed") })
        #expect(observed.latest == State(status: .failed("Live text failed"), entries: retained))
        #expect(!observed.ended)
        #expect(other.abandoned)
        #expect(!other.audioEnded)
        stop.open()
        release.open()
        await executor.finish()
        await task.value
        #expect(observed.ended)
        #expect(observed.latest == State(status: .failed("Live text failed"), entries: retained))
        #expect(failing.stopped)
        #expect(other.stopped)
    }

    @Test func oneSidesAudioEndingSettlesItsTextAndLeavesTheOtherReading() async {

        let executor = CueExecutor()
        let continueAudio = CueGate(changed: executor.notify), observed = CallObservation(changed: executor.notify)
        let rig = Rig(microphoneFinishWord: 1, callFinishWord: 102, changed: executor.notify)
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            await rig.call.start()
            let listener = Task { await observed.listen(to: rig.call) }
            await rig.microphone.say(0)
            await rig.microphone.say(1)
            await rig.other.say(100, at: 0)
            await rig.microphone.endAudio()
            await rig.microphone.waitForEnd()
            await rig.other.say(101, at: 1)
            await continueAudio.wait()
            await rig.other.say(102, at: 2)
            await rig.other.endAudio()
            await listener.value
        }
        defer { continueAudio.open(); executor.run() }
        await executor.run(until: {
            continueAudio.entered && observed.latest?.entries.contains { $0.text.pending == "word101" } == true
        })
        #expect(continueAudio.entered)
        #expect(observed.latest == State(status: .listening, entries: ordered(
            settled(entries(0...1, speaker: .mine)) + entries(100...101, speaker: .theirs)
        )))
        #expect(!observed.ended)
        #expect(rig.microphone.liveTextReleased)
        #expect(!rig.other.liveTextReleased)
        continueAudio.open()
        await executor.finish()
        await task.value
        #expect(observed.ended)
        #expect(observed.latest == State(status: .finished, entries: ordered(
            settled(entries(0...1, speaker: .mine) + entries(100...102, speaker: .theirs))
        )))
        #expect(rig.other.liveTextReleased)
    }

    @Test func stoppingDrainsHeldDeliveriesAndFinishOnlyWordsFromBothSides() async {

        let executor = CueExecutor()
        let mine = CueGate(changed: executor.notify), theirs = CueGate(changed: executor.notify)
        let observed = CallObservation(changed: executor.notify)
        let rig = Rig(microphoneFinishWord: 2, callFinishWord: 102, changed: executor.notify)
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            await rig.call.start()
            let listener = Task { await observed.listen(to: rig.call) }
            await rig.microphone.say(0)
            await rig.other.say(100, at: 0)
            await rig.microphone.holdWords([1, 2], at: 1, until: mine)
            await rig.other.holdWords([101, 102], at: 1, until: theirs)
            await rig.microphone.endAudio()
            await rig.other.endAudio()
            await rig.call.stop()
            #expect(rig.microphone.stopped)
            #expect(rig.other.stopped)
            await listener.value
        }
        defer { mine.open(); theirs.open(); executor.run() }
        await executor.run(until: {
            mine.entered && theirs.entered && rig.microphone.stopRequested.isOpen && rig.other.stopRequested.isOpen
                && observed.latest?.status == .listening
        })
        #expect(mine.entered && theirs.entered)
        #expect(rig.microphone.stopRequests == 1)
        #expect(rig.other.stopRequests == 1)
        #expect(!observed.ended)
        #expect(observed.latest?.status == .listening)
        mine.open()
        await executor.run(until: {
            rig.microphone.stopReturned.isOpen
                && observed.latest?.entries.contains { $0.text.settled == "word2" } == true
        })
        #expect(rig.microphone.stopped)
        #expect(!rig.other.stopped)
        #expect(!observed.ended)
        #expect(observed.latest == State(status: .listening, entries: ordered(
            settled(entries(0...2, speaker: .mine)) + entries(100...100, speaker: .theirs)
        )))
        theirs.open()
        await executor.finish()
        await task.value
        #expect(observed.ended)
        #expect(observed.latest == State(status: .finished, entries: ordered(
            settled(entries(0...2, speaker: .mine) + entries(100...102, speaker: .theirs))
        )))
        #expect(rig.microphone.liveTextReleased)
        #expect(rig.other.liveTextReleased)
    }

    @Test func stopFinalizesJoinedInputsAndPreservesTextWhenOff() async {

        let rig = Rig()
        await rig.call.start()
        await rig.microphone.say(0)
        await rig.call.setEnabled(false)
        let retained = await rig.call.state.entries
        await rig.call.stop()
        #expect(await rig.call.state == State(status: .finished, entries: retained))
        #expect(rig.microphone.stopped)
        #expect(rig.other.stopped)
        var final: State?
        for await snapshot in rig.call.updates { final = snapshot }
        #expect(final == State(status: .finished, entries: retained))
    }
}

private struct Rig {

    let microphone: CueSide
    let other: CueSide
    let call: CallText

    init(
        microphoneLoading: Bool = false, callLoading: Bool = false,
        microphoneFinishWord: Int? = nil, callFinishWord: Int? = nil,
        changed: @escaping @Sendable () -> Void = {}
    ) {

        microphone = CueSide(loading: microphoneLoading, finishWord: microphoneFinishWord, changed: changed)
        other = CueSide(loading: callLoading, finishWord: callFinishWord, changed: changed)
        call = CallText(microphone: microphone, call: other)
    }
}

/// Words are supplied on cue; only the side decides when they become visible.
private actor CueSide: Side {

    private struct Lifetime {
        var stopped = false
        var abandoned = false
        var audioEnded = false
        var liveTextReleased = false
        var stopRequests = 0
    }

    private struct Delivery {
        let snapshot: SideState
        let received: CheckedContinuation<Void, Never>?
    }

    private let delivery = AsyncStream<Delivery>.makeStream()
    private var loading: Bool
    private(set) var enabled = false
    private var ended = false
    private var spoken: [SideState.Entry] = []
    private var visible: [SideState.Entry] = []
    // This supplied word becomes visible only when live text finalizes.
    private let finishWord: Int?
    private let release: CueGate?
    private let stopHold: CueGate?
    private let startHold: CueGate?
    private var switchHold: CueGate?
    private var pendingDelivery: Task<Void, Never>?
    private var ending: Task<Void, Never>?
    private(set) var written: [Int] = []
    private(set) var switches: [Bool] = []
    private nonisolated let lifetime = Mutex(Lifetime())
    nonisolated var stopped: Bool { lifetime.withLock { $0.stopped } }
    nonisolated var abandoned: Bool { lifetime.withLock { $0.abandoned } }
    nonisolated var audioEnded: Bool { lifetime.withLock { $0.audioEnded } }
    nonisolated var liveTextReleased: Bool { lifetime.withLock { $0.liveTextReleased } }
    nonisolated var stopRequests: Int { lifetime.withLock { $0.stopRequests } }
    nonisolated let stopRequested: CueGate
    nonisolated let stopReturned: CueGate

    init(
        loading: Bool, finishWord: Int? = nil, release: CueGate? = nil,
        stop: CueGate? = nil, start: CueGate? = nil, switching: CueGate? = nil,
        changed: @escaping @Sendable () -> Void = {}
    ) {

        self.loading = loading
        self.finishWord = finishWord
        self.release = release
        stopHold = stop
        startHold = start
        switchHold = switching
        stopRequested = CueGate(changed: changed)
        stopReturned = CueGate(changed: changed)
    }

    func listen(_ receive: @escaping @Sendable (SideState) async -> Void) async {

        for await item in delivery.stream {
            await receive(item.snapshot)
            item.received?.resume()
        }
    }

    func start(enabled: Bool) async {

        await startHold?.wait()
        self.enabled = enabled
        await publish()
    }

    func setEnabled(_ enabled: Bool) async {

        let hold = switchHold
        switchHold = nil
        await hold?.wait()
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
        if enabled, !loading {
            visible = spoken.filter { $0.text.pending != finishWord.map { "word\($0)" } }
            await publish()
        }
    }

    func release() async { loading = false; visible = spoken; await publish() }
    func revise(_ entries: [SideState.Entry]) async { visible = entries; await publish() }

    func fail() async {

        lifetime.withLock { $0.liveTextReleased = true }
        await emit(.init(status: .failed("Live text failed"), entries: visible))
        ended = true
        delivery.continuation.finish()
    }

    func holdWords(_ words: [Int], at start: Int, until gate: CueGate) {

        pendingDelivery = Task {
            await gate.wait()
            for (offset, word) in words.enumerated() { await self.say(word, at: start + offset) }
        }
    }

    func endAudio() {

        lifetime.withLock { $0.audioEnded = true }
        beginEnd(finalize: enabled)
    }

    func waitForEnd() async { await ending?.value }

    func stop() async {

        lifetime.withLock { $0.stopRequests += 1 }
        stopRequested.open()
        await stopHold?.wait()
        beginEnd(finalize: enabled)
        await ending?.value
        lifetime.withLock { $0.stopped = true }
        stopReturned.open()
    }

    func abandon() async {

        lifetime.withLock { $0.abandoned = true }
        beginEnd(finalize: false)
        await ending?.value
    }

    private func beginEnd(finalize: Bool) {

        guard !ended, ending == nil else { return }
        ending = Task {
            if finalize {
                await self.pendingDelivery?.value
                if self.finishWord != nil { self.visible = self.spoken }
                self.visible = self.visible.map {
                    .init(text: Text(id: $0.text.id, start: $0.text.start, end: $0.text.end,
                                     settled: $0.text.settled + $0.text.pending), writtenLater: $0.writtenLater)
                }
            }
            await self.release?.wait()
            self.lifetime.withLock { $0.liveTextReleased = true }
            self.ended = true
            // Releasing text does not wait for the subscriber's final delivery.
            self.delivery.continuation.yield(Delivery(snapshot: .init(status: .finished, entries: self.visible), received: nil))
            self.delivery.continuation.finish()
        }
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

private func settled(_ entries: [State.Entry]) -> [State.Entry] {

    entries.map {
        .init(speaker: $0.speaker, text: Text(id: $0.text.id, start: $0.text.start, end: $0.text.end,
                                           settled: $0.text.pending), writtenLater: $0.writtenLater)
    }
}
