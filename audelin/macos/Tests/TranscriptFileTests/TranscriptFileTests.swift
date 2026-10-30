import BlockingTestWork
import Foundation
import Testing
@testable import TranscriptFile

@Suite(.timeLimit(.minutes(1)))
struct TranscriptFileTests {

    @Test func interleavedSegmentsKeepOrderTimesAndAllWords() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try await TranscriptFile(url: url)
            try await file.write([
                .init(side: .mine, start: 65.99, settled: "1 settled", pending: ""),
                .init(side: .theirs, start: 3_669.9, settled: "", pending: "2 pending"),
                .init(side: .mine, start: 0.99, settled: "3 settled", pending: "3 pending"),
                .init(side: .theirs, start: 60, settled: "4 settled", pending: "4 pending"),
            ])
            #expect(try await transcriptText(url) == """
                # Transcript

                **Me** 00:01:05
                1 settled

                **Them** 01:01:09
                2 pending

                **Me** 00:00:00
                3 settled 3 pending

                **Them** 00:01:00
                4 settled 4 pending

                """)
            await file.close()
            #expect(try await folderNames(folder) == ["transcript.md"])
        }
    }

    @Test func revisionReplacesPendingWordsAndDroppedSegments() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try await TranscriptFile(url: url)
            try await file.write([
                .init(side: .mine, start: 1, settled: "1 old", pending: "1 pending"),
                .init(side: .theirs, start: 2, settled: "", pending: "2 pending"),
                .init(side: .mine, start: 3, settled: "3 dropped", pending: ""),
            ])
            try await file.write([
                .init(side: .mine, start: 1, settled: "1 revised", pending: ""),
                .init(side: .theirs, start: 2, settled: "2 revised", pending: ""),
            ])
            #expect(try await transcriptText(url) == "# Transcript\n\n**Me** 00:00:01\n1 revised\n\n**Them** 00:00:02\n2 revised\n")
        }
    }

    @Test func onlyLaterSegmentsAreMarked() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try await TranscriptFile(url: url)
            try await file.write([
                .init(side: .mine, start: 1, settled: "1 live", pending: ""),
                .init(side: .theirs, start: 2, settled: "2 later", pending: "", filledInLater: true),
                .init(side: .mine, start: 3, settled: "", pending: "3 later", filledInLater: true),
                .init(side: .theirs, start: 4, settled: "4 live", pending: ""),
            ])
            #expect(try await transcriptText(url) == """
                # Transcript

                **Me** 00:00:01
                1 live

                **Them** 00:00:02 (filled in later)
                2 later

                **Me** 00:00:03 (filled in later)
                3 later

                **Them** 00:00:04
                4 live

