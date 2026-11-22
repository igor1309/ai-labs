import Foundation
import Testing
import TranscriptFormat

struct TranscriptOriginTests {

    @Test func originRendersAboveTextAndCountsInTheFinalPrefix() throws {
        var format = TranscriptFormat()
        let segments = [TranscriptFormat.Segment(side: .mine, start: 1, settled: "слова", pending: "")]
        let first = try format.render(count: 1, finalCount: 1, origin: fixtureOrigin) { segments[$0] }
        let bytes = first.chunks.reduce(Data(), +)
        let expected = fixtureFrontMatter + "# Transcript\n\n**Me** 00:00:01\nслова\n"
        #expect(String(decoding: bytes, as: UTF8.self) == expected)
        #expect(TranscriptFormat.read(expected).origin == fixtureOrigin)
        #expect(first.finalLength == bytes.count)
        let second = try format.render(count: 2, finalCount: 1, origin: fixtureOrigin) { index in
            #expect(index == 1)
            return .init(side: .theirs, start: 2, settled: "ответ", pending: "")
        }
        let next = second.chunks.reduce(Data(), +)
        #expect(second.finalLength == bytes.count + 1)
        #expect(next.prefix(bytes.count) == bytes)
        #expect(TranscriptFormat.entries(expected) == TranscriptFormat.entries(String(expected.dropFirst(fixtureFrontMatter.count))))
        #expect(TranscriptFormat.namedEntries(expected) == TranscriptFormat.entries(expected))
    }

