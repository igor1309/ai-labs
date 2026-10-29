import Darwin
import Foundation
import Synchronization
import Testing
@testable import TranscriptFile

@Suite(.timeLimit(.minutes(1)))
struct TranscriptFileSyncTests {

    @Test func everyWriteIsSyncedBeforeItReplacesTheTranscript() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let sync = ScriptedSync([])
            let file = try await TranscriptFile(url: url, binding: DiskTranscriptBinding(sync: sync.call))
            try await file.write(numberedSegments(1))
            #expect(sync.calls == 2)
            #expect(try transcriptText(url) == numberedTranscript(1))
        }
    }

    @Test func anInterruptedSyncIsRetried() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let sync = ScriptedSync([])
            let file = try await TranscriptFile(url: url, binding: DiskTranscriptBinding(sync: sync.call))
            sync.script([EINTR, EINTR])
            try await file.write(numberedSegments(1))
            #expect(sync.calls == 4)
            #expect(try transcriptText(url) == numberedTranscript(1))
        }
    }

    @Test func aFailedSyncFailsTheWriteAndKeepsTheLastText() async throws {

        try await withTranscriptFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let sync = ScriptedSync([])
            let file = try await TranscriptFile(url: url, binding: DiskTranscriptBinding(sync: sync.call))
            try await file.write(numberedSegments(1))
            sync.script([EIO])
            await #expect(throws: POSIXError(.EIO)) { try await file.write(numberedSegments(2)) }
            #expect(try transcriptText(url) == numberedTranscript(1))
            #expect(try folderNames(folder) == ["transcript.md"])
        }
    }
}

/// Fails the next syncs with the scripted errors, then succeeds.
private final class ScriptedSync: Sendable {

    private let state: Mutex<(errors: [Int32], calls: Int)>

    init(_ errors: [Int32]) { state = Mutex((errors, 0)) }

    var calls: Int { state.withLock { $0.calls } }

    func script(_ errors: [Int32]) { state.withLock { $0.errors = errors } }

    var call: DiskTranscriptBinding.Sync {

        { [self] _ in
            state.withLock { state in
                state.calls += 1
                guard !state.errors.isEmpty else { return 0 }
                errno = state.errors.removeFirst()
                return -1
            }
        }
    }
}