                """)
        }
    }

    @Test func closeKeepsThirdWriteAndEndsWriting() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try await TranscriptFile(url: url)
            for number in 1...3 { try await file.write(numberedSegments(number)) }
            await file.close()
            await file.close()
            await #expect(throws: TranscriptFile.Failure.writingEnded) {
                try await file.write(numberedSegments(4))
            }
            #expect(try await transcriptText(url) == numberedTranscript(3))
            #expect(try await folderNames(folder) == ["transcript.md"])
        }
    }

    @Test func openedWithoutWritesKeepsNoTextMessage() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try await TranscriptFile(url: url)
            #expect(try await transcriptText(url) == noTextTranscript)
            await file.close()
            #expect(try await transcriptText(url) == noTextTranscript)
        }
    }

    @Test func emptyWritesReplaceTextWithNoTextMessage() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try await TranscriptFile(url: url)
            for _ in 0..<2 {
                try await file.write([])
                #expect(try await transcriptText(url) == noTextTranscript)
            }
            try await file.write(numberedSegments(1))
            try await file.write([])
            #expect(try await transcriptText(url) == noTextTranscript)
            try await file.write([
                .init(side: .mine, start: 0, settled: "", pending: ""),
                .init(side: .theirs, start: 2, settled: " \n", pending: "\t"),
            ])
            #expect(try await transcriptText(url) == noTextTranscript)
        }
    }

    @Test func mixedEmptySegmentsKeepTheirPlaceAndUnicodeWords() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try await TranscriptFile(url: url)
            try await file.write([
                .init(side: .mine, start: 1, settled: "", pending: ""),
                .init(side: .theirs, start: 2, settled: "Привет", pending: "世界"),
                .init(side: .mine, start: 3, settled: "", pending: ""),
            ])
            #expect(try await transcriptText(url) == "# Transcript\n\n**Me** 00:00:01\n\n\n**Them** 00:00:02\nПривет 世界\n\n**Me** 00:00:03\n\n")
        }
    }

    @Test func longCallTimesKeepAllHourDigits() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try await TranscriptFile(url: url)
            try await file.write([.init(side: .mine, start: 10_800_000_000_065.9, settled: "1", pending: "")])
            #expect(try await transcriptText(url) == "# Transcript\n\n**Me** 3000000000:01:05\n1\n")
        }
    }

    @Test func missingAndUnwritableFoldersLeaveNoFile() async throws {

        try await withTranscriptFolder { folder in
            let missing = folder.appendingPathComponent("missing/transcript.md")
            await #expect(throws: (any Error).self) { try await TranscriptFile(url: missing) }
            #expect(await offPool { !FileManager.default.fileExists(atPath: missing.path) })
            let locked = folder.appendingPathComponent("locked", isDirectory: true)
            try await offPool { try FileManager.default.createDirectory(at: locked, withIntermediateDirectories: false) }
            try await offPool { try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: locked.path) }
            try await withCleanup {
                let url = locked.appendingPathComponent("transcript.md")
                await #expect(throws: (any Error).self) { try await TranscriptFile(url: url) }
                let names = try await folderNames(locked)
                #expect(names.isEmpty)
            } cleanup: {
                try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: locked.path)
            }
        }
    }

    @Test(arguments: [TranscriptFault.write, .flush])
    func failedInitializationRemovesCreationAndAllowsRetry(fault: TranscriptFault) async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = FailingTranscriptBinding()
            binding.arm(fault)
            await #expect(throws: TranscriptBindingFailure.self) { try await TranscriptFile(url: url, binding: binding) }
            #expect(try await folderNames(folder).isEmpty)
            let file = try await TranscriptFile(url: url, binding: binding)
            #expect(try await transcriptText(url) == noTextTranscript)
            try await file.write(numberedSegments(1))
            #expect(try await transcriptText(url) == numberedTranscript(1))
        }
    }

    @Test func existingFilesAndSymlinksRemainUnchanged() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("kept.md")
            let bytes = Data([0, 255, 42, 10])
            try await offPool { try bytes.write(to: url) }
            let link = folder.appendingPathComponent("link.md")
            let dangling = folder.appendingPathComponent("dangling.md")
            let absent = folder.appendingPathComponent("absent.md")
            try await offPool { try FileManager.default.createSymbolicLink(at: link, withDestinationURL: url) }
            try await offPool { try FileManager.default.createSymbolicLink(at: dangling, withDestinationURL: absent) }
            for path in [url, link, dangling] {
                await #expect(throws: (any Error).self) { try await TranscriptFile(url: path) }
                #expect(try await offPool { try Data(contentsOf: url) } == bytes)
                #expect(try await offPool { try FileManager.default.destinationOfSymbolicLink(atPath: link.path) } == url.path)
                #expect(try await offPool { try FileManager.default.destinationOfSymbolicLink(atPath: dangling.path) } == absent.path)
                #expect(await offPool { !FileManager.default.fileExists(atPath: absent.path) })
            }
            #expect(try await folderNames(folder) == ["dangling.md", "kept.md", "link.md"])
        }
    }

    @Test(arguments: TranscriptFault.allCases)
    func failedReplacementKeepsLastTextCleansTemporaryAndAllowsRetry(fault: TranscriptFault) async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = FailingTranscriptBinding()
            let file = try await TranscriptFile(url: url, binding: binding)
            try await file.write(numberedSegments(1))
            binding.arm(fault)
            await #expect(throws: TranscriptBindingFailure.self) { try await file.write(numberedSegments(2)) }
            #expect(try await transcriptText(url) == numberedTranscript(1))
            #expect(try await folderNames(folder) == ["transcript.md"])
            try await file.write(numberedSegments(3))
            #expect(try await transcriptText(url) == numberedTranscript(3))
            #expect(try await folderNames(folder) == ["transcript.md"])
        }
    }

    @Test func anEarlierSegmentChangingOrGoingIsWrittenEvenAfterAFailedWrite() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try await TranscriptFile(url: url)
            let first = TranscriptFile.Segment(side: .mine, start: 0, settled: "one", pending: "")
            let second = TranscriptFile.Segment(side: .theirs, start: 2, settled: "two", pending: "")
            try await file.write([first, second])
            await #expect(throws: TranscriptFile.Failure.invalidStart) {
                try await file.write([.init(side: .mine, start: 0, settled: "changed", pending: ""),
                                      .init(side: .theirs, start: -1, settled: "bad", pending: "")])
            }
            #expect(try await transcriptText(url) == "# Transcript\n\n**Me** 00:00:00\none\n\n**Them** 00:00:02\ntwo\n")
            try await file.write([.init(side: .mine, start: 0, settled: "again", pending: "now"), second])
            #expect(try await transcriptText(url) == "# Transcript\n\n**Me** 00:00:00\nagain now\n\n**Them** 00:00:02\ntwo\n")
            try await file.write([second])
            #expect(try await transcriptText(url) == "# Transcript\n\n**Them** 00:00:02\ntwo\n")
        }
    }

    @Test(arguments: [-1.0, Double.nan, .infinity, -.infinity, Double(Int.max)])
    func invalidStartsFailWithoutReplacingText(start: Double) async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try await TranscriptFile(url: url)
            try await file.write(numberedSegments(1))
            await #expect(throws: TranscriptFile.Failure.invalidStart) {
                try await file.write([.init(side: .mine, start: start, settled: "invalid", pending: "")])
            }
            #expect(try await transcriptText(url) == numberedTranscript(1))
            try await file.write(numberedSegments(2))
            #expect(try await transcriptText(url) == numberedTranscript(2))
        }
    }
}
