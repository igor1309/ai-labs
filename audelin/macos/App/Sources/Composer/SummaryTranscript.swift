import CryptoKit
import Foundation
import SummaryJobs

struct SummaryCallbacks: Sendable {
    var waiting: @Sendable (URL) async -> Void
    var completed: @Sendable (URL, UUID?, [Job.Entry], Bool, Bool) async -> Void
    static let disabled = Self(waiting: { _ in }, completed: { _, _, _, _, _ in })
}

actor SummaryTranscript: SessionTranscriptFile {
    private let base: any SessionTranscriptFile
    private let folder: URL
    private let recording: UUID?
    private let callbacks: SummaryCallbacks
    private var state = Handoff()
    init(base: any SessionTranscriptFile, folder: URL, recording: UUID? = nil, callbacks: SummaryCallbacks) {
        self.base = base; self.folder = folder; self.recording = recording; self.callbacks = callbacks
    }
    func write(_ text: CallState) async throws {
        do {
            try await base.write(text)
            let entries = text.entries.compactMap { entry -> Job.Entry? in
                let settled = entry.text.settledText
                let pending = entry.text.pendingText
                let words = [settled, pending].filter { !$0.isEmpty }.joined(separator: " ")
                guard !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
                return .init(label: entry.speaker == .mine ? "Me" : "Them",
                             time: String(entry.text.start), text: words)
            }
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
            await callbacks.completed(folder, recording, entries, finalWrite, usable)
        }
    }
}

func summaryInput(_ entries: [Job.Entry]) -> String {
    // Arrays preserve boundaries and order, so labels/times/text cannot collide.
    let bytes = try! JSONSerialization.data(withJSONObject: entries.map { [$0.label, $0.time, $0.text] })
    return SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
}
