import Foundation
import TranscriptFinalization
import TranscriptFormat

/// The release and recognisers wired by this composition root.
public struct TranscriptBuild: Equatable, Sendable {
    public let release: TranscriptFormat.Release
    public let mine: String
    public let theirs: String

    public init(version: String, build: String, mine: String, theirs: String) {
        release = .init(version: version, build: build); self.mine = mine; self.theirs = theirs
    }
}

/// A call's fixed hearing identity, with finishing decisions supplied by its machine.
public struct TranscriptOrigin: Sendable {
    public let start: Date
    public let build: TranscriptBuild
    public init(start: Date, build: TranscriptBuild) { self.start = start; self.build = build }

    func rendering(_ outcomes: FinishingOutcomes) -> TranscriptFormat.Origin {
        let split: TranscriptFormat.Split? = outcomes.split.map {
            switch $0 {
            case let .done(diarizer): .done(diarizer: diarizer, release: build.release)
            case .nothingKept: .nothingKept(release: build.release)
            case .skipped: .skipped(release: build.release)
            }
        }
        let cleaning: TranscriptFormat.Cleaning? = outcomes.cleaning.map {
            let outcome: TranscriptFormat.Cleaning.Outcome = switch $0 {
            case .done: .done
            case .nothingKept: .nothingKept
            case .skipped: .skipped
            }
            return .init(outcome: outcome, release: build.release)
        }
        return .init(calls: [.init(start: start, origin: .init(hearing: build.release, mine: build.mine,
            theirs: build.theirs, split: split, cleaning: cleaning))])
    }
}
