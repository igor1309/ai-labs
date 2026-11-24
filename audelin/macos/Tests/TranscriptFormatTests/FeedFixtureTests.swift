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
        .init(side: .mine, start: 2, settled: "Hello, can you hear me?", pending: ""),
        .init(side: .theirs, start: 5, settled: "Yes. The code word is \"**Them** 00:00:09\".", pending: "", speaker: "S1"),
        .init(side: .theirs, start: 64, settled: "Where are call notes saved?", pending: "", speaker: "S2"),
        .gap(at: 70, length: 15),
        .init(side: .mine, start: 90, settled: "Next to the transcript,\nin the call's folder.", pending: "", filledInLater: true),
    ]
    static let later: [TranscriptFormat.Segment] = early + [
        .init(side: .theirs, start: 125, settled: "And the CLI is called what?", pending: "", speaker: "S1"),
        .init(side: .mine, start: 130, settled: "", pending: "It is still being"),
    ]
    static let speakers: [TranscriptFormat.Speaker] = [
        .init(id: "S1", name: "Anna", state: "named"),
        .init(id: "S2", name: nil, state: "unknown"),
    ]

    static let all: [FeedFixture] = [
        FeedFixture(name: "live.md", segments: early, speakers: speakers, origin: live),
        FeedFixture(name: "live-later.md", segments: later, speakers: speakers, origin: live),
        FeedFixture(name: "live-no-text.md", segments: [], origin: live),
        FeedFixture(name: "finished.md", segments: later, speakers: speakers, origin: finished),
        FeedFixture(name: "split-told.md", segments: later, speakers: speakers, origin: split),
        FeedFixture(name: "no-origin.md", segments: early, origin: nil),
        FeedFixture(name: "merged.md", segments: early, origin: .init(
            calls: [.init(start: start, origin: heard), .init(start: start.addingTimeInterval(3_600), origin: heard)],
            mergedBy: release)),
    ]
}
