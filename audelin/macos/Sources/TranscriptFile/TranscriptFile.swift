import Dispatch
import Foundation

/// One call's latest transcript, replaced whole by each successful write.
public actor TranscriptFile {

    // Blocking file operations must not occupy the cooperative thread pool.
    private nonisolated let queue: DispatchSerialQueue
    public nonisolated var unownedExecutor: UnownedSerialExecutor { queue.asUnownedSerialExecutor() }

    public enum Failure: Error, Equatable {

        case writingEnded
        case invalidStart
    }

    /// Words from one side, starting at a time in seconds from the call's beginning.
    public struct Segment: Sendable, Equatable {

        public enum Side: Sendable {

            case mine, theirs
        }

        public let side: Side
        public let start: Double
        public let settled: String
        public let pending: String
        public let filledInLater: Bool

        public init(side: Side, start: Double, settled: String, pending: String, filledInLater: Bool = false) {

            self.side = side
            self.start = start
            self.settled = settled
            self.pending = pending
            self.filledInLater = filledInLater
        }
    }

    public nonisolated let url: URL

    private let binding: any TranscriptFileBinding
    private var closed = false
    private static let noText = "# Transcript\n\nNo text was heard.\n"

    /// Creates a new file exclusively; an existing path is always an error.
    public init(url: URL) async throws {

        try await self.init(url: url, binding: DiskTranscriptBinding())
    }

    package init(url: URL, binding: any TranscriptFileBinding) async throws {

        let queue = DispatchSerialQueue(label: "audelin.TranscriptFile")
        // The first write happens on the file's queue, not on the caller's thread.
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, any Error>) in
            queue.async {
                done.resume(with: Result {
                    let file = try binding.create(at: url)
                    do {
                        try file.write(Data(Self.noText.utf8))
                        try file.flush()
                    } catch {
                        binding.remove(at: url)
                        throw error
                    }
                })
            }
        }
        self.queue = queue
        self.url = url
        self.binding = binding
    }

    /// A failed replacement leaves writing available for the next snapshot.
    public func write(_ segments: [Segment]) throws {

        guard !closed else { throw Failure.writingEnded }
        let text = try render(segments)
        let temporary = url.deletingLastPathComponent().appendingPathComponent(".transcript-\(UUID()).tmp")
        let file = try binding.create(at: temporary)
        defer { binding.remove(at: temporary) }
        try file.write(Data(text.utf8))
        try file.flush()
        try binding.rename(from: temporary, to: url)
    }

    /// Keeps the last whole transcript and ends further writes.
    public func close() { closed = true }

    private func render(_ segments: [Segment]) throws -> String {

        let parts = try segments.map { segment in
            guard segment.start.isFinite, segment.start >= 0, segment.start < Double(Int.max) else {
                throw Failure.invalidStart
            }
            let seconds = Int(segment.start.rounded(.down))
            let time = String(format: "%02lld:%02lld:%02lld", seconds / 3_600, seconds / 60 % 60, seconds % 60)
            let side = segment.side == .mine ? "Me" : "Them"
            let later = segment.filledInLater ? " (filled in later)" : ""
            let words = [segment.settled, segment.pending].filter { !$0.isEmpty }.joined(separator: " ")
            return (heading: "**\(side)** \(time)\(later)", words: words)
        }
        guard parts.contains(where: { !$0.words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
            return Self.noText
        }
        return "# Transcript\n\n" + parts.map { "\($0.heading)\n\($0.words)" }.joined(separator: "\n\n") + "\n"
    }
}
