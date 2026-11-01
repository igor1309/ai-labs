import Composer
import PanelUI
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SessionAudioWarningTests {
    @Test func captureStatisticsWarnAndNonzeroCallAudioClearsTheSessionWarning() async throws {
        try await withComposition(preferences: { .init(automaticRecording: false, liveText: false, callsFolder: $0) },
            configure: { $0.capturePersistence = .transient }) { rig in
            try await rig.start()
            // The fixture's initial nonzero sample precedes five minutes of exact zeros.
            rig.call.source.continuation.yield(.init(samples: Array(repeating: 0, count: 15_001), sampleRate: 50))
            rig.microphone.source.continuation.yield(.init(samples: Array(repeating: 0.5, count: 15_001), sampleRate: 50))
            let warning = try await rig.state { $0.callSilent }
            #expect(warning.phase == .recording && warning.faults.isEmpty)
            let panel = try await rig.panel { $0.banners.contains(.callSilent) }
            #expect(panel.banners == [.callSilent])
            rig.call.source.continuation.yield(.init(samples: [0.25], sampleRate: 50))
            let cleared = try await rig.state { !$0.callSilent }
            #expect(cleared.phase == .recording && cleared.faults.isEmpty)
            _ = try await rig.panel { !$0.banners.contains(.callSilent) }
            try await rig.stop()
        }
    }
}
