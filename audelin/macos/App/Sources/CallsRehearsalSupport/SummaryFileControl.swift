import Darwin
import Foundation

/// Directory notifications are armed before the first read, so a completion cannot be missed.
struct SummaryFileControl: Sendable {
    let folder: URL

    func report(_ request: Int, _ stage: LiveSummaryService.Stage) throws {
        try Data().write(to: folder.appendingPathComponent("\(stage.rawValue)-\(request)"), options: .atomic)
    }

    func wait(_ request: Int) async throws {
        let descriptor = open(folder.path, O_EVTONLY)
        guard descriptor >= 0 else { throw CocoaError(.fileReadNoSuchFile) }
        let completion = folder.appendingPathComponent("finish-\(request)")
        let (events, output) = AsyncStream<Void>.makeStream()
        // Dispatch requires a queue for filesystem notification delivery.
        let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: descriptor, eventMask: [.write, .rename, .delete], queue: .global())
        source.setEventHandler { output.yield(()) }
        source.setCancelHandler { close(descriptor); output.finish() }
        output.onTermination = { _ in source.cancel() }
        source.resume()
        defer { source.cancel() }
        output.yield(())
        for await _ in events {
            try Task.checkCancellation()
            if FileManager.default.fileExists(atPath: completion.path) { return }
        }
        throw CancellationError()
    }
}
