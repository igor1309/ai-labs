/// Cleans a recording's microphone against its call track.
public protocol MicrophoneCleaning<Recording, Samples>: Sendable {

    associatedtype Recording: Sendable
    associatedtype Samples: Sendable

    func clean(_ recording: Recording) async throws -> Samples
}

/// Hears cleaned samples; nil means no microphone text was heard.
public protocol CleanedHearing<Samples, Text>: Sendable {

    associatedtype Samples: Sendable
    associatedtype Text: Sendable

    func hear(_ samples: Samples) async throws -> Text?
}

/// Replaces only the microphone side, preserving the call side. A failed
/// replacement must leave the saved transcript unchanged.
public protocol MicrophoneReplacing<Recording, Text>: Sendable {

    associatedtype Recording: Sendable
    associatedtype Text: Sendable

    func replaceMicrophone(of recording: Recording, with text: Text) async throws
}

public enum CleanupStep: Equatable, Sendable {
    case cleaning, hearing, replacing
}

public enum KeptReason: Sendable {
    case noBleedFound
    case nothingHeard
    case failed(step: CleanupStep, error: any Error)
}

public enum CleanupOutcome: Sendable {
    case replaced
    case kept(KeptReason)
}

/// Runs cleanup for one ended call, keeping no per-call state.
public struct BleedCleanup<Recording: Sendable, Samples: Sendable, Text: Sendable>: Sendable {

    private let gate: BleedGate
    private let cleaning: any MicrophoneCleaning<Recording, Samples>
    private let hearing: any CleanedHearing<Samples, Text>
    private let replacing: any MicrophoneReplacing<Recording, Text>

    public init(
        gate: BleedGate,
        cleaning: any MicrophoneCleaning<Recording, Samples>,
        hearing: any CleanedHearing<Samples, Text>,
        replacing: any MicrophoneReplacing<Recording, Text>
    ) {

        self.gate = gate
        self.cleaning = cleaning
        self.hearing = hearing
        self.replacing = replacing
    }

    public func run(
        recording: Recording, microphone: [Word], call: [Word], duration: Double
    ) async -> CleanupOutcome {

        guard gate.isGated(microphone: microphone, call: call, duration: duration) else {
            return .kept(.noBleedFound)
        }

        let samples: Samples
        do {
            samples = try await cleaning.clean(recording)
        } catch {
            return .kept(.failed(step: .cleaning, error: error))
        }

        let text: Text
        do {
            guard let heard = try await hearing.hear(samples) else {
                return .kept(.nothingHeard)
            }
            text = heard
        } catch {
            return .kept(.failed(step: .hearing, error: error))
        }

        do {
            try await replacing.replaceMicrophone(of: recording, with: text)
        } catch {
            return .kept(.failed(step: .replacing, error: error))
        }
        return .replaced
    }
}
