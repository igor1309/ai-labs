import Synchronization
import Testing
@testable import CallText

struct CallTextTests {

    @Test(arguments: [1.0, 3.0, 44_100.0, 48_000.0])
    func microphoneWordsAppearAsMineBeforeTheNextWord(sampleRate: Double) async throws {

        let rig = Rig()
        await rig.call.start()
        await rig.listening()
        var updates = rig.call.updates.makeAsyncIterator()
        for index in 0..<12 {
            await rig.microphone.send(Audio(start: Double(index) / sampleRate, samples: [Float(index)], sampleRate: sampleRate))
            #expect(await updates.next() == State(
                status: .listening, entries: entries(0...index, speaker: .mine, sampleRate: sampleRate)
            ))
        }
        rig.microphone.end()
        rig.other.end()
        var endedNormally = false
        for await state in rig.call.updates {
            if state.status == .finished {
                #expect(state == State(
                    status: .finished, entries: entries(0...11, speaker: .mine, sampleRate: sampleRate)
                ))
                endedNormally = true
                break
            }
        }
        #expect(endedNormally)
        await rig.call.stop()
    }

    @Test func callWordsAppearAsTheirsBeforeTheNextWord() async throws {

        let rig = Rig()
        await rig.call.start()
        await rig.listening()
        var updates = rig.call.updates.makeAsyncIterator()
        for index in 0..<4 {
            await rig.other.send(tone(index))
            #expect(await updates.next() == State(
                status: .listening, entries: entries(0...index, speaker: .theirs)
            ))
        }
        await rig.call.stop()
    }

    @Test func loadingLiveTextIsReportedAsGettingReady() async {

        let rig = Rig(loading: true)
        await rig.call.start()
        let state = await rig.call.state
        #expect(state.status == .gettingReady)
        #expect(state.entries.isEmpty)
        await rig.release()
        await rig.call.stop()
    }

    @Test func thirtySecondsWhileLoadingAreReadFromTheStartInOrder() async throws {

        let rig = Rig(loading: true)
        await rig.call.start()
        for index in 0..<30 {
            await rig.microphoneWritten.append(tone(index))
            await rig.otherWritten.append(tone(index + 100, at: Double(index)))
            await rig.microphone.send(tone(index))
            await rig.other.send(tone(index + 100, at: Double(index)))
        }
        await rig.release()
        await rig.listening()
        let state = await rig.call.state
        #expect(state.entries.filter { $0.speaker == .mine }.map(\.text.pending) == words(0...29))
        #expect(state.entries.filter { $0.speaker == .theirs }.map(\.text.pending) == words(100...129))
        #expect(state.entries.allSatisfy { !$0.writtenLater })
        await rig.microphone.send(tone(30))
        await rig.other.send(tone(130, at: 30))
        let live = await rig.call.state
        #expect(live.entries.filter { $0.speaker == .mine }.map(\.text.pending) == words(0...30))
        #expect(live.entries.filter { $0.speaker == .theirs }.map(\.text.pending) == words(100...130))
        #expect(await rig.microphoneWritten.reads == [0..<30])
        #expect(await rig.otherWritten.reads == [0..<30])
        await rig.call.stop()
    }

    @Test(arguments: [1.0, 3.0, 48_000.0])
    func switchingOffKeepsEarlierTextAndAddsNoLaterWords(sampleRate: Double) async throws {

        let rig = Rig()
        await rig.call.start()
        await rig.listening()
        await rig.microphone.send(tone(0, sampleRate: sampleRate))
        await rig.other.send(tone(100, at: 0, sampleRate: sampleRate))
        for range in [0...2, 3...5, 6...9] {
            await rig.microphoneWritten.append(tones(range, at: Double(range.lowerBound) / sampleRate, sampleRate: sampleRate))
            await rig.otherWritten.append(tones((range.lowerBound + 100)...(range.upperBound + 100), at: Double(range.lowerBound) / sampleRate, sampleRate: sampleRate))
        }
        let before = await rig.call.state
        #expect(before.entries.map(\.text.pending) == ["word0", "word100"])
        await rig.microphoneText.holdNextHearing()
        let inFlight = Task { await rig.microphone.send(tone(1, sampleRate: sampleRate)) }
        for await _ in rig.microphoneText.hearingBegan { break }
        await rig.call.setEnabled(false)
        await inFlight.value
        for index in 1..<8 {
            await rig.microphone.send(tone(index, sampleRate: sampleRate))
            await rig.other.send(tone(index + 100, at: Double(index) / sampleRate, sampleRate: sampleRate))
        }
        let after = await rig.call.state
        #expect(after.status == .off)
        #expect(after.entries == before.entries)
        await rig.call.setEnabled(true)
        let resumed = await rig.listening()
        let recovered = ordered(
            entries(0...7, speaker: .mine, sampleRate: sampleRate, later: 1..<8, chunkStarts: [0, 3, 6])
                + entries(100...107, speaker: .theirs, sampleRate: sampleRate, later: 1..<8, chunkStarts: [0, 3, 6])
        )
        #expect(resumed == State(status: .listening, entries: recovered))
        #expect(await rig.microphoneWritten.reads == [(2 / sampleRate)..<(7 / sampleRate + 1 / sampleRate)])
        #expect(await rig.otherWritten.reads == [(1 / sampleRate)..<(7 / sampleRate + 1 / sampleRate)])
        await rig.microphone.send(tones(8...9, at: 8 / sampleRate, sampleRate: sampleRate))
        var updates = rig.call.updates.makeAsyncIterator()
        #expect(await updates.next() == State(
            status: .listening,
            entries: recovered + entries(8...9, speaker: .mine, sampleRate: sampleRate, chunkStarts: [8])
        ))
        await rig.call.stop()
    }

    @Test func switchingOnReadsTwentySecondsFromTheStartAsWrittenLater() async throws {

        let rig = Rig()
        await rig.call.start(enabled: false)
        for index in 0..<20 {
            await rig.microphoneWritten.append(tone(index))
            await rig.otherWritten.append(tone(index + 100, at: Double(index)))
            await rig.microphone.send(tone(index))
            await rig.other.send(tone(index + 100, at: Double(index)))
        }
        await rig.call.setEnabled(true)
        let state = await rig.listening()
        let recovered = ordered(
            entries(0...19, speaker: .mine, later: 0..<20)
                + entries(100...119, speaker: .theirs, later: 0..<20)
        )
        #expect(state == State(status: .listening, entries: recovered))
        await rig.microphone.send(tone(20))
        await rig.other.send(tone(120, at: 20))
        var updates = rig.call.updates.makeAsyncIterator()
        #expect(await updates.next() == State(
            status: .listening,
            entries: recovered + entries(20...20, speaker: .mine) + entries(120...120, speaker: .theirs)
        ))
        #expect(await rig.microphoneWritten.reads == [0..<20])
        #expect(await rig.otherWritten.reads == [0..<20])
        await rig.call.stop()
    }

    @Test(arguments: [false, true])
    func liveTextFailureIsReportedAndKeepsTheTextSoFar(onCallTrack: Bool) async throws {

        let rig = Rig()
        await rig.call.start()
        await rig.listening()
        await rig.microphone.send(tone(0))
        await rig.other.send(tone(100, at: 0))
        let before = await rig.call.state
        let failing = onCallTrack ? rig.other : rig.microphone
        await failing.send(tone(-1, at: 1))
        let after = await rig.call.state
        #expect(after.status == .failed("Live text failed"))
        #expect(after.entries.map(\.text.pending) == ["word0", "word100"])
        #expect(after.entries == before.entries)
        var final: State?
        for await state in rig.call.updates { final = state }
        #expect(final == State(status: .failed("Live text failed"), entries: before.entries))
        await rig.other.send(tone(100, at: 2))
        #expect(await rig.call.state == after)
        await rig.call.stop()
    }

    @Test(arguments: [false, true], Finishing.allCases.flatMap { finishing in
        [1.0, 3.0, 44_100.0, 48_000.0].map { (finishing, $0) }
    })
    private func endingWhileTextIsOffCatchesUpAndFinishes(
        initiallyEnabled: Bool, ending: (Finishing, Double)
    ) async throws {

        let (finishing, sampleRate) = ending
        let rig = Rig(finishing: finishing)
        await rig.call.start(enabled: initiallyEnabled)
        if initiallyEnabled { await rig.listening() }
        let sources = [rig.microphone, rig.other]
        let written = [rig.microphoneWritten, rig.otherWritten]
        for index in sources.indices {
            let offset = index * 100
            await written[index].append(tones(offset...(offset + 3), at: 0, sampleRate: sampleRate))
            await written[index].append(tones((offset + 4)...(offset + 6), at: 4 / sampleRate, sampleRate: sampleRate))
            await sources[index].send(tones(offset...(offset + 2), at: 0, sampleRate: sampleRate))
        }
        if initiallyEnabled { await rig.call.setEnabled(false) }
        let frozen = await rig.call.state.entries
        for index in sources.indices {
            let offset = index * 100
            await sources[index].send(tones((offset + 3)...(offset + 5), at: 3 / sampleRate, sampleRate: sampleRate))
            await sources[index].send(tone(offset + 6, at: 6 / sampleRate, sampleRate: sampleRate))
            sources[index].end()
        }
        await rig.call.waitForAudioEnd()
        #expect(await rig.call.state == State(status: .off, entries: frozen))
        await rig.call.setEnabled(true)
        await rig.call.waitForAudioEnd()
        let expected = (0...6).flatMap { word in
            [State.Speaker.mine, .theirs].enumerated().map { index, speaker in
                let value = "word\(index * 100 + word)"
                let start = word < 4 ? Double(word) / sampleRate : 4 / sampleRate + Double(word - 4) / sampleRate
                return State.Entry(
                    speaker: speaker,
                    text: Text(
                        id: word, start: start, end: start + 1 / sampleRate,
                        settled: finishing == .revised ? "\(value) revised" : "",
                        pending: finishing == .buffered ? value : ""
                    ),
                    writtenLater: !initiallyEnabled || word >= 3
                )
            }
        }
        let state = await rig.call.state
        #expect(state.entries == expected)
        #expect(await rig.microphoneWritten.reads == [(initiallyEnabled ? 3 / sampleRate : 0)..<(6 / sampleRate + 1 / sampleRate)])
        #expect(await rig.otherWritten.reads == [(initiallyEnabled ? 3 / sampleRate : 0)..<(6 / sampleRate + 1 / sampleRate)])
        guard state.status == .finished else {
            Issue.record("Text did not finish after catching up")
            await rig.call.stop()
            return
        }
        var final: State?
        for await update in rig.call.updates { final = update }
        #expect(final == State(status: .finished, entries: expected))
        await rig.call.stop()
    }

    @Test func liveWordsArriveBeforeAnyAudioIsWritten() async throws {

        let rig = Rig()
        await rig.call.start()
        await rig.listening()
        var updates = rig.call.updates.makeAsyncIterator()
        for index in 0..<5 {
            await rig.microphone.send(tone(index))
            #expect(await updates.next() == State(status: .listening, entries: entries(0...index, speaker: .mine)))
        }
        #expect(await rig.microphoneWritten.reads == [])
        #expect(await rig.otherWritten.reads == [])
        await rig.call.stop()
    }

    @Test(arguments: Finishing.allCases, [false, true])
    private func stopFinalizesJoinedInputsAndPreservesTextWhenOff(finishing: Finishing, textOff: Bool) async {

        let rig = Rig(finishing: finishing)
        await rig.call.start()
        await rig.listening()
        for word in 0...1 {
            await rig.microphone.send(tone(word))
            await rig.other.send(tone(word + 100, at: Double(word)))
        }
        if textOff { await rig.call.setEnabled(false) }
        let frozen = await rig.call.state.entries
        #expect(frozen == ordered(entries(0...0, speaker: .mine) + entries(100...100, speaker: .theirs)))
        await rig.call.stop()
        let expected = textOff ? frozen : ordered(
            entries(0...1, speaker: .mine, finishing: finishing)
                + entries(100...101, speaker: .theirs, finishing: finishing)
        )
        var updates = rig.call.updates.makeAsyncIterator()
        #expect(await updates.next() == State(status: .finished, entries: expected))
        #expect(await updates.next() == nil)
        for text in [rig.microphoneText, rig.otherText] {
            #expect(await text.finishCount == (textOff ? 0 : 1))
            #expect(await text.finishedAfterInputEnded)
        }
    }

    @Test(arguments: [false, true])
    func bufferedAudioUsesTheCapturePositionAtSwitchOn(deliverDuringPreparation: Bool) async {

        let rig = Rig(loading: true)
        await rig.call.start(enabled: false)
        rig.microphone.capture(tones(0...1, at: 0, sampleRate: 1))
        rig.other.capture(tones(100...101, at: 0, sampleRate: 1))
        await rig.call.setEnabled(true)
        // These words are captured while preparation is pending, after the switch.
        await rig.microphoneWritten.append(tones(0...2, at: 0, sampleRate: 1))
        await rig.otherWritten.append(tones(100...102, at: 0, sampleRate: 1))
        rig.microphone.capture(tone(2))
        rig.other.capture(tone(102, at: 2))
        if deliverDuringPreparation {
            await rig.microphone.send(tone(2))
            await rig.other.send(tone(102, at: 2))
        }
        await rig.release()
        let prepared = await rig.listening()
        let expected = State(status: .listening, entries: ordered(
            entries(0...2, speaker: .mine, later: 0..<2)
                + entries(100...102, speaker: .theirs, later: 0..<2)
        ))
        #expect(prepared == (deliverDuringPreparation ? expected : State(status: .listening, entries: [])))
        var updates = rig.call.updates.makeAsyncIterator()
        await rig.microphone.send(tones(0...1, at: 0, sampleRate: 1))
        await rig.other.send(tones(100...101, at: 0, sampleRate: 1))
        await rig.microphone.send(tone(2))
        await rig.other.send(tone(102, at: 2))
        if !deliverDuringPreparation {
            #expect(await updates.next() == expected)
        }
        await rig.microphone.send(tone(3))
        await rig.other.send(tone(103, at: 3))
        #expect(await updates.next() == State(
            status: .listening,
            entries: ordered(expected.entries + entries(3...3, speaker: .mine) + entries(103...103, speaker: .theirs))
        ))
        await rig.call.stop()
    }

    @Test(arguments: [false, true])
    func liveAudioQueuedDuringCatchUpIsHeardOnceInOrder(switchingOn: Bool) async {

        let rig = Rig(loading: true, finishing: .buffered)
        await rig.call.start(enabled: !switchingOn)
        for word in 0...1 {
            await rig.microphoneWritten.append(tone(word))
            await rig.otherWritten.append(tone(word + 100, at: Double(word)))
            await rig.microphone.send(tone(word))
            await rig.other.send(tone(word + 100, at: Double(word)))
        }
        await rig.microphoneWritten.holdNextRead()
        await rig.otherWritten.holdNextRead()
        if switchingOn { await rig.call.setEnabled(true) }
        await rig.release()
        for await _ in rig.microphoneWritten.readBegan { break }
        for await _ in rig.otherWritten.readBegan { break }
        let microphone = Task { await rig.microphone.send(tones(2...3, at: 2, sampleRate: 1)) }
        for await index in rig.queuedAudio where index == 0 { break }
        let other = Task { await rig.other.send(tones(102...103, at: 2, sampleRate: 1)) }
        for await index in rig.queuedAudio where index == 1 { break }
        await rig.microphoneWritten.releaseRead()
        await rig.otherWritten.releaseRead()
        await microphone.value
        await other.value
        await rig.call.stop()
        let expected = ordered(
            entries(0...3, speaker: .mine, later: switchingOn ? 0..<2 : 0..<0)
                + entries(100...103, speaker: .theirs, later: switchingOn ? 0..<2 : 0..<0)
        )
        var updates = rig.call.updates.makeAsyncIterator()
        #expect(await updates.next() == State(status: .finished, entries: expected))
        #expect(await updates.next() == nil)
        #expect(await rig.microphoneWritten.reads == [0..<2])
        #expect(await rig.otherWritten.reads == [0..<2])
    }

    @Test(arguments: FailurePoint.allCases, [false, true])
    private func textFailureRetainsTheSnapshotAndEndsUpdates(point: FailurePoint, onCallTrack: Bool) async {

        let rig = Rig()
        await rig.call.start()
        await rig.listening()
        await rig.microphone.send(tone(0))
        await rig.other.send(tone(100, at: 0))
        let retained = ordered(entries(0...0, speaker: .mine) + entries(100...100, speaker: .theirs))
        let failing = onCallTrack ? rig.otherText : rig.microphoneText
        await rig.call.setEnabled(false)
        await failing.failNext(point)
        switch point {
        case .prepare, .hear:
            await rig.microphoneWritten.append(tone(1))
            await rig.otherWritten.append(tone(101, at: 1))
            await rig.microphone.send(tone(1))
            await rig.other.send(tone(101, at: 1))
            // Keep the other track from adding text before the failure.
            await (onCallTrack ? rig.microphoneText : rig.otherText).holdPreparation()
            await rig.call.setEnabled(true)
        case .finish:
            await rig.call.setEnabled(true)
            await rig.listening()
            await rig.call.stop()
        }
        var final: State?
        for await update in rig.call.updates { final = update }
        #expect(final == State(status: .failed("Live text failed at \(point)"), entries: retained))
        #expect(await rig.call.state == final)
        await rig.call.stop()
    }
}

