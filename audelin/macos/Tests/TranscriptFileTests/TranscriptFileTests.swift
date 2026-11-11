import BlockingTestWork
import Foundation
import Testing
@testable import TranscriptFile

@Suite(.timeLimit(.minutes(1)))
struct TranscriptFileTests {

    @Test func closeKeepsThirdWriteAndEndsWriting() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try await TranscriptFile(url: url, initialBytes: initialBytes, binding: DiskTranscriptBinding())
            for number in 1...3 { try await file.write(numberedBytes(number), finalLength: nil) }
            await file.close()
            await file.close()
            await #expect(throws: TranscriptFile.Failure.writingEnded) {
                try await file.write(numberedBytes(4), finalLength: nil)
            }
            #expect(try await transcriptText(url) == numberedTranscript(3))
            #expect(try await folderNames(folder) == ["transcript.md"])
        }
    }

    @Test func openedWithoutWritesKeepsInitialBytes() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try await TranscriptFile(url: url, initialBytes: initialBytes, binding: DiskTranscriptBinding())
            #expect(try await transcriptText(url) == initialText)
            await file.close()
            #expect(try await transcriptText(url) == initialText)
        }
    }

    @Test func missingAndUnwritableFoldersLeaveNoFile() async throws {

        try await withTranscriptFolder { folder in
            let missing = folder.appendingPathComponent("missing/transcript.md")
            await #expect(throws: (any Error).self) { try await TranscriptFile(url: missing, initialBytes: initialBytes, binding: DiskTranscriptBinding()) }
            #expect(!FileManager.default.fileExists(atPath: missing.path))
            let locked = folder.appendingPathComponent("locked", isDirectory: true)
            try FileManager.default.createDirectory(at: locked, withIntermediateDirectories: false)
            try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: locked.path)
            try await withCleanup {
                let url = locked.appendingPathComponent("transcript.md")
                await #expect(throws: (any Error).self) { try await TranscriptFile(url: url, initialBytes: initialBytes, binding: DiskTranscriptBinding()) }
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
            await #expect(throws: TranscriptBindingFailure.self) { try await TranscriptFile(url: url, initialBytes: initialBytes, binding: binding) }
            #expect(try await folderNames(folder).isEmpty)
            let file = try await TranscriptFile(url: url, initialBytes: initialBytes, binding: binding)
            #expect(try await transcriptText(url) == initialText)
            try await file.write(numberedBytes(1), finalLength: nil)
            #expect(try await transcriptText(url) == numberedTranscript(1))
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
                await #expect(throws: (any Error).self) { try await TranscriptFile(url: path, initialBytes: initialBytes, binding: DiskTranscriptBinding()) }
                #expect(try Data(contentsOf: url) == bytes)
                #expect(try FileManager.default.destinationOfSymbolicLink(atPath: link.path) == url.path)
                #expect(try FileManager.default.destinationOfSymbolicLink(atPath: dangling.path) == absent.path)
                #expect(!FileManager.default.fileExists(atPath: absent.path))
            }
            #expect(try await folderNames(folder) == ["dangling.md", "kept.md", "link.md"])
        }
    }

    @Test(arguments: TranscriptFault.replacing)
    func failedReplacementKeepsLastTextCleansTemporaryAndAllowsRetry(fault: TranscriptFault) async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = FailingTranscriptBinding()
            let file = try await TranscriptFile(url: url, initialBytes: initialBytes, binding: binding)
            try await file.write(numberedBytes(1), finalLength: nil)
            binding.arm(fault)
            await #expect(throws: TranscriptBindingFailure.self) { try await file.write(numberedBytes(2), finalLength: nil) }
            #expect(try await transcriptText(url) == numberedTranscript(1))
            #expect(try await folderNames(folder) == ["transcript.md"])
            try await file.write(numberedBytes(3), finalLength: nil)
            #expect(try await transcriptText(url) == numberedTranscript(3))
            #expect(try await folderNames(folder) == ["transcript.md"])
        }
    }

    @Test func finalEntriesStayOnDiskAndOnlyTheTextAfterThemIsWritten() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = FailingTranscriptBinding()
            let file = try await TranscriptFile(url: url, initialBytes: initialBytes, binding: binding)
            let prefix = Data("1 final Привет\n".utf8)
            _ = binding.taken()
            try await file.write([prefix, Data("2 pending\n".utf8)], finalLength: prefix.count)
            #expect(binding.taken().steps == [.create, .write, .write, .flush, .rename])
            #expect(try Data(contentsOf: url) == prefix + Data("2 pending\n".utf8))
            let second = Data("2 final 世界\n".utf8)
            for tail in [Data("2 growing\n".utf8), second] {
                try await file.write([prefix, tail], finalLength: tail == second ? prefix.count + second.count : prefix.count)
                let rewrite = binding.taken()
                #expect(rewrite.steps == [.open, .truncate, .write, .write, .flush])
                #expect(rewrite.bytes == tail.count)
                #expect(try Data(contentsOf: url) == prefix + tail)
            }
            // The kept prefix can cross chunk boundaries on a later write.
            let third = Data("3 pending\n".utf8)
            try await file.write([prefix, second, third], finalLength: prefix.count + second.count)
            let rewrite = binding.taken()
            #expect(rewrite.steps == [.open, .truncate, .write, .write, .write, .flush])
            #expect(rewrite.bytes == third.count)
            #expect(try Data(contentsOf: url) == prefix + second + third)
        }
    }

    @Test(arguments: TranscriptFault.rewriting)
    func failedRewriteKeepsFinalEntriesAndTheNextWriteReplacesTheFileWhole(fault: TranscriptFault) async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = FailingTranscriptBinding()
            let file = try await TranscriptFile(url: url, initialBytes: initialBytes, binding: binding)
            let prefix = Data("1 final\n".utf8)
            try await file.write([prefix, Data("2 old pending\n".utf8)], finalLength: prefix.count)
            binding.arm(fault)
            await #expect(throws: TranscriptBindingFailure.self) {
                try await file.write([prefix, Data("2 new pending\n".utf8)], finalLength: prefix.count)
            }
            let left: [TranscriptFault: String] = [
                .open: "2 old pending\n", .truncate: "2 old pending\n",
                .write: "2 new p", .flush: "2 new pending\n",
            ]
            #expect(try Data(contentsOf: url) == prefix + Data(left[fault]!.utf8))
            _ = binding.taken()
            try await file.write([prefix, Data("3 recovered\n".utf8)], finalLength: prefix.count)
            #expect(binding.taken().steps == [.create, .write, .write, .flush, .rename])
            #expect(try Data(contentsOf: url) == prefix + Data("3 recovered\n".utf8))
            #expect(try await folderNames(folder) == ["transcript.md"])
        }
    }

    @Test func noFinalLengthReplacesWholeAndForgetsTheKeptPrefix() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = FailingTranscriptBinding()
            let file = try await TranscriptFile(url: url, initialBytes: initialBytes, binding: binding)
            for number in 1...2 {
                try await file.write([Data("0 final\n\(number) pending\n".utf8)], finalLength: 8)
            }
            for length: Int? in [nil, 8] {
                _ = binding.taken()
                try await file.write(numberedBytes(3), finalLength: length)
                #expect(binding.taken().steps == [.create, .write, .flush, .rename])
                #expect(try await transcriptText(url) == numberedTranscript(3))
            }
        }
    }

    @Test func closedTranscriptCanBeReplacedWhole() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = FailingTranscriptBinding()
            let file = try await TranscriptFile(url: url, initialBytes: initialBytes, binding: binding)
            try await file.write(numberedBytes(1), finalLength: 8)
            await file.close()
            _ = binding.taken()
            let replacement = [Data([0, 255, 42, 10]), Data("2 replacement\n".utf8)]
            try await file.replace(replacement, finalLength: nil)
            #expect(binding.taken().steps == [.create, .write, .write, .flush, .rename])
            #expect(try Data(contentsOf: url) == replacement.reduce(Data(), +))
            await #expect(throws: TranscriptFile.Failure.writingEnded) {
                try await file.write(numberedBytes(3), finalLength: nil)
            }
            #expect(try Data(contentsOf: url) == replacement.reduce(Data(), +))
        }
    }

    @Test(arguments: TranscriptFault.replacing)
    func failedClosedReplacementKeepsLastTextAndAllowsRetry(fault: TranscriptFault) async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = FailingTranscriptBinding()
            let file = try await TranscriptFile(url: url, initialBytes: initialBytes, binding: binding)
            try await file.write(numberedBytes(1), finalLength: nil)
            await file.close()
            binding.arm(fault)
            await #expect(throws: TranscriptBindingFailure.self) {
                try await file.replace(numberedBytes(2), finalLength: nil)
            }
            #expect(try await transcriptText(url) == numberedTranscript(1))
            #expect(try await folderNames(folder) == ["transcript.md"])
            try await file.replace(numberedBytes(3), finalLength: nil)
            #expect(try await transcriptText(url) == numberedTranscript(3))
            #expect(try await folderNames(folder) == ["transcript.md"])
        }
    }
}
