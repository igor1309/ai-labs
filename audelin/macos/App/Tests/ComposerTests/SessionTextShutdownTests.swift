import BlockingTestWork
import Composer
import Foundation
import LiveText
import Testing

private actor FinalizingRecognizer: Recognizer {
    let base = SessionRecognizer(name: "kept")
    let finalization: DrainGate?
    private(set) var finalized = false
    init(finalization: DrainGate?) { self.finalization = finalization }
    func hear(_ chunk: AudioChunk) async -> Hearing { await base.hear(chunk) }
    func finish() async -> Hearing {
        if let finalization { await finalization.wait() }
        finalized = true
        return await base.finish()
    }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SessionTextShutdownTests {
    @Test(arguments: [ComposerSide.microphone, .call])
    func stoppingWaitsForHeldFinalization(side: ComposerSide) async throws {
        let finalization = DrainGate(), stopped = Values<Bool>()
        let mine = FinalizingRecognizer(finalization: side == .microphone ? finalization : nil)
        let theirs = FinalizingRecognizer(finalization: side == .call ? finalization : nil)
        defer { finalization.release() }
        try await withComposition(recognizers: (mine, theirs)) { rig in
            try await rig.start()
            _ = try await rig.panel { if case let .lines(lines) = $0.log { lines.entries.count == 2 } else { false } }
            let stop = Task { try await rig.stop(); stopped.append(true) }
            await finalization.waitUntilEntered()
            #expect(stopped.all.isEmpty)
            finalization.release()
            try await stop.value
            #expect(stopped.all == [true])
            #expect(await mine.finalized)
            #expect(await theirs.finalized)
            #expect(await mine.base.finishes == 1)
            #expect(await theirs.base.finishes == 1)
            let url = rig.folder().appendingPathComponent("transcript.md")
            #expect(try await offPool { try String(contentsOf: url, encoding: .utf8) }
                == "# Transcript\n\n**Me** 00:00:00\nkept final\n\n**Them** 00:00:00\nkept final\n")
        }
    }
}
