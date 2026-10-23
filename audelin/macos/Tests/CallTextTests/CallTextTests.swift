import Testing
@testable import CallText

struct CallTextTests {

    @Test(arguments: [1.0, 3.0, 44_100.0, 48_000.0])
    func microphoneWordsAppearAsMineBeforeTheNextWord(sampleRate: Double) async throws {

        let rig = Rig()
        await rig.call.start()
        await rig.listening()
        for index in 0..<12 {
            await rig.microphone.send(Audio(start: Double(index) / sampleRate, samples: [Float(index)], sampleRate: sampleRate))
            let state = await rig.call.state
            #expect(state.entries.map(\.speaker) == Array(repeating: .mine, count: index + 1))
            #expect(state.entries.map(\.text.pending) == words(0...index))
        }
        rig.microphone.end()
        rig.other.end()
        var endedNormally = false
        for await state in rig.call.updates {
            if state.status == .finished {
                #expect(state.entries.map(\.text.pending) == words(0...11))
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
        for index in 0..<4 {
            await rig.other.send(tone(index))
            let state = await rig.call.state
            #expect(state.entries.map(\.speaker) == Array(repeating: .theirs, count: index + 1))
            #expect(state.entries.map(\.text.pending) == words(0...index))
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
        await rig.listening()
        let resumed = await rig.call.state
        #expect(resumed.entries.filter { $0.speaker == .mine }.map(\.text.pending) == words(0...7))
        #expect(resumed.entries.filter { $0.speaker == .theirs }.map(\.text.pending) == words(100...107))
        #expect(resumed.entries.filter { $0.text.start == 0 }.allSatisfy { !$0.writtenLater })
        #expect(resumed.entries.filter { $0.text.start > 0 }.allSatisfy { $0.writtenLater })
        #expect(await rig.microphoneWritten.reads == [(2 / sampleRate)..<(7 / sampleRate + 1 / sampleRate)])
        #expect(await rig.otherWritten.reads == [(1 / sampleRate)..<(7 / sampleRate + 1 / sampleRate)])
        await rig.microphone.send(tones(8...9, at: 8 / sampleRate, sampleRate: sampleRate))
        let live = await rig.call.state
        #expect(live.entries.map(\.text.pending) == (0...7).flatMap { ["word\($0)", "word\($0 + 100)"] } + ["word8", "word9"])
        #expect(live.entries.suffix(2).allSatisfy { !$0.writtenLater })
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
        await rig.listening()
        let state = await rig.call.state
        #expect(state.entries.filter { $0.speaker == .mine }.map(\.text.pending) == words(0...19))
        #expect(state.entries.filter { $0.speaker == .theirs }.map(\.text.pending) == words(100...119))
        #expect(!state.entries.isEmpty && state.entries.allSatisfy(\.writtenLater))
        await rig.microphone.send(tone(20))
        await rig.other.send(tone(120, at: 20))
        let live = await rig.call.state
        #expect(live.entries.filter { $0.text.start == 20 }.map(\.text.pending) == ["word20", "word120"])
        #expect(live.entries.filter { $0.text.start == 20 }.allSatisfy { !$0.writtenLater })
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
        for index in 0..<5 {
            await rig.microphone.send(tone(index))
            let state = await rig.call.state
            #expect(state.entries.map(\.text.pending) == words(0...index))
            #expect(state.entries.allSatisfy { $0.speaker == .mine && !$0.writtenLater })
        }
        #expect(await rig.microphoneWritten.reads == [])
        #expect(await rig.otherWritten.reads == [])
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

    init(loading: Bool = false, finishing: Finishing? = nil) {

        microphoneText = ToneText(loading: loading, finishing: finishing)
        otherText = ToneText(loading: loading, finishing: finishing)
        call = CallText(
            microphone: Track(audio: microphone, written: microphoneWritten, text: microphoneText),
            call: Track(audio: other, written: otherWritten, text: otherText)
        )
    }

    func release() async {

        await microphoneText.release()
        await otherText.release()
    }

    func listening() async {

        for await state in call.updates {
            if state.status == .listening, await call.state.status == .listening { return }
        }
        Issue.record("Text ended before it was ready")
    }
}

/// A delivery completes only after the subscriber has handled its audio.
private final class CueAudio: LiveAudio, Sendable {

    private struct Delivery: Sendable {

        let audio: Audio
        let handled: CheckedContinuation<Void, Never>
    }

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
    }

    func send(_ audio: Audio) async {

        await withCheckedContinuation { handled in
            continuation.yield(Delivery(audio: audio, handled: handled))
        }
    }

    func end() { continuation.finish() }
}

private actor MemoryTrack: WrittenTrack {

    private var chunks: [Audio] = []
    private(set) var reads: [Range<Double>] = []

    func append(_ audio: Audio) { chunks.append(audio) }

    func read(from: Double, through: Double) -> [Audio] {

        reads.append(from..<through)
        return chunks.filter { $0.end > from && $0.start < through }
    }
}

/// A word is decoded only from its tone; there is no scripted transcript.
private actor ToneText: TrackText {

    struct Failed: Error, CustomStringConvertible {

        var description: String { "Live text failed" }
    }

    private var loading: Bool
    private let finishing: Finishing?
    private var waiting: CheckedContinuation<Void, Never>?
    private var text: [Text] = []
    private var holdsNextHearing = false
    nonisolated let hearingBegan: AsyncStream<Void>
    private let hearingContinuation: AsyncStream<Void>.Continuation

    init(loading: Bool, finishing: Finishing?) {

        self.loading = loading
        self.finishing = finishing
        (hearingBegan, hearingContinuation) = AsyncStream.makeStream()
    }

    func prepare() async throws {

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

    func finish() -> [Text] {

        if finishing == .revised {
            return text.map { Text(id: $0.id, start: $0.start, end: $0.end, settled: "\($0.pending) revised") }
        }
        return text
    }
}
