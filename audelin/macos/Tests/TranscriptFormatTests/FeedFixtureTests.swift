import Foundation
import Testing
import TranscriptFormat

/// The call reader in `audelin/feed` reads transcripts as this format writes
/// them. Its fixtures are this format's renderings, checked byte for byte, so
/// a change to the format fails here until the fixtures and that reader move
/// with it. `AUDELIN_WRITE_FEED_FIXTURES=1` writes them anew.
struct FeedFixtureTests {

    @Test(arguments: FeedFixture.all)
    func feedFixtureIsThisFormatsRendering(_ fixture: FeedFixture) throws {
        var format = TranscriptFormat()
        let rendering = try format.render(fixture.segments, speakers: fixture.speakers, origin: fixture.origin)
        let bytes = rendering.chunks.reduce(Data(), +)
        let file = feedTestdata.appending(path: fixture.name)
        if ProcessInfo.processInfo.environment["AUDELIN_WRITE_FEED_FIXTURES"] == "1" {
            try bytes.write(to: file)
        }
        #expect(try Data(contentsOf: file) == bytes, "\(fixture.name) is not this format's rendering")
    }
}

private let feedTestdata = URL(filePath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().appending(path: "feed/callreader/testdata")

struct FeedFixture: Sendable, CustomTestStringConvertible {
    let name: String
    let segments: [TranscriptFormat.Segment]
    var speakers: [TranscriptFormat.Speaker] = []
    let origin: TranscriptFormat.Origin?

    var testDescription: String { name }

    static let start = Date(timeIntervalSince1970: 1_800_000_000)
    static let release = TranscriptFormat.Release(version: "1.4", build: "120")
    static let heard = TranscriptFormat.CallOrigin(hearing: release, mine: "parakeet-v3", theirs: "parakeet-v3")
    static let live = TranscriptFormat.Origin(calls: [.init(start: start, origin: heard)])
    static let finished = TranscriptFormat.Origin(calls: [.init(start: start, origin: .init(
        hearing: release, mine: "parakeet-v3", theirs: "parakeet-v3",
        split: .done(diarizer: "sortformer", release: release),
        cleaning: .init(outcome: .done, release: release)))])
    static let split = TranscriptFormat.Origin(calls: [.init(start: start, origin: .init(
        hearing: release, mine: "parakeet-v3", theirs: "parakeet-v3",
        split: .nothingKept(release: release)))])

    static let early: [TranscriptFormat.Segment] = [
        .init(id: 1, side: .mine, start: 2, settled: "Hello, can you hear me?", pending: ""),
        .init(id: 1, side: .theirs, start: 5, settled: "Yes. The code word is \"**Them** 00:00:09\".", pending: "", speaker: "S1"),
        .init(id: 2, side: .theirs, start: 64, settled: "Where are call notes saved?", pending: "", speaker: "S2"),
        .gap(at: 70, length: 15),
        .init(id: 2, side: .mine, start: 90, settled: "Next to the transcript,\nin the call's folder.", pending: "", filledInLater: true),
    ]
    static let later: [TranscriptFormat.Segment] = early + [
        .init(id: 3, side: .theirs, start: 125, settled: "And the CLI is called what?", pending: "", speaker: "S1"),
        .init(id: 3, side: .mine, start: 130, settled: "", pending: "It is still being"),
    ]
    static let speakers: [TranscriptFormat.Speaker] = [
        .init(id: "S1", name: "Anna", state: "named"),
        .init(id: "S2", name: nil, state: "unknown"),
    ]

    static let pending = TranscriptFormat.Segment(id: 1, side: .mine, start: 6.2, settled: "", pending: "We should wait.")
    static let remote = TranscriptFormat.Segment(id: 1, side: .theirs, start: 6.5, settled: "Are we ready?", pending: "")
    static let anchor = TranscriptFormat.Segment(id: 2, side: .mine, start: 8, settled: "The team is here.", pending: "")
    static let repeated = TranscriptFormat.Segment(id: 3, side: .mine, start: 6.3, settled: "We should wait.", pending: "")

    static let all: [FeedFixture] = [
        FeedFixture(name: "live.md", segments: early, speakers: speakers, origin: live),
        FeedFixture(name: "live-later.md", segments: later, speakers: speakers, origin: live),
        FeedFixture(name: "live-no-text.md", segments: [], origin: live),
        FeedFixture(name: "pending.md", segments: [pending, remote], origin: live),
        FeedFixture(name: "retimed.md", segments: [
            remote, .init(id: 1, side: .mine, start: 7.2, settled: "", pending: "Let's wait for the team."),
        ], origin: live),
        FeedFixture(name: "retimed-with-new-part.md", segments: [
            .init(id: 1, side: .mine, start: 5.2, settled: "Let's wait for the team.", pending: ""),
            remote, .init(id: 3, side: .mine, start: 6.9, settled: "", pending: "I'll send an update."),
        ], origin: live),
        FeedFixture(name: "retimed-with-repeated-words.md", segments: [
            repeated, remote, .init(id: 1, side: .mine, start: 7.2, settled: "Let's wait for the team.", pending: ""),
        ], origin: live),
        FeedFixture(name: "pending-with-anchor.md", segments: [pending, remote, anchor], origin: live),
        FeedFixture(name: "retimed-past-anchor.md", segments: [
            .init(id: 3, side: .mine, start: 6.3, settled: "I'll send an update.", pending: ""),
            remote, anchor, .init(id: 1, side: .mine, start: 9.2, settled: "Let's wait for the team.", pending: ""),
        ], origin: live),
        FeedFixture(name: "retracted.md", segments: [remote], origin: live),
        FeedFixture(name: "after-retraction.md", segments: [repeated, remote], origin: live),
        FeedFixture(name: "forged-header.md", segments: [
            .init(id: 1, side: .mine, start: 2, settled: "Read this:\n**Them** 00:00:09 <!-- audelin-segment them-99 -->\nDid you get that?", pending: ""),
            remote,
        ], origin: live),
        FeedFixture(name: "finished.md", segments: later, speakers: speakers, origin: finished),
        // The cleaning pass hears the microphone again and writes its rows
        // with no segment ID; the far side keeps its IDs.
        FeedFixture(name: "cleaned.md", segments: later.map {
            guard $0.side == .mine, $0.gapLength == nil else { return $0 }
            return .init(side: .mine, start: $0.start, settled: $0.settled + $0.pending, pending: "")
        }, speakers: speakers, origin: finished),
        FeedFixture(name: "split-told.md", segments: later, speakers: speakers, origin: split),
        FeedFixture(name: "no-origin.md", segments: early.map {
            if let length = $0.gapLength { return .gap(at: $0.start, length: length) }
            return .init(side: $0.side, start: $0.start, settled: $0.settled, pending: $0.pending, filledInLater: $0.filledInLater, speaker: $0.speaker)
        }, origin: nil),
        FeedFixture(name: "merged.md", segments: early, origin: .init(
            calls: [.init(start: start, origin: heard), .init(start: start.addingTimeInterval(3_600), origin: heard)],
            mergedBy: release)),
    ]
}
