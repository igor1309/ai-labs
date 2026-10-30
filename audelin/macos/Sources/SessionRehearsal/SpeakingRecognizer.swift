import LiveText

/// Speaks a word every 0.4 s in sentences of `sentence` seconds with `pause`
/// seconds of silence between them; words are final a second after they end.
/// With a monologue, every `every` seconds the speaker talks for `length`
/// seconds without a pause.
public actor SpeakingRecognizer: Recognizer {

    public struct Monologue: Sendable {

        public let every: Double
        public let length: Double

        public init(every: Double, length: Double) {

            self.every = every
            self.length = length
        }
    }

    private let name: String
    private let sentence: Double
    private let pause: Double
    private let offset: Double
    private let monologue: Monologue?
    private var heard = 0.0
    /// Words fall every 0.4 s; counting them keeps their times exact.
    private var slot = 0
    private var pending: [Word] = []
    public private(set) var heardSamples = 0
    public private(set) var words = 0

    public init(name: String, sentence: Double, pause: Double, offset: Double, monologue: Monologue? = nil) {

        self.name = name
        self.sentence = sentence
        self.pause = pause
        self.offset = offset
        self.monologue = monologue
    }

    public func hear(_ chunk: AudioChunk) -> Hearing {

        heardSamples += chunk.samples.count
        heard = Double(heardSamples) / chunk.sampleRate
        while time(of: slot) + 0.3 <= heard {
            let start = time(of: slot)
            if speaks(at: start) {
                words += 1
                pending.append(Word("\(name)\(words)", start: start, end: start + 0.3))
            }
            slot += 1
        }
        return report(finalThrough: heard - 1)
    }

    public func finish() -> Hearing { report(finalThrough: heard) }

    private func time(of slot: Int) -> Double { offset + Double(slot) * 4 / 10 }

    private func speaks(at time: Double) -> Bool {

        if let monologue, time.truncatingRemainder(dividingBy: monologue.every) >= monologue.every - monologue.length {
            return true
        }
        return (time - offset).truncatingRemainder(dividingBy: sentence + pause) < sentence
    }

    private func report(finalThrough: Double) -> Hearing {

        let hearing = Hearing(words: pending, from: pending.first?.start ?? heard, finalThrough: finalThrough)
        pending.removeAll { $0.end <= finalThrough }
        return hearing
    }
}
