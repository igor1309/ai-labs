import Foundation
import LiveText
import Session
import Testing
@testable import Compose

actor HeldSessionRecognizer: Recognizer {

    let hearing = Signal()
    private let hold = Signal()
    private var hearings = 0
    private let finalization: DrainGate?
    private(set) var finalized = false

    private(set) var active = false
    private(set) var cancelled = false
    private(set) var finishes = 0

    init(finalization: DrainGate? = nil) { self.finalization = finalization }

    func hear(_ chunk: AudioChunk) async throws -> Hearing {

        hearings += 1
        if hearings == 1 { return Hearing(words: [.init("kept", start: 0, end: 1.0 / 48_000)]) }
        active = true
        defer { active = false }
        hearing.send()
        await hold.next()
        cancelled = Task.isCancelled
        try Task.checkCancellation()
        return Hearing(words: [.init("unpublished", start: 0, end: 1)])
    }

    func finish() async -> Hearing {

        finishes += 1
        if let finalization { await finalization.wait() }
        finalized = true
        return Hearing(words: [.init("unpublished final", start: 0, end: 1)])
    }
}

@Suite(.timeLimit(.minutes(1)))
struct SessionTextShutdownTests {

    @Test(arguments: [SessionSide.microphone, .call])
    func stoppingWaitsForHeldFinalizationWithoutChangingText(side: SessionSide) async throws {

        let finalization = DrainGate(), executor = DrainExecutor()
        let stopped = Values<Bool>()
        let mine = HeldSessionRecognizer(finalization: side == .microphone ? finalization : nil)
        let theirs = HeldSessionRecognizer(finalization: side == .call ? finalization : nil)
        var construction = SessionConstruction()
        construction.executor = executor
        let configured = construction
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            try await withDrainRig(construction: configured, recognizers: (mine, theirs)) { rig, folder in
                let text = try #require(await rig.pieces.text)
                let writing = try #require(await rig.pieces.writing)
                for await state in writing.updates {
                    if state.entries.count == 2 { break }
                }
                try await rig.pieces.setEnabled(false)
                let frozen = await text.state.entries
                #expect(frozen.map(\.text.pending) == ["kept", "kept"])
                try await rig.pieces.stopCapture(.microphone)
                try await rig.pieces.stopCapture(.call)
                try await rig.pieces.microphoneTrack.close()
                try await rig.pieces.callTrack.close()
                try await rig.pieces.stop()
                stopped.append(true)
                #expect(await mine.finalized)
                #expect(await theirs.finalized)
                #expect(await text.state.entries == frozen)
                try await rig.pieces.transcript.close()
                #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
                    == "# Transcript\n\n**Me** 00:00:00\nkept\n\n**Them** 00:00:00\nkept\n")
            }
        }
        defer { finalization.release(); executor.run() }
        await executor.run(until: { finalization.entered })
        #expect(finalization.entered)
        #expect(stopped.all.isEmpty)
        finalization.release()
        await executor.finish()
        try await task.value
        #expect(stopped.all == [true])
    }

    @Test func endingWithTextOffJoinsBothAdaptersWhileTheRecordingStaysAlive() async throws {

        let mine = HeldSessionRecognizer(), theirs = HeldSessionRecognizer()
        try await withSessionRig(recognizers: (mine, theirs)) { rig, folder in
            await rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            let text = try #require(await rig.pieces.text)
            let writing = try #require(await rig.pieces.writing)
            for await state in writing.updates {
                if state.entries.count == 2 { break }
            }
            rig.microphone.source.continuation.yield(.init(samples: [0.5], sampleRate: 48_000))
            rig.call.source.continuation.yield(.init(samples: [-0.5], sampleRate: 48_000))
            await mine.hearing.next()
            await theirs.hearing.next()
            await rig.session.send(.liveTextChanged(false))
            _ = try await rig.state { $0.pendingLiveText == nil && !$0.wantedLiveText }
            let frozen = await text.state.entries
            #expect(frozen.map(\.text.pending) == ["kept", "kept"])
            await rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures.isEmpty)
            #expect(await mine.cancelled)
            #expect(await theirs.cancelled)
            #expect(await !mine.active)
            #expect(await !theirs.active)
            #expect(await mine.finishes == 1)
            #expect(await theirs.finishes == 1)
            #expect(await text.state.entries == frozen)
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
                == "# Transcript\n\n**Me** 00:00:00\nkept\n\n**Them** 00:00:00\nkept\n")
        }
    }
}