    @Test func changedOriginNeverKeepsAFinalPrefix() throws {
        let changed = TranscriptFormat.Origin(calls: [
            .init(start: fixtureStart, origin: .init(hearing: .init(version: "2.0", build: "99"), mine: "mine", theirs: "theirs")),
        ])
        for (before, after) in [(fixtureOrigin, changed), (nil, fixtureOrigin), (fixtureOrigin, nil)] {
            var format = TranscriptFormat()
            let first = try format.render(count: 1, finalCount: 1, origin: before) { _ in
                .init(side: .mine, start: 1, settled: "words", pending: "")
            }
            #expect(first.finalLength != nil)
            let second = try format.render(count: 1, finalCount: 1, origin: after) { _ in
                Issue.record("Final segments must stay cached")
                return .init(side: .mine, start: 0, settled: "unexpected", pending: "")
            }
            #expect(second.finalLength == nil)
            #expect(TranscriptFormat.read(text(second)).origin == after)
            #expect(TranscriptFormat.entries(text(second)).map(\.words) == ["words"])
            let third = try format.render(count: 1, finalCount: 1, origin: after) { _ in fatalError("Cached final segment") }
            #expect(third.finalLength != nil)
            if before != nil && after != nil { #expect(text(first).utf8.count == text(second).utf8.count) }
        }
    }

    @Test func transcriptWithoutOriginReadsAndRendersAsBefore() throws {
        let legacy = "# Transcript\n\n**Me** 00:00:01\nold words\n\n**Them** 00:00:02 (filled in later)\nmore\n"
        let saved = TranscriptFormat.read(legacy)
        #expect(saved.origin == nil)
        var format = TranscriptFormat()
        #expect(try text(format.render(saved.segments, speakers: saved.speakers, origin: saved.origin)) == legacy)
    }

    @Test func finishingOutcomesUnknownCallsAndMergingReleaseRoundTrip() throws {
        let release = TranscriptFormat.Release(version: "1.2", build: "34")
        let splits: [TranscriptFormat.Split?] = [nil, .done(diarizer: "VBX", release: release), .nothingKept(release: release), .skipped(release: release)]
        let cleanings: [TranscriptFormat.Cleaning?] = [nil, .init(outcome: .done, release: release), .init(outcome: .nothingKept, release: release), .init(outcome: .skipped, release: release)]
        for split in splits {
            for cleaning in cleanings {
                let origin = TranscriptFormat.Origin(calls: [
                    .init(start: fixtureStart, origin: nil),
                    .init(start: fixtureStart.addingTimeInterval(60.125), origin: .init(hearing: release, mine: "mine", theirs: "theirs", split: split, cleaning: cleaning)),
                ], mergedBy: release)
                var format = TranscriptFormat()
                let output = try text(format.render([], origin: origin))
                #expect(TranscriptFormat.read(output).origin == origin)
                #expect(output.hasSuffix("# Transcript\n\nNo text was heard.\n"))
                #expect(output.contains("\"origin\" : null"))
                #expect(output.contains("\"split\" :") == (split != nil))
                #expect(output.contains("\"cleaning\" :") == (cleaning != nil))
            }
        }
    }

    @Test func hostileOriginValuesCannotBecomeTranscriptOrNotes() throws {
        let hostile = "quoted \" : yes\n---\n**Me** 00:00:00\nmetadata\n## Speakers\n\\\u{0}\t\r\n☃\u{85}\u{2028}\u{2029}\u{fffe}\u{ffff}"
        let release = TranscriptFormat.Release(version: hostile, build: hostile)
        let origin = TranscriptFormat.Origin(calls: [.init(start: fixtureStart, origin: .init(
            hearing: release, mine: hostile, theirs: hostile, split: .done(diarizer: hostile, release: release),
            cleaning: .init(outcome: .done, release: release)
        ))], mergedBy: release)
        var format = TranscriptFormat()
        let output = try text(format.render([.init(side: .mine, start: 1, settled: "only words", pending: "")], origin: origin))
        #expect(output.components(separatedBy: "\n---\n").count == 2)
        for scalar in ["\u{85}", "\u{2028}", "\u{2029}", "\u{fffe}", "\u{ffff}"] { #expect(!output.contains(scalar)) }
        #expect(TranscriptFormat.read(output).origin == origin)
        #expect(TranscriptFormat.namedEntries(output) == [.init(label: "Me", start: 1, words: "only words")])
        #expect(TranscriptFormat.read(output.replacingOccurrences(of: "\n", with: "\r\n")).origin == origin)
    }

    @Test(arguments: ["---\nnot: [yaml\n---\n", "---\n{}\n---\n", "---\n{\"schemaVersion\":2,\"origin\":{\"calls\":[]}}\n---\n", "---\nbroken without closing delimiter\n"])
    func malformedFrontMatterReadsWithoutOrigin(prefix: String) {
        let saved = TranscriptFormat.read(prefix + "# Transcript\n\n**Me** 00:00:01\nkept\n")
        #expect(saved.origin == nil)
        #expect(saved.segments == [.init(side: .mine, start: 1, settled: "kept", pending: "")])
    }

    @Test func anUnclosedBlockDoesNotCloseOnARuleInTheTranscript() {
        let saved = TranscriptFormat.read("---\nbroken without closing delimiter\n# Transcript\n\n**Me** 00:00:01\nfirst\n\n---\n\n**Me** 00:00:02\nsecond\n")
        #expect(saved.origin == nil)
        #expect(saved.segments.map(\.settled) == ["first\n\n---", "second"])
    }

    @Test func savedKeysOfFinishingStagesAndMergingStayAsWritten() throws {
        let release = TranscriptFormat.Release(version: "1.0", build: "42")
        let origin = TranscriptFormat.Origin(calls: [
            .init(start: fixtureStart, origin: .init(hearing: release, mine: "mine", theirs: "theirs",
                split: .done(diarizer: "vbx", release: release), cleaning: .init(outcome: .nothingKept, release: release))),
            .init(start: fixtureStart.addingTimeInterval(60), origin: .init(hearing: release, mine: "mine", theirs: "theirs",
                split: .nothingKept(release: release), cleaning: .init(outcome: .skipped, release: release))),
            .init(start: fixtureStart.addingTimeInterval(120), origin: .init(hearing: release, mine: "mine", theirs: "theirs",
                split: .skipped(release: release), cleaning: .init(outcome: .done, release: release))),
            .init(start: fixtureStart.addingTimeInterval(180), origin: nil),
        ], mergedBy: .init(version: "1.1", build: "43"))
        let saved = stagesFrontMatter + "# Transcript\n\nNo text was heard.\n"
        #expect(TranscriptFormat.read(saved).origin == origin)
        var format = TranscriptFormat()
        #expect(try text(format.render([], origin: origin)) == saved)
    }

    @Test func failedRenderingDoesNotChangeThePreviousOrigin() throws {
        var format = TranscriptFormat()
        _ = try format.render(count: 1, finalCount: 1, origin: fixtureOrigin) { _ in .init(side: .mine, start: 1, settled: "kept", pending: "") }
        #expect(throws: TranscriptFormat.Failure.invalidStart) {
            try format.render(count: 2, finalCount: 1, origin: nil) { _ in .init(side: .mine, start: .nan, settled: "bad", pending: "") }
        }
        let next = try format.render(count: 1, finalCount: 1, origin: fixtureOrigin) { _ in fatalError("Cached final segment") }
        #expect(next.finalLength != nil)
        #expect(TranscriptFormat.read(text(next)).origin == fixtureOrigin)
    }
}

let fixtureStart = Date(timeIntervalSince1970: 1_800_000_000)
let fixtureOrigin = TranscriptFormat.Origin(calls: [
    .init(start: fixtureStart, origin: .init(hearing: .init(version: "1.0", build: "42"), mine: "mine", theirs: "theirs")),
])

private let fixtureFrontMatter = """
---
{
  "origin" : {
    "calls" : [
      {
        "origin" : {
          "hearing" : {
            "build" : "42",
            "version" : "1.0"
          },
          "mine" : "mine",
          "theirs" : "theirs"
        },
        "start" : 1800000000
      }
    ]
  },
  "schemaVersion" : 1
}
---


"""

private let stagesFrontMatter = """
---
{
  "origin" : {
    "calls" : [
      {
        "origin" : {
          "cleaning" : {
            "outcome" : "nothingKept",
            "release" : {
              "build" : "42",
              "version" : "1.0"
            }
          },
          "hearing" : {
            "build" : "42",
            "version" : "1.0"
          },
          "mine" : "mine",
          "split" : {
            "done" : {
              "diarizer" : "vbx",
              "release" : {
                "build" : "42",
                "version" : "1.0"
              }
            }
          },
          "theirs" : "theirs"
        },
        "start" : 1800000000
      },
      {
        "origin" : {
          "cleaning" : {
            "outcome" : "skipped",
            "release" : {
              "build" : "42",
              "version" : "1.0"
            }
          },
          "hearing" : {
            "build" : "42",
            "version" : "1.0"
          },
          "mine" : "mine",
          "split" : {
            "nothingKept" : {
              "release" : {
                "build" : "42",
                "version" : "1.0"
              }
            }
          },
          "theirs" : "theirs"
        },
        "start" : 1800000060
      },
      {
        "origin" : {
          "cleaning" : {
            "outcome" : "done",
            "release" : {
              "build" : "42",
              "version" : "1.0"
            }
          },
          "hearing" : {
            "build" : "42",
            "version" : "1.0"
          },
          "mine" : "mine",
          "split" : {
            "skipped" : {
              "release" : {
                "build" : "42",
                "version" : "1.0"
              }
            }
          },
          "theirs" : "theirs"
        },
        "start" : 1800000120
      },
      {
        "origin" : null,
        "start" : 1800000180
      }
    ],
    "mergedBy" : {
      "build" : "43",
      "version" : "1.1"
    }
  },
  "schemaVersion" : 1
}
---


"""

private func text(_ rendering: TranscriptFormat.Rendering) -> String {
    String(decoding: rendering.chunks.reduce(Data(), +), as: UTF8.self)
}
