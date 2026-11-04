import BlockingTestWork
import Composer
import Foundation
import Testing
@testable import Audelin

@Suite(.timeLimit(.minutes(1)))
struct RealBoundaryTests {
    /// Contract test: the executable selects real adapters; capacity is known for a folder that exists and not for one that does not.
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
            #expect((boundary.capacity.available(at: FileManager.default.temporaryDirectory) ?? 0) > 0)
            #expect(boundary.capacity.available(at: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)) == nil)
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
