import Foundation

/// One file's bytes. A successful write may retain a final prefix for later rewrites.
public actor TranscriptFile {

    public enum Failure: Error, Equatable { case writingEnded }

    public nonisolated let url: URL
    private let binding: any TranscriptFileBinding
    private var closed = false
    private var keptOnDisk: Int?

    /// Creates a new file exclusively; a failed initialization removes its creation.
    public init(url: URL, initialBytes: [Data], binding: any TranscriptFileBinding) async throws {

        let file = try binding.create(at: url)
        do {
            for bytes in initialBytes { try file.write(bytes) }
            try file.flush()
        } catch {
            binding.remove(at: url)
            throw error
        }
        self.url = url
        self.binding = binding
    }

    /// Chunks form one byte sequence; finalLength counts its immutable leading bytes.
    /// A missing final length replaces whole and forgets the previously kept prefix.
    /// After any disk failure the next write also replaces whole.
    public func write(_ chunks: [Data], finalLength: Int?) throws {

        guard !closed else { throw Failure.writingEnded }
        let kept = keptOnDisk
        keptOnDisk = nil
        if let kept, let finalLength {
            let file = try binding.open(at: url)
            let length = min(kept, finalLength)
            try file.truncate(to: length)
            var skip = length
            for bytes in chunks {
                let omitted = min(skip, bytes.count)
                skip -= omitted
                try file.write(Data(bytes.dropFirst(omitted)))
            }
            try file.flush()
            keptOnDisk = finalLength
        } else {
            try replace(chunks, finalLength: finalLength)
        }
    }

    /// Whole replacements remain available after close, for after-call edits.
    public func replace(_ chunks: [Data], finalLength: Int?) throws {

        keptOnDisk = nil
        let temporary = url.deletingLastPathComponent().appendingPathComponent(".transcript-\(UUID()).tmp")
        let file = try binding.create(at: temporary)
        defer { binding.remove(at: temporary) }
        for bytes in chunks { try file.write(bytes) }
        try file.flush()
        try binding.rename(from: temporary, to: url)
        keptOnDisk = finalLength
    }

    public func close() { closed = true }
}
