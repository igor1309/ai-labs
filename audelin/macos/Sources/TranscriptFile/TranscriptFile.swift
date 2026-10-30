import Dispatch
import Foundation

/// One call's latest transcript, replaced whole by each successful write.
public actor TranscriptFile {

    // Blocking file operations must not occupy the cooperative thread pool.
    nonisolated let queue: DispatchSerialQueue
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
    /// Every entry from `finalCount` on, kept so an unchanged one is not rendered again.
    private var rendered: [Rendered] = []
    /// The header and each final entry followed by its separator; only ever appended to.
    private var finalText = Data("# Transcript\n\n".utf8)
    private var finalCount = 0
    private var finalHasWords = false
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

        try write(count: segments.count, finalCount: 0) { segments[$0] }
    }

    /// Asks only for segments after those already final, so a save does not walk
    /// the call. The leading `finalCount` segments must never change again.
    public func write(count: Int, finalCount: Int, segment: @Sendable (Int) -> Segment) throws {

        guard !closed else { throw Failure.writingEnded }
        try render(count: count, finalCount: finalCount, segment: segment)
        let (text, tail) = text()
        let temporary = url.deletingLastPathComponent().appendingPathComponent(".transcript-\(UUID()).tmp")
        let file = try binding.create(at: temporary)
        defer { binding.remove(at: temporary) }
        try file.write(text)
        try file.write(tail)
        try file.flush()
        try binding.rename(from: temporary, to: url)
    }

    /// Keeps the last whole transcript and ends further writes.
    public func close() { closed = true }

    private func render(count: Int, finalCount: Int, segment: (Int) -> Segment) throws {

        let tailCount = max(count - self.finalCount, 0)
        for position in 0..<tailCount {
            let segment = segment(self.finalCount + position)
            if position < rendered.count, rendered[position].segment == segment { continue }
            let part = try Rendered(segment)
            if position < rendered.count { rendered[position] = part } else { rendered.append(part) }
        }
        rendered.removeLast(rendered.count - tailCount)
        let newlyFinal = min(max(finalCount - self.finalCount, 0), tailCount)
        for part in rendered.prefix(newlyFinal) {
            finalText.append(contentsOf: part.text.utf8)
            finalText.append(contentsOf: "\n\n".utf8)
            finalHasWords = finalHasWords || part.hasWords
        }
        rendered.removeFirst(newlyFinal)
        self.finalCount += newlyFinal
    }

    /// The file's two parts, so the final text is never copied into a new string.
    private func text() -> (final: Data, tail: Data) {

        guard finalHasWords || rendered.contains(where: \.hasWords) else { return (Data(Self.noText.utf8), Data()) }
        if rendered.isEmpty { return (finalText.dropLast(), Data()) }
        return (finalText, Data((rendered.lazy.map(\.text).joined(separator: "\n\n") + "\n").utf8))
    }

    /// One segment's text, kept so an unchanged segment is not rendered again.
    private struct Rendered {

        let segment: Segment
        let text: String
        let hasWords: Bool

        init(_ segment: Segment) throws {

            guard segment.start.isFinite, segment.start >= 0, segment.start < Double(Int.max) else {
                throw Failure.invalidStart
            }
            let seconds = Int(segment.start.rounded(.down))
            let time = String(format: "%02lld:%02lld:%02lld", seconds / 3_600, seconds / 60 % 60, seconds % 60)
            let side = segment.side == .mine ? "Me" : "Them"
            let later = segment.filledInLater ? " (filled in later)" : ""
            let words = [segment.settled, segment.pending].filter { !$0.isEmpty }.joined(separator: " ")
            self.segment = segment
            text = "**\(side)** \(time)\(later)\n\(words)"
            hasWords = !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }
}