private func tone(_ word: Int, at start: Double? = nil, sampleRate: Double = 1) -> Audio {

    Audio(start: start ?? Double(word) / sampleRate, samples: [Float(word)], sampleRate: sampleRate)
}

private func tones(_ words: ClosedRange<Int>, at start: Double, sampleRate: Double) -> Audio {

    Audio(start: start, samples: words.map { Float($0) }, sampleRate: sampleRate)
}

private func words(_ range: ClosedRange<Int>) -> [String] {

    range.map { "word\($0)" }
}

private enum Finishing: CaseIterable, Sendable {

    case buffered, revised
}

private struct Rig: Sendable {

    let microphone = CueAudio()
    let other = CueAudio()
    let microphoneWritten = MemoryTrack()
    let otherWritten = MemoryTrack()
    let microphoneText: ToneText
    let otherText: ToneText
    let call: CallText
    let queuedAudio: AsyncStream<Int>

    init(loading: Bool = false, finishing: Finishing? = nil) {

        microphoneText = ToneText(loading: loading, finishing: finishing, inputEnded: { [microphone] in microphone.subscriptionEnded })
        otherText = ToneText(loading: loading, finishing: finishing, inputEnded: { [other] in other.subscriptionEnded })
        let (queued, queuedContinuation) = AsyncStream<Int>.makeStream()
        queuedAudio = queued
        call = CallText(
            microphone: Track(audio: microphone, written: microphoneWritten, text: microphoneText),
            call: Track(audio: other, written: otherWritten, text: otherText),
            inputQueued: { queuedContinuation.yield($0) }
        )
    }

