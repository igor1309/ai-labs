import Composer
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SessionPiecesDefaultsTests {
    @Test func productionDefaultsRecordRecognizeDeliverAndWriteBothSides() async throws {
        let profiling = ProfileIntervalSpy()
        try await withComposition(configure: { $0.intervals = profiling.intervals }) { rig in
            try await rig.start()
            await rig.mine.heard.next(); await rig.theirs.heard.next()
            _ = try await rig.panel { if case let .lines(lines) = $0.log { lines.entries.count == 2 } else { false } }
            try await rig.stop()
            #expect(profiling.began.all.contains("Hearing"))
            #expect(profiling.began.all.contains("TranscriptWrite"))
            #expect(profiling.began.all.contains("PanelUpdate"))
            #expect(profiling.began.all.sorted() == profiling.ended.all.sorted())
            let capture = rig.log.entries.all.filter { $0.category == .capture }
            for side in ["microphone", "call"] {
                #expect(capture.filter { $0.message.hasPrefix(side) }.map(\.message) == [
                    "\(side) stream start", "\(side) first piece sampleRate=48000.0 channels=1 frames=2",
                    "\(side) stream stopped pieces=2 frames=3",
                ])
            }
            let states = rig.log.entries.all.filter { $0.category == .session && $0.message.hasPrefix("state ") }
            #expect(states.first?.message.contains("phase=idle") == true)
            #expect(states.last?.message.contains("phase=ended") == true)
            #expect(states.allSatisfy { !$0.message.contains(rig.root.path) })
            #expect(states.last?.message.contains("microphoneCapture=closed callCapture=closed transcript=closed callText=closed") == true)
        }
    }
}
