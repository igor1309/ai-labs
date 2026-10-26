import Synchronization
import Testing
@testable import FillIn

/// Ignores cancellation so abandonment is proved independently of collaborators.
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

final class CuePosition: LiveAudioPosition, Sendable {

    private let value = Mutex(Position(capturedThrough: 0, ended: false))
    var position: Position { value.withLock { $0 } }

    func set(through: Double, ended: Bool = false) {

        value.withLock { $0 = Position(capturedThrough: through, ended: ended) }
    }
}

actor MemoryTrack: WrittenTrack {

    private var chunks: [Audio] = []
    private(set) var reads: [Range<Double>] = []
    private let hold: (Int, Gate)?
    private let failure: Int?

    init(hold: (Int, Gate)?, failure: Int?) {

        self.hold = hold
        self.failure = failure
    }

    func append(_ chunk: Audio) { chunks.append(chunk) }

    func read(from: Double, through: Double) async throws -> [Audio] {

        reads.append(from..<through)
        let number = reads.count
        if let (index, gate) = hold, index == number { await gate.wait() }
        if failure == number { throw CuedFailure(description: "read failed") }
        return chunks.filter { $0.end > from && $0.start < through }
    }
}

/// A word is decoded only from its written tone; there is no scripted transcript.
actor ToneText: LiveText {

    private let loading: Gate?
    private let hold: (Int, Gate)?
    private let failPreparation: Bool
    private let failWord: Int?
    private var text: [Text] = []
    private var hearings = 0
    private(set) var heardSamples: [Float] = []
    private(set) var preparations = 0

    init(loading: Gate?, hold: (Int, Gate)?, failPreparation: Bool, failWord: Int?) {

        self.loading = loading
        self.hold = hold
        self.failPreparation = failPreparation
        self.failWord = failWord
    }

    func prepare() async throws {

        preparations += 1
        await loading?.wait()
        if failPreparation { throw CuedFailure(description: "preparation failed") }
    }

    func hear(_ audio: Audio) async throws -> [Text] {

        hearings += 1
        if let (index, gate) = hold, index == hearings { await gate.wait() }
        for (index, sample) in audio.samples.enumerated() {
            let word = Int(sample)
            if failWord == word { throw CuedFailure(description: "hearing failed at word\(word)") }
            heardSamples.append(sample)
            let start = audio.start + Double(index) / audio.sampleRate
            text.append(Text(id: word, start: start, end: start + 1 / audio.sampleRate, pending: "word\(word)"))
        }
        return text
    }
}

private struct CuedFailure: Error, CustomStringConvertible {

    let description: String
}

struct Rig: Sendable {

    let written: MemoryTrack
    let text: ToneText
    let audio: CuePosition
    let fill: FillIn

    func write(_ words: Range<Int>, ended: Bool = false) async {

        for word in words {
            await written.append(Audio(start: Double(word), samples: [Float(word)], sampleRate: 1))
        }
        audio.set(through: Double(words.upperBound), ended: ended)
    }

    func result() async -> State {

        var final: State?
        for await state in fill.updates { final = state }
        let state = await fill.state
        #expect(final == state)
        return state
    }
}

func withRig(
    loading: Gate? = nil, readHold: (Int, Gate)? = nil, hearHold: (Int, Gate)? = nil,
    failPreparation: Bool = false, failRead: Int? = nil, failWord: Int? = nil,
    body: (Rig) async -> Void
) async {

    let written = MemoryTrack(hold: readHold, failure: failRead)
    let text = ToneText(loading: loading, hold: hearHold, failPreparation: failPreparation, failWord: failWord)
    let audio = CuePosition()
    let fill = FillIn(written: written, text: text, audio: audio)
    await body(Rig(written: written, text: text, audio: audio, fill: fill))
    await fill.abandon()
    await loading?.release()
    await readHold?.1.release()
    await hearHold?.1.release()
    await fill.waitForWork()
}