    func release() async {

        await microphoneText.release()
        await otherText.release()
    }

    @discardableResult
    func listening() async -> State {

        for await state in call.updates {
            if state.status == .listening, await call.state.status == .listening { return state }
        }
        Issue.record("Text ended before it was ready")
        return await call.state
    }
}

/// A delivery completes only after the subscriber has handled its audio.
private final class CueAudio: LiveAudio, Sendable {

    private struct Delivery: Sendable {

        let audio: Audio
        let handled: CheckedContinuation<Void, Never>
    }

    private let position = Mutex(0.0)
    private let ended = Mutex(false)
    var capturedThrough: Double { position.withLock { $0 } }
    var subscriptionEnded: Bool { ended.withLock { $0 } }

    func capture(_ audio: Audio) { position.withLock { $0 = max($0, audio.end) } }

    private let stream: AsyncStream<Delivery>
    private let continuation: AsyncStream<Delivery>.Continuation

    init() {

        (stream, continuation) = AsyncStream.makeStream()
    }

    func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async {

        for await delivery in stream {
            await receive(delivery.audio)
            delivery.handled.resume()
        }
        ended.withLock { $0 = true }
    }

    func send(_ audio: Audio) async {

        capture(audio)
        await withCheckedContinuation { handled in
            continuation.yield(Delivery(audio: audio, handled: handled))
        }
    }

