import CryptoKit
import Foundation
import SummaryJobs
import TranscriptFormat

struct SummaryCallbacks: Sendable {
    var waiting: @Sendable (URL) async -> Void
    var completed: @Sendable (URL, [Job.Entry], Bool, Bool) async -> Void
    static let disabled = Self(waiting: { _ in }, completed: { _, _, _, _ in })
}

actor SummaryTranscript: SessionTranscriptFile {
    private let base: any SessionTranscriptFile
    private let folder: URL
    private let callbacks: SummaryCallbacks
    private var state = Handoff()
    private var last: CallState?
    private let cleanup: TranscriptCleanup
    private let runs: CleanupRuns
    init(base: any SessionTranscriptFile, folder: URL, callbacks: SummaryCallbacks, cleanup: TranscriptCleanup, runs: CleanupRuns) {
        self.cleanup = cleanup
        self.runs = runs
        self.base = base; self.folder = folder; self.callbacks = callbacks
    }
    func write(_ text: CallState) async throws {
        do {
            try await base.write(text)
            last = text
            let entries = summaryEntries(Transcript.segments(from: text))
            // Actual recognized words remain usable even when the other track failed.
            state = Handoff.reduce(state, .wrote(entries, usable: !entries.isEmpty)).0
        } catch {
            state = Handoff.reduce(state, .writeFailed).0
            throw error
        }
    }
    func close() async {
        await base.close()
        let (next, effect) = Handoff.reduce(state, .closed)
        state = next
        if case let .offer(entries, finalWrite, usable) = effect {
            if finalWrite, let last {
                await runs.start(raw: last, cleanup: cleanup, file: base, folder: folder, callbacks: callbacks)
            } else {
                await callbacks.completed(folder, entries, finalWrite, usable)
            }
        }
    }
    func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment]) async throws {
        try await base.replaceMicrophone(in: state, with: segments)
    }
}

/// `speakerIDs` is the transcript's speaker list, so each remote speaker reads as in the file.
func summaryEntries(_ segments: [TranscriptFormat.Segment], speakerIDs: [String] = []) -> [Job.Entry] {
    segments.compactMap { segment in
        let words = [segment.settled, segment.pending].filter { !$0.isEmpty }.joined(separator: " ")
        guard !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return .init(label: TranscriptFormat.label(segment, speakerIDs: speakerIDs), time: String(segment.start), text: words)
    }
}

func summaryInput(_ entries: [Job.Entry]) -> String {
    // Arrays preserve boundaries and order, so labels/times/text cannot collide.
    let bytes = try! JSONSerialization.data(withJSONObject: entries.map { [$0.label, $0.time, $0.text] })
    return SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
}
