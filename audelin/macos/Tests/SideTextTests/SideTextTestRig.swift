import Synchronization
import Testing
@testable import SideText

/// Retains arrivals so a release never depends on task scheduling.
actor Gate {

    private let arrivals = AsyncStream<Void>.makeStream()
    private var waiting: CheckedContinuation<Void, Never>?
    private(set) var isHeld = true

    func wait() async {

        guard isHeld else { return }
        await withCheckedContinuation {
            waiting = $0
            arrivals.continuation.yield(())
        }
    }

    func entered() async {

        var iterator = arrivals.stream.makeAsyncIterator()
        _ = await iterator.next()
    }

    func release() {

        isHeld = false
        waiting?.resume()
        waiting = nil
        arrivals.continuation.finish()
    }
}

/// Delivery acknowledges the subscriber, independently of buffered capture.
final class CueAudio: LiveAudio, Sendable {

    private struct Delivery: Sendable {

        let audio: Audio
        let handled: CheckedContinuation<Void, Never>
    }

    private let chunks = Mutex<[Audio]>([])
    private let heldDelivery = Mutex<Gate?>(nil)
    private let ended = Mutex(false)
    private let deliveries = AsyncStream<Delivery>.makeStream()
    var capturedThrough: Double { chunks.withLock { $0.last?.end ?? 0 } }
    var isEnded: Bool { ended.withLock { $0 } }

    func capture(_ audio: Audio) { chunks.withLock { $0.append(audio) } }

    func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async {

        for await delivery in deliveries.stream {
            let held = heldDelivery.withLock { gate in
                defer { gate = nil }
                return gate
            }
            await held?.wait()
            await receive(delivery.audio)
            delivery.handled.resume()
        }
    }

    func deliver(_ audio: Audio) async {

        await withCheckedContinuation {
            deliveries.continuation.yield(Delivery(audio: audio, handled: $0))
        }
    }

    func send(_ audio: Audio) async {

        capture(audio)
        await deliver(audio)
    }

    func read(from: Double, through: Double) -> [Audio] {

        chunks.withLock { chunks in
            chunks.compactMap { chunk in
                let lower = max(0, Int(((from - chunk.start) * chunk.sampleRate).rounded()))
                let upper = min(chunk.samples.count, Int(((through - chunk.start) * chunk.sampleRate).rounded()))
                guard lower < upper else { return nil }
                return Audio(
                    start: chunk.start + Double(lower) / chunk.sampleRate,
                    samples: Array(chunk.samples[lower..<upper]), sampleRate: chunk.sampleRate
                )
            }
        }
    }

    func holdNextDelivery(_ gate: Gate) { heldDelivery.withLock { $0 = gate } }

    func end() {

        ended.withLock { $0 = true }
        deliveries.continuation.finish()
    }
}

/// Only tones can create words, including a word buffered until finishing.
actor ToneText: LiveText {

    private var words: [Text] = []
    private var buffered: Text?
    private let finishOnlyWord: Int?
    private let failWord: Int?
    private let failFinish: Bool
    private var hearing: Gate?
    private let stopping: Gate?
    private(set) var samples: [Float] = []
    private(set) var stopCalls = 0
    private(set) var stopped = false
    private(set) var finishCalls = 0

    init(failWord: Int?, failFinish: Bool, finishOnlyWord: Int?, hearing: Gate?, stopping: Gate?) {

        self.failWord = failWord
        self.failFinish = failFinish
        self.finishOnlyWord = finishOnlyWord
        self.hearing = hearing
        self.stopping = stopping
    }

    func holdNextHearing(_ gate: Gate) { hearing = gate }

    func hear(_ audio: Audio) async throws -> [Text] {

        let held = hearing
        hearing = nil
        await held?.wait()
        for (index, sample) in audio.samples.enumerated() {
            let word = Int(sample)
            if word == failWord { throw CuedFailure(description: "hearing failed") }
            samples.append(sample)
            let start = audio.start + Double(index) / audio.sampleRate
            let segment = Text(id: word, start: start, end: start + 1 / audio.sampleRate, pending: "word\(word)")
            if word == finishOnlyWord {
                buffered = segment
            } else if let last = words.last, last.id == word {
                words[words.count - 1] = Text(id: word, start: last.start, end: segment.end, pending: last.pending)
            } else {
                words.append(segment)
            }
        }
        return words
    }

    func finish() throws -> [Text] {

        finishCalls += 1
        if failFinish { throw CuedFailure(description: "finishing failed") }
        if let buffered { words.append(buffered) }
        words = words.map { Text(id: $0.id, start: $0.start, end: $0.end, settled: $0.pending) }
        return words
    }

    func stop() async {

        stopCalls += 1
        await stopping?.wait()
        stopped = true
    }
}

struct CuedFailure: Error, CustomStringConvertible {

    let description: String
}

struct FillPlan: Sendable {

    var through: Double? = nil
    var before: Gate? = nil
    var prefixThrough: Double? = nil
    var afterPrefix: Gate? = nil
    var failure: String? = nil
}

