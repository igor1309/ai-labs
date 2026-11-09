import BlockingTestWork
import AVFAudio
import Foundation
import LiveText
import Session
import Testing
import Composer

@Suite(.timeLimit(.minutes(1)))
@MainActor
struct SessionRateTests {

    @Test(arguments: [[16_000.0, 16_000], [24_000, 24_000], [44_100, 44_100], [96_000, 96_000], [24_000, 96_000]])
    func injectedCaptureRatesReachRecognizersAndTrackDurations(rates: [Double]) async throws {

        let expected = rates.map { AudioChunk(samples: Array(repeating: 0, count: Int($0 / 100)), sampleRate: $0) }
        let first = CaptureBuffer(samples: expected[0].samples, sampleRate: expected[0].sampleRate)
        let last = CaptureBuffer(samples: expected[1].samples, sampleRate: expected[1].sampleRate)
        let microphone = AsyncThrowingStream<CaptureBuffer, any Error>.makeStream()
        let call = AsyncThrowingStream<CaptureBuffer, any Error>.makeStream()
        defer { microphone.continuation.finish(); call.continuation.finish() }
        try await withComposition(configure: { boundary in
            boundary.processes = FixtureProcesses(binding: CallBinding(fails: false))
            boundary.microphone = FixtureMicrophone(begin: {
                StartedCapture(stream: microphone.stream, stop: {
                    microphone.continuation.yield(last)
                    microphone.continuation.finish()
                })
            })
            boundary.callAudio = FixtureCallAudio(begin: { _ in
                StartedCapture(stream: call.stream, stop: {
                    call.continuation.yield(last)
                    call.continuation.finish()
                })
            })
        }) { rig in
            let folder = rig.folder("1970.01.01-0000 Zoom")
            _ = try await rig.state { $0.callOn }
            try await rig.start()
            // Catch-up reads the 48 kHz track; this test exercises live capture rates.
            _ = try await rig.panel { if case .lines = $0.log { true } else { false } }
            microphone.continuation.yield(first)
            call.continuation.yield(first)
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            try await rig.stop()
            #expect(rig.log.entries.all.filter { $0.category == .session }.allSatisfy { $0.error == nil })
            #expect(await rig.mine.chunks == expected)
            #expect(await rig.theirs.chunks == expected)
            for name in ["microphone.caf", "call.caf"] {
                let track = try await audioFile(folder.appendingPathComponent(name))
                #expect(track.sampleRate == 48_000)
                #expect(track.samples == Array(repeating: 0, count: 960))
                #expect(Double(track.samples.count) / track.sampleRate == 0.02)
            }
        }
    }
}
