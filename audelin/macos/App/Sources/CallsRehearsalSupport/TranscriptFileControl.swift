import Darwin
import Foundation

/// Handshakes for saved-track loading, hearing, finishing and pair publication.
public struct TranscriptFileControl: Sendable {
    public let folder: URL
    public init(folder: URL) { self.folder = folder }

    public func wait(_ stage: String) async throws {
        let files = FileManager.default
        let hold = folder.appendingPathComponent("hold-" + stage)
        let failure = folder.appendingPathComponent("fail-" + stage)
        guard files.fileExists(atPath: hold.path) || files.fileExists(atPath: failure.path) else { return }
        let descriptor = open(folder.path, O_EVTONLY)
        guard descriptor >= 0 else { throw CocoaError(.fileReadNoSuchFile) }
        let (events, output) = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
        // Filesystem notification delivery requires a Dispatch queue.
        let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: descriptor, eventMask: [.write, .delete, .rename], queue: .global())
        source.setEventHandler { output.yield(()) }
        source.setCancelHandler { close(descriptor); output.finish() }
        output.onTermination = { _ in source.cancel() }
        source.resume()
        defer { source.cancel() }
        try Data().write(to: folder.appendingPathComponent("reached-" + stage), options: .atomic)
        output.yield(())
        for await _ in events {
            try Task.checkCancellation()
            if files.fileExists(atPath: failure.path) { throw Failure(description: "Fixture " + stage + " failed") }
            if !files.fileExists(atPath: hold.path) { return }
        }
        throw CancellationError()
    }

    /// The actual disk move precedes the stop, so killing here exercises startup rollback.
    public func movedCurrent() throws {
        let files = FileManager.default
        let failure = folder.appendingPathComponent("fail-swap")
        if files.fileExists(atPath: failure.path) {
            try files.removeItem(at: failure)
            throw POSIXError(.ENOSPC)
        }
        if files.fileExists(atPath: folder.appendingPathComponent("kill-swap").path) {
            try Data().write(to: folder.appendingPathComponent("reached-swap"), options: .atomic)
            raise(SIGSTOP)
        }
    }

    private struct Failure: Error, CustomStringConvertible { let description: String }
}
