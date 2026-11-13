import BlockingTestWork
import Composer
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
struct SessionTranscriptTests {
    @Test func liveTextOffLeavesTheNoTextTranscriptAfterStopping() async throws {
        try await withComposition(preferences: { .init(automaticRecording: false, liveText: false, callsFolder: $0) }) { rig in
            try await rig.start()
            try await rig.stop()
            let url = rig.folder().appendingPathComponent("transcript.md")
            #expect(try String(contentsOf: url, encoding: .utf8) == "# Transcript\n\nNo text was heard.\n")
        }
    }

    @Test func theAppWaitsFiveSecondsAfterEachTranscriptWrite() async throws {
        try await withComposition { rig in
            try await rig.start()
            await rig.theirs.heard.next()
            await rig.clock.waitForSleep(.seconds(5))
            try await rig.stop()
            #expect(!rig.clock.asked.all.isEmpty)
            #expect(rig.clock.asked.all.allSatisfy { $0 == .seconds(5) || $0 == .seconds(3) })
        }
    }

    @Test func writeFailureReachesSessionOnceAndRecordingContinues() async throws {
        try await withComposition { rig in
            try await rig.start()
            await rig.mine.heard.next(); await rig.theirs.heard.next()
            await rig.clock.waitForSleep(.seconds(5))
            // Removing the destination gives the real writer a deterministic missing-parent failure.
            let folder = rig.folder()
            try FileManager.default.removeItem(at: folder)
            rig.clock.wake(.seconds(5))
            await rig.log.wait { $0.category == .session && $0.message.contains("phase=recording") && $0.error?.contains("transcript:") == true }
            let recording = try await rig.state { $0.phase == .recording }
            #expect(recording.faults.isEmpty)
            #expect(rig.microphone.stops.all.isEmpty && rig.call.stops.all.isEmpty)
            rig.microphone.source.continuation.yield(.init(samples: [0.625], sampleRate: 48_000))
            rig.call.source.continuation.yield(.init(samples: [-0.625], sampleRate: 48_000))
            try await rig.stop()
            let failures = rig.log.entries.all.filter { $0.category == .session && $0.message.contains("phase=recording") && $0.error?.contains("transcript:") == true }
            #expect(failures.count == 1)
            #expect(rig.microphone.stops.all == [true] && rig.call.stops.all == [true])
            #expect(await rig.mine.chunks.flatMap(\.samples) == [0.25, -0.5, 0.625, 0.125])
            #expect(await rig.theirs.chunks.flatMap(\.samples) == [-0.25, 0.5, -0.625, -0.125])
        }
    }
}
