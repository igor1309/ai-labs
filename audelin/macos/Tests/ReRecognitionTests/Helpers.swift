import ReRecognition
import Synchronization

typealias R = ReRecognition

func word(_ text: String, _ start: Double = 1, _ end: Double = 3) -> R.Word {
    .init(text: text, time: .init(start: start, end: end))
}

let original = R.OriginalCall(id: "original", farTrack: "far-track", microphoneTrack: "mic-track", duration: 20)
let build = R.Build(version: "2.1", number: "44")

enum PortFailure: Error { case hearing, loading, splitting, cleaning, reading, publishing }
enum Stage: Sendable { case hearFar, hearMicrophone, split, clean, read, publish }
enum Answer: Sendable { case kept, nothing, failed }

enum Call: Equatable, Sendable {
    case hear(String), split(R.OriginalCall, [R.Word]), clean(R.OriginalCall, [R.Word], [R.Speaker])
    case read(String), names([R.OldSpeaker], [R.Speaker]), publish(String, R.Transcript)
    case wait(R.Wait), returned(Stage), outcome(R.Outcome)
}

/// A port announces entering the gate and waits until the test completes its work.
actor Gate {
    private var entered = false
    private var opened = false
    private var arrival: CheckedContinuation<Void, Never>?
    private var completion: CheckedContinuation<Void, Never>?

    func hold() async {
        entered = true
        arrival?.resume(); arrival = nil
        if !opened { await withCheckedContinuation { completion = $0 } }
    }

    func waitUntilEntered() async {
        if !entered { await withCheckedContinuation { arrival = $0 } }
    }

    func release() {
        opened = true
        completion?.resume(); completion = nil
    }
}

final class Spy: Sendable {
    let records = Mutex<[Call]>([])
    let splitAnswer: Answer
    let cleanAnswer: Answer
    let failure: PortFailure?
    let hearingFailureTrack: String
    let held: Stage?
    let gate: Gate
    let old: [R.OldSpeaker]
    let carried: [Int: String]
    let fractions: [Double]

    init(split: Answer = .kept, clean: Answer = .kept, failure: PortFailure? = nil,
         hearingFailureTrack: String = "far-track", held: Stage? = nil, gate: Gate = Gate(),
         old: [R.OldSpeaker] = [], carried: [Int: String] = [:], fractions: [Double] = [0, 0.5, 1]) {
        splitAnswer = split; cleanAnswer = clean; self.failure = failure
        self.hearingFailureTrack = hearingFailureTrack; self.held = held; self.gate = gate
        self.old = old; self.carried = carried; self.fractions = fractions
    }

    func record(_ call: Call) { records.withLock { $0.append(call) } }
    var calls: [Call] { records.withLock { $0 } }
    var publications: [R.Transcript] {
        calls.compactMap { if case let .publish(_, transcript) = $0 { transcript } else { nil } }
    }

    func finish(_ stage: Stage) async {
        if held == stage { await gate.hold() }
        record(.returned(stage))
    }

    func component(names: R.CarryNames? = nil) -> R {
        R(
            hear: { [self] track, report in
                record(.hear(track))
                let stage: Stage = track == "far-track" ? .hearFar : .hearMicrophone
                if held == stage { await gate.hold() }
                defer { record(.returned(stage)) }
                if failure == .loading { throw PortFailure.loading }
                for fraction in fractions { await report(fraction) }
                if failure == .hearing && track == hearingFailureTrack { throw PortFailure.hearing }
                return .init(words: [word(track)], model: "model-\(track)")
            },
            split: { [self] call, words in
                record(.split(call, words)); await finish(.split)
                switch splitAnswer {
                case .failed: throw PortFailure.splitting
                case .nothing: return nil
                case .kept: return .init(speakers: [.init(id: 7, name: nil, words: [word("split")])], diarizer: "diarizer")
                }
            },
            clean: { [self] call, words, far in
                record(.clean(call, words, far)); await finish(.clean)
                switch cleanAnswer {
                case .failed: throw PortFailure.cleaning
                case .nothing: return nil
                case .kept: return [word("cleaned")]
                }
            },
            readOld: { [self] call in
                record(.read(call)); await finish(.read)
                if failure == .reading { throw PortFailure.reading }
                return old
            },
            names: { [self] old, new in
                record(.names(old, new))
                return names?(old, new) ?? carried
            },
            publish: { [self] call, transcript in
                record(.publish(call, transcript)); await finish(.publish)
                if failure == .publishing { throw PortFailure.publishing }
            }
        )
    }

    func run(_ sut: R? = nil, originals: [R.OriginalCall] = [original]) async -> R.Outcome {
        let outcome = await (sut ?? component()).run(call: "current", originals: originals, build: build) {
            self.record(.wait($0))
        }
        record(.outcome(outcome))
        return outcome
    }
}

func expectedTranscript(split: Bool = true, cleaned: Bool = true, name: String? = nil) -> R.Transcript {
    .init(originals: [.init(
        original: original,
        far: [.init(id: split ? 7 : 0, name: name, words: [word(split ? "split" : "far-track")])],
        microphone: [word(cleaned ? "cleaned" : "mic-track")],
        origin: .init(build: build, farModel: "model-far-track", microphoneModel: "model-mic-track",
                      splitting: split ? .done(diarizer: "diarizer") : .nothingKept,
                      cleaning: cleaned ? .done : .nothingKept)
    )])
}