    func end() { continuation.finish() }
}

private actor MemoryTrack: WrittenTrack {

    private var chunks: [Audio] = []
    private(set) var reads: [Range<Double>] = []
    private var holdsRead = false
    private var waiting: CheckedContinuation<Void, Never>?
    nonisolated let readBegan: AsyncStream<Void>
    private let readContinuation: AsyncStream<Void>.Continuation

    init() {

        (readBegan, readContinuation) = AsyncStream.makeStream()
    }

    func holdNextRead() { holdsRead = true }

    func releaseRead() {

        holdsRead = false
        waiting?.resume()
        waiting = nil
    }

    func append(_ audio: Audio) { chunks.append(audio) }

    func read(from: Double, through: Double) async throws -> [Audio] {

        reads.append(from..<through)
        if holdsRead {
            readContinuation.yield(())
            await withTaskCancellationHandler {
                await withCheckedContinuation {
                    if Task.isCancelled { $0.resume() } else { waiting = $0 }
                }
            } onCancel: {
                Task { await self.releaseRead() }
            }
        }
        try Task.checkCancellation()
        return chunks.filter { $0.end > from && $0.start < through }
    }
}

/// A word is decoded only from its tone; there is no scripted transcript.
private actor ToneText: TrackText {

    struct Failed: Error, CustomStringConvertible {

        var description: String { "Live text failed" }
    }

    private var loading: Bool
    private var failure: FailurePoint?
    private let inputEnded: @Sendable () -> Bool
    private(set) var finishCount = 0
    private(set) var finishedAfterInputEnded = true
    private let finishing: Finishing?
    private var waiting: CheckedContinuation<Void, Never>?
    private var text: [Text] = []
    private var holdsNextHearing = false
    nonisolated let hearingBegan: AsyncStream<Void>
    private let hearingContinuation: AsyncStream<Void>.Continuation

    init(loading: Bool, finishing: Finishing?, inputEnded: @escaping @Sendable () -> Bool) {

        self.inputEnded = inputEnded
        self.loading = loading
        self.finishing = finishing
        (hearingBegan, hearingContinuation) = AsyncStream.makeStream()
    }

    func failNext(_ point: FailurePoint) { failure = point }

    func holdPreparation() { loading = true }

    private func checkFailure(_ point: FailurePoint) throws {

        if failure == point {
            failure = nil
            throw CuedFailure(point: point)
        }
    }

    func prepare() async throws {

        try checkFailure(.prepare)
        if loading {
            await waitForRelease()
        }
        try Task.checkCancellation()
    }

    private func waitForRelease() async {

        await withTaskCancellationHandler {
            await withCheckedContinuation {
                if Task.isCancelled { $0.resume() } else { waiting = $0 }
            }
        } onCancel: {
            Task { await self.cancelWait() }
        }
    }

    func release() {

        loading = false
        cancelWait()
    }

    private func cancelWait() {

        waiting?.resume()
        waiting = nil
    }

    func holdNextHearing() { holdsNextHearing = true }

    func hear(_ audio: Audio) async throws -> [Text] {

        try checkFailure(.hear)
        for (index, sample) in audio.samples.enumerated() {
            guard sample >= 0 else { throw Failed() }
            let start = audio.start + Double(index) / audio.sampleRate
            text.append(Text(id: text.count, start: start, end: start + 1 / audio.sampleRate, pending: "word\(Int(sample))"))
        }
        if holdsNextHearing {
            holdsNextHearing = false
            hearingContinuation.yield(())
            await waitForRelease()
        }
        return finishing == nil ? text : Array(text.dropLast())
    }

    func finish() throws -> [Text] {

        finishCount += 1
        finishedAfterInputEnded = finishedAfterInputEnded && inputEnded()
        try checkFailure(.finish)
        if finishing == .revised {
            return text.map { Text(id: $0.id, start: $0.start, end: $0.end, settled: "\($0.pending) revised") }
        }
        return text
    }
}

private enum FailurePoint: CaseIterable, Sendable {

    case prepare, hear, finish
}

private struct CuedFailure: Error, CustomStringConvertible {

    let point: FailurePoint
    var description: String { "Live text failed at \(point)" }
}

private func entries(
    _ words: ClosedRange<Int>, speaker: State.Speaker, sampleRate: Double = 1,
    later: Range<Int> = 0..<0, finishing: Finishing? = nil, chunkStarts: [Int] = []
) -> [State.Entry] {

    words.map { word in
        let index = word % 100
        let value = "word\(word)"
        let base = chunkStarts.last { $0 <= index } ?? 0
        let start = Double(base) / sampleRate + Double(index - base) / sampleRate
        return State.Entry(
            speaker: speaker,
            text: Text(
                id: index, start: start, end: start + 1 / sampleRate,
                settled: finishing == .revised ? "\(value) revised" : "",
                pending: finishing == .revised ? "" : value
            ),
            writtenLater: later.contains(index)
        )
    }
}

private func ordered(_ entries: [State.Entry]) -> [State.Entry] {

    entries.sorted {
        if $0.text.start != $1.text.start { return $0.text.start < $1.text.start }
        return $0.speaker == .mine && $1.speaker == .theirs
    }
}
