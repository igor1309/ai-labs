@testable import Calls
import CallsStorage
import Foundation
import Synchronization
import Testing

/// The production storage turn serializes separate Calls instances over real files.
@Suite(.timeLimit(.minutes(1)))
struct CallsStorageTranscriptAdmissionTests {
    enum Read: CaseIterable { case text, savedTranscript, list, part }

    @Test(arguments: [false, true], Read.allCases)
    func S14_readAdmissionDuringAChangeWaitsForTheWholePair(restoring: Bool, read: Read) async throws {
        try await withStorageFolder { root in
            let id = "1970.01.01-0000", call = root.appendingPathComponent(id)
            try FileManager.default.createDirectory(at: call, withIntermediateDirectories: true)
            let old = Data("old".utf8), older = Data("older".utf8), new = Data("new".utf8)
            try old.write(to: call.appendingPathComponent("transcript.md"))
            try older.write(to: call.appendingPathComponent("transcript-previous.md"))
            let admitted = AsyncStream<Bool>.makeStream(), held = AsyncStream<Void>.makeStream()
            let first = Mutex(true), reads = Mutex<[String]>([])
            let serial = CallsStorageGuard.serial { admitted.continuation.yield($0) }
            let guardPort = CallsStorageGuard(take: { _ in
                try await serial.take(.access)
                if first.withLock({ let value = $0; $0 = false; return value }) {
                    for await _ in held.stream {}
                }
            }, give: serial.give)
            var disk = CallsDisk.system
            disk.read = { url in
                reads.withLock { $0.append(url.lastPathComponent) }
                return try CallsDisk.system.read(url)
            }
            let storage = CallsStorage(folder: root, journal: nil, readPart: { folder, _ in
                .init(transcript: try Data(contentsOf: folder.appendingPathComponent("transcript.md")), originalStarts: [])
            }, makeCalls: { [disk] in Calls(folder: $0, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: disk) }, operation: guardPort)
            let changing = Task {
                if restoring { try await storage.restorePreviousTranscript(id: id) }
                else { try await storage.publishTranscript(id: id) { try new.write(to: $0) } }
            }
            var entries = admitted.stream.makeAsyncIterator()
            #expect(await entries.next() == true)
            let reading = Task {
                switch read {
                case .text: return try await storage.text(id: id).identity ?? ""
                case .savedTranscript: return try await storage.savedTranscript(id: id).base64EncodedString()
                case .list: return try await storage.list().map { "\($0.id):\($0.hasPreviousTranscript)" }.joined()
                case .part: return try await storage.part(id: id).transcript.base64EncodedString()
                }
            }
            // This report is issued only after the read has entered the occupied turn's queue.
            #expect(await entries.next() == false)
            #expect(reads.withLock { $0.isEmpty })
            held.continuation.finish()
            let change = await changing.result, result = await reading.result
            try change.get()
            let answer = try result.get()
            let expected = restoring ? older : new
            switch read {
            case .text:
                let calls = Calls(folder: root, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: .system)
                #expect(answer == (try calls.text(id: id).identity))
            case .savedTranscript, .part: #expect(answer == expected.base64EncodedString())
            case .list: #expect(answer == "\(id):true")
            }
            #expect(try Data(contentsOf: call.appendingPathComponent("transcript.md")) == expected)
            #expect(try Data(contentsOf: call.appendingPathComponent("transcript-previous.md")) == old)
            #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == [id])
            admitted.continuation.finish()
        }
    }

    @Test func cancellationQueuedForPublicationKeepsBothTranscripts() async throws {
        try await withStorageFolder { root in
            let id = "1970.01.01-0000", call = root.appendingPathComponent(id)
            try FileManager.default.createDirectory(at: call, withIntermediateDirectories: true)
            let old = Data("old".utf8), older = Data("older".utf8)
            try old.write(to: call.appendingPathComponent("transcript.md"))
            try older.write(to: call.appendingPathComponent("transcript-previous.md"))
            let admitted = AsyncStream<Bool>.makeStream(), held = AsyncStream<Void>.makeStream(), first = Mutex(true)
            let serial = CallsStorageGuard.serial { admitted.continuation.yield($0) }
            let storage = CallsStorage(folder: root, journal: nil, readPart: { _, _ in throw POSIXError(.EIO) },
                makeCalls: { Calls(folder: $0, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: .system) },
                operation: .init(take: { _ in
                    try await serial.take(.access)
                    if first.withLock({ let value = $0; $0 = false; return value }) { for await _ in held.stream {} }
                }, give: serial.give))
            let listing = Task { try await storage.list() }
            var entries = admitted.stream.makeAsyncIterator()
            #expect(await entries.next() == true)
            let publishing = Task { try await storage.publishTranscript(id: id) { _ in Issue.record("Cancelled publication wrote a file") } }
            #expect(await entries.next() == false)
            publishing.cancel()
            do { try await publishing.value; Issue.record("Cancelled publication succeeded") }
            catch { #expect(error is CancellationError) }
            held.continuation.finish()
            _ = try await listing.value
            #expect(try await storage.savedTranscript(id: id) == old)
            #expect(try Data(contentsOf: call.appendingPathComponent("transcript-previous.md")) == older)
            #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == [id])
            admitted.continuation.finish()
        }
    }
}
