import BlockingTestWork
import Composer
import Foundation
import Preferences
import SessionRehearsal
import Testing

@Suite(.timeLimit(.minutes(1)))
struct BoundaryCompositionTests {
    @Test(arguments: [CapturePersistence.recorded, .transient])
    func audioPersistencePreservesTheExecutableAndProfilingModes(persistence: CapturePersistence) async throws {
        try await withComposeFolder { root in
            let microphone = CaptureScript<CaptureBuffer>(
                first: .init(samples: [0.25], sampleRate: 48_000),
                last: .init(samples: [0.5], sampleRate: 48_000), fails: false)
            let call = CaptureScript<CaptureBuffer>(
                first: .init(samples: [-0.25], sampleRate: 48_000),
                last: .init(samples: [-0.5], sampleRate: 48_000), fails: false)
            defer { microphone.end(); call.end() }
            var boundary = rehearsalBoundary(capturePersistence: persistence,
                microphone: { try microphone.start() }, call: { _ in try call.start() },
                mine: RehearsalRecognizer(SessionRecognizer(name: "unused")),
                theirs: RehearsalRecognizer(SessionRecognizer(name: "unused")),
                now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt },
                sleep: { _ in throw CancellationError() }, intervals: testIntervals)
            boundary.time = ComposerTime(now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt },
                monotonicNow: { 0 }, sleep: { _ in throw CancellationError() },
                after: { _, _ in BoundaryCancellation {} }, ticks: { AsyncStream { $0.finish() } })
            let url = root.appendingPathComponent("preferences.json")
            try await offPool {
                try PreferencesStore(fileURL: url).write(Preferences(automaticRecording: false, liveText: false, callsFolder: root))
            }
            let composition = await compose(boundary: boundary, preferencesURL: url,
                openCallsFolder: { _ in false }, presentCalls: {}, openURL: { _ in }, presentPanel: { _ in }, terminate: {})
            await composition.perform(.start)
            for await state in await composition.states() where state.phase == .recording { break }
            await composition.perform(.quit)
            let folder = root.appendingPathComponent("1970.01.01-0000")
            #expect(try await recordedSamples(folder.appendingPathComponent("microphone.caf")) ==
                    (persistence == .recorded ? [0.25, 0.5] : []))
            #expect(try await recordedSamples(folder.appendingPathComponent("call.caf")) ==
                    (persistence == .recorded ? [-0.25, -0.5] : []))
            #expect(microphone.stops.all == [true])
            #expect(call.stops.all == [true])
        }
    }
}