/// Produces fill results from captured tones, independently of live delivery.
actor FakeFill: FillingIn {

    let audio: CueAudio
    let text: ToneText
    let plan: FillPlan
    private(set) var abandoned = false
    private(set) var starts: [Double] = []

    init(audio: CueAudio, text: ToneText, plan: FillPlan) {

        self.audio = audio
        self.text = text
        self.plan = plan
    }

    func fillIn(from: Double, receive: @escaping @Sendable (FilledText) async -> Void) async throws {

        starts.append(from)
        let boundary = plan.through ?? audio.capturedThrough
        await plan.before?.wait()
        guard !abandoned else { return }
        if let prefix = plan.prefixThrough {
            try await read(from: from, through: prefix, receive: receive)
            await plan.afterPrefix?.wait()
            guard !abandoned else { return }
            if let failure = plan.failure { throw CuedFailure(description: failure) }
            try await read(from: prefix, through: boundary, receive: receive)
        } else {
            if let failure = plan.failure { throw CuedFailure(description: failure) }
            try await read(from: from, through: boundary, receive: receive)
        }
    }

    private func read(
        from: Double, through: Double, receive: @escaping @Sendable (FilledText) async -> Void
    ) async throws {

        for chunk in audio.read(from: from, through: through) {
            let words = try await text.hear(chunk)
            await receive(FilledText(text: words, heardThrough: chunk.end, sampleRate: chunk.sampleRate))
        }
    }

    func abandon() { abandoned = true }
}

final class FillFactory: Sendable {

    private let pending: Mutex<[FakeFill]>

    init(_ runs: [FakeFill]) { pending = Mutex(runs) }

    func next() -> any FillingIn { pending.withLock { $0.removeFirst() } }
}

struct Rig: Sendable {

    let audio: CueAudio
    let text: ToneText
    let fills: [FakeFill]
    let side: SideText
    let queued: AsyncStream<Void>
    let audioEnds: AsyncStream<Void>
    let stopRequests: AsyncStream<Void>

    @discardableResult
    func listening() async -> State {

        for await state in side.updates where state.status == .listening { return state }
        Issue.record("Text ended before listening")
        return await side.state
    }

    func inputQueued() async {

        var iterator = queued.makeAsyncIterator()
        _ = await iterator.next()
    }

    func audioEndReceived() async {

        var iterator = audioEnds.makeAsyncIterator()
        _ = await iterator.next()
    }

    func stopRequested() async {

        var iterator = stopRequests.makeAsyncIterator()
        _ = await iterator.next()
    }

    func heldStop(_ stopping: Gate, keeps snapshot: State) async {

        await stopping.entered()
        #expect(await side.state == snapshot)
        #expect(await text.stopCalls == 1)
        #expect(await text.stopped == false)
    }

    func result() async -> State {

        var final: State?
        var endings = 0
        for await state in side.updates {
            final = state
            switch state.status {
            case .finished, .failed: endings += 1
            default: break
            }
        }
        let state = await side.state
        #expect(endings == 1)
        #expect(final == state)
        #expect(await text.stopCalls == 1)
        #expect(await text.stopped)
        return state
    }
}

func withRig(
    plans: [FillPlan] = [FillPlan()], failWord: Int? = nil, failFinish: Bool = false,
    finishOnlyWord: Int? = nil, hearing: Gate? = nil, stopping: Gate? = nil,
    body: (Rig) async -> Void
) async {

    let audio = CueAudio()
    let text = ToneText(
        failWord: failWord, failFinish: failFinish, finishOnlyWord: finishOnlyWord,
        hearing: hearing, stopping: stopping
    )
    let fills = plans.map { FakeFill(audio: audio, text: text, plan: $0) }
    let factory = FillFactory(fills)
    let queued = AsyncStream<Void>.makeStream()
    let audioEnds = AsyncStream<Void>.makeStream()
    let stopRequests = AsyncStream<Void>.makeStream()
    let side = SideText(
        audio: audio, text: text, fillIn: { factory.next() },
        inputQueued: { queued.continuation.yield(()) },
        audioEndReceived: { audioEnds.continuation.yield(()) },
        stopRequested: { stopRequests.continuation.yield(()) }
    )
    await body(Rig(
        audio: audio, text: text, fills: fills, side: side, queued: queued.stream,
        audioEnds: audioEnds.stream, stopRequests: stopRequests.stream
    ))
    await side.setEnabled(false)
    for plan in plans {
        await plan.before?.release()
        await plan.afterPrefix?.release()
    }
    await hearing?.release()
    await stopping?.release()
    audio.end()
    await side.waitForWork()
    await side.waitForAudioEnd()
    queued.continuation.finish()
    audioEnds.continuation.finish()
    stopRequests.continuation.finish()
}

func tones(_ words: ClosedRange<Int>, sampleRate: Double = 1) -> Audio {

    Audio(start: Double(words.lowerBound - 1) / sampleRate, samples: words.map(Float.init), sampleRate: sampleRate)
}

func expected(
    _ words: ClosedRange<Int>, status: State.Status = .listening,
    later: Range<Int> = 0..<0, sampleRate: Double = 1, settled: Bool = false
) -> State {

    State(status: status, entries: words.map { word in
        let start = Double(word - 1) / sampleRate
        return State.Entry(
            text: Text(
                id: word, start: start, end: start + 1 / sampleRate,
                settled: settled ? "word\(word)" : "", pending: settled ? "" : "word\(word)"
            ),
            writtenLater: later.contains(word)
        )
    })
}
