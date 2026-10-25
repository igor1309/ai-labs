import Foundation
import Testing
@testable import TranscriptFile

@Suite(.timeLimit(.minutes(1)))
struct TranscriptFileTests {

    @Test func interleavedSegmentsKeepOrderTimesAndAllWords() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try TranscriptFile(url: url)
            try await file.write([
                .init(side: .mine, start: 65.99, settled: "1 settled", pending: ""),
                .init(side: .theirs, start: 3_669.9, settled: "", pending: "2 pending"),
                .init(side: .mine, start: 0.99, settled: "3 settled", pending: "3 pending"),
                .init(side: .theirs, start: 60, settled: "4 settled", pending: "4 pending"),
            ])
            #expect(try transcriptText(url) == """
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
            #expect(try folderNames(folder) == ["transcript.md"])
        }
    }

    @Test func revisionReplacesPendingWordsAndDroppedSegments() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try TranscriptFile(url: url)
            try await file.write([
                .init(side: .mine, start: 1, settled: "1 old", pending: "1 pending"),
                .init(side: .theirs, start: 2, settled: "", pending: "2 pending"),
                .init(side: .mine, start: 3, settled: "3 dropped", pending: ""),
            ])
            try await file.write([
                .init(side: .mine, start: 1, settled: "1 revised", pending: ""),
                .init(side: .theirs, start: 2, settled: "2 revised", pending: ""),
            ])
            #expect(try transcriptText(url) == "# Transcript\n\n**Me** 00:00:01\n1 revised\n\n**Them** 00:00:02\n2 revised\n")
        }
    }

    @Test func onlyLaterSegmentsAreMarked() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try TranscriptFile(url: url)
            try await file.write([
                .init(side: .mine, start: 1, settled: "1 live", pending: ""),
                .init(side: .theirs, start: 2, settled: "2 later", pending: "", filledInLater: true),
                .init(side: .mine, start: 3, settled: "", pending: "3 later", filledInLater: true),
                .init(side: .theirs, start: 4, settled: "4 live", pending: ""),
            ])
            #expect(try transcriptText(url) == """
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
            let file = try TranscriptFile(url: url)
            for number in 1...3 { try await file.write(numberedSegments(number)) }
            await file.close()
            await file.close()
            await #expect(throws: TranscriptFile.Failure.writingEnded) {
                try await file.write(numberedSegments(4))
            }
            #expect(try transcriptText(url) == numberedTranscript(3))
            #expect(try folderNames(folder) == ["transcript.md"])
        }
    }

    @Test func openedWithoutWritesKeepsNoTextMessage() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try TranscriptFile(url: url)
            #expect(try transcriptText(url) == noTextTranscript)
            await file.close()
            #expect(try transcriptText(url) == noTextTranscript)
        }
    }

    @Test func emptyWritesReplaceTextWithNoTextMessage() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try TranscriptFile(url: url)
            for _ in 0..<2 {
                try await file.write([])
                #expect(try transcriptText(url) == noTextTranscript)
            }
            try await file.write(numberedSegments(1))
            try await file.write([])
            #expect(try transcriptText(url) == noTextTranscript)
            try await file.write([
                .init(side: .mine, start: 0, settled: "", pending: ""),
                .init(side: .theirs, start: 2, settled: " \n", pending: "\t"),
            ])
            #expect(try transcriptText(url) == noTextTranscript)
        }
    }

    @Test func mixedEmptySegmentsKeepTheirPlaceAndUnicodeWords() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try TranscriptFile(url: url)
            try await file.write([
                .init(side: .mine, start: 1, settled: "", pending: ""),
                .init(side: .theirs, start: 2, settled: "Привет", pending: "世界"),
                .init(side: .mine, start: 3, settled: "", pending: ""),
            ])
            #expect(try transcriptText(url) == "# Transcript\n\n**Me** 00:00:01\n\n\n**Them** 00:00:02\nПривет 世界\n\n**Me** 00:00:03\n\n")
        }
    }

    @Test func longCallTimesKeepAllHourDigits() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try TranscriptFile(url: url)
            try await file.write([.init(side: .mine, start: 10_800_000_000_065.9, settled: "1", pending: "")])
            #expect(try transcriptText(url) == "# Transcript\n\n**Me** 3000000000:01:05\n1\n")
        }
    }

    @Test func missingAndUnwritableFoldersLeaveNoFile() async throws {

        try await withTranscriptFolder { folder in
            let missing = folder.appendingPathComponent("missing/transcript.md")
            #expect(throws: (any Error).self) { try TranscriptFile(url: missing) }
            #expect(!FileManager.default.fileExists(atPath: missing.path))
            let locked = folder.appendingPathComponent("locked", isDirectory: true)
            try FileManager.default.createDirectory(at: locked, withIntermediateDirectories: false)
            try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: locked.path)
            defer { try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: locked.path) }
            let url = locked.appendingPathComponent("transcript.md")
            #expect(throws: (any Error).self) { try TranscriptFile(url: url) }
            #expect(try folderNames(locked).isEmpty)
        }
    }

    @Test(arguments: [TranscriptFault.write, .flush])
    func failedInitializationRemovesCreationAndAllowsRetry(fault: TranscriptFault) async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = FailingTranscriptBinding()
            binding.arm(fault)
            #expect(throws: TranscriptBindingFailure.self) { try TranscriptFile(url: url, binding: binding) }
            #expect(try folderNames(folder).isEmpty)
            let file = try TranscriptFile(url: url, binding: binding)
            #expect(try transcriptText(url) == noTextTranscript)
            try await file.write(numberedSegments(1))
            #expect(try transcriptText(url) == numberedTranscript(1))
        }
    }

    @Test func existingFilesAndSymlinksRemainUnchanged() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("kept.md")
            let bytes = Data([0, 255, 42, 10])
            try bytes.write(to: url)
            let link = folder.appendingPathComponent("link.md")
            let dangling = folder.appendingPathComponent("dangling.md")
            let absent = folder.appendingPathComponent("absent.md")
            try FileManager.default.createSymbolicLink(at: link, withDestinationURL: url)
            try FileManager.default.createSymbolicLink(at: dangling, withDestinationURL: absent)
            for path in [url, link, dangling] {
                #expect(throws: (any Error).self) { try TranscriptFile(url: path) }
                #expect(try Data(contentsOf: url) == bytes)
                #expect(try FileManager.default.destinationOfSymbolicLink(atPath: link.path) == url.path)
                #expect(try FileManager.default.destinationOfSymbolicLink(atPath: dangling.path) == absent.path)
                #expect(!FileManager.default.fileExists(atPath: absent.path))
            }
            #expect(try folderNames(folder) == ["dangling.md", "kept.md", "link.md"])
        }
    }

    @Test(arguments: TranscriptFault.allCases)
    func failedReplacementKeepsLastTextCleansTemporaryAndAllowsRetry(fault: TranscriptFault) async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = FailingTranscriptBinding()
            let file = try TranscriptFile(url: url, binding: binding)
            try await file.write(numberedSegments(1))
            binding.arm(fault)
            await #expect(throws: TranscriptBindingFailure.self) { try await file.write(numberedSegments(2)) }
            #expect(try transcriptText(url) == numberedTranscript(1))
            #expect(try folderNames(folder) == ["transcript.md"])
            try await file.write(numberedSegments(3))
            #expect(try transcriptText(url) == numberedTranscript(3))
            #expect(try folderNames(folder) == ["transcript.md"])
        }
    }

    @Test(arguments: [-1.0, Double.nan, .infinity, -.infinity, Double(Int.max)])
    func invalidStartsFailWithoutReplacingText(start: Double) async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try TranscriptFile(url: url)
            try await file.write(numberedSegments(1))
            await #expect(throws: TranscriptFile.Failure.invalidStart) {
                try await file.write([.init(side: .mine, start: start, settled: "invalid", pending: "")])
            }
            #expect(try transcriptText(url) == numberedTranscript(1))
            try await file.write(numberedSegments(2))
            #expect(try transcriptText(url) == numberedTranscript(2))
        }
    }
}
