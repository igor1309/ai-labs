import AVFAudio
import Foundation
import LiveText
import Session
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionRateTests {

    @Test(arguments: [[16_000.0, 16_000], [24_000, 24_000], [44_100, 44_100], [96_000, 96_000], [24_000, 96_000]])
    func injectedCaptureRatesReachRecognizersAndTrackDurations(rates: [Double]) async throws {

        var construction = SessionConstruction()
        construction.makeCallText = { ReadyCallText(text: $0) }
        try await withSessionRig(construction: construction, rates: rates) { rig, folder in
            await rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            await rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures.isEmpty)
            let expected = rates.map { AudioChunk(samples: Array(repeating: 0, count: Int($0 / 100)), sampleRate: $0) }
            #expect(await rig.mine.chunks == expected)
            #expect(await rig.theirs.chunks == expected)
            for name in ["microphone.caf", "call.caf"] {
                let track = try AVAudioFile(forReading: folder.appendingPathComponent(name))
                #expect(track.fileFormat.sampleRate == 48_000)
                #expect(track.length == 960)
                #expect(Double(track.length) / track.fileFormat.sampleRate == 0.02)
                #expect(try recordedSamples(folder.appendingPathComponent(name)) == Array(repeating: 0, count: 960))
            }
        }
    }
}
