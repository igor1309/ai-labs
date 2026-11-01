import AVFoundation
import BlockingTestWork
import Composer
import Foundation
import ParakeetRecognizer
import Testing
@testable import Audelin

@Suite(.timeLimit(.minutes(1)))
struct RealBoundaryTests {
    /// Contract test: the executable selects real adapters, model storage, permission status and disk capacity.
    @Test func executableBuildsTheRealBoundaryWithoutStartingAudio() async throws {
        let boundary = await makeRealBoundary()
        #expect(boundary.capturePersistence == .recorded)
        #expect(boundary.microphone is RealMicrophone)
        #expect(boundary.callAudio is RealCallAudio)
        #expect(boundary.recognizers is RealRecognizerSource)
        #expect(boundary.processes is RealProcessSource)
        #expect(boundary.access is RealCallAudioAccess)
        #expect(boundary.microphonePermission is SystemMicrophonePermission)
        #expect(boundary.capacity is DiskCapacity)
        #expect(boundary.time is RealClock)
        #expect(boundary.log is SystemLogSink)
        await offPool {
            #expect(boundary.recognizers.missingModels() == ParakeetRecognizer.missingModels(in: ParakeetRecognizer.modelsDirectory))
            #expect(boundary.microphonePermission.authorized() == (AVCaptureDevice.authorizationStatus(for: .audio) == .authorized))
            let folder = FileManager.default.temporaryDirectory
            let available = try? folder.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
                .volumeAvailableCapacityForImportantUsage
            #expect((boundary.capacity.available(at: folder) != nil) == (available != nil))
            #expect(boundary.capacity.available(at: folder.appendingPathComponent(UUID().uuidString)) == nil)
        }
        let before = Date()
        let monotonic = ProcessInfo.processInfo.systemUptime
        let now = boundary.time.now()
        let uptime = boundary.time.monotonicNow()
        #expect(now >= before && now <= Date())
        #expect(uptime >= monotonic && uptime <= ProcessInfo.processInfo.systemUptime)
        #expect(boundary.time.timeZone() == .current)
        var states = await boundary.access.states().makeAsyncIterator()
        #expect(await states.next() == false)
    }
}
