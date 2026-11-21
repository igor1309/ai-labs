import Foundation
import SessionRehearsal
import Testing
import TranscriptFormat

struct SpokenWordsTests {
    @Test func countsEachSpeakersWordsButNotTheOriginBlock() throws {
        let release = TranscriptFormat.Release(version: "rehearsal", build: "1")
        let origin = TranscriptFormat.Origin(calls: [.init(
            start: Date(timeIntervalSince1970: 0),
            origin: .init(hearing: release, mine: "mine model", theirs: "their model"))])
        var format = TranscriptFormat()
        let rendering = try format.render([
            .init(side: .mine, start: 0, settled: "one two three", pending: ""),
            .init(side: .theirs, start: 2, settled: "four five", pending: ""),
            .init(side: .mine, start: 4, settled: "six", pending: ""),
        ], origin: origin)
        let markdown = String(decoding: rendering.chunks.reduce(Data(), +), as: UTF8.self)

        #expect(markdown.hasPrefix("---\n"))
        #expect(spokenWords(in: markdown) == ["Me": 4, "Them": 2])
    }
}
