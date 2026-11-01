import BlockingTestWork
import CallAudioProbe
import CoreAudio
import Foundation
import Testing

@Suite(.serialized, .timeLimit(.minutes(1)),
       .disabled(if: ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] != nil, "requires local system audio permission"))
struct RealCallAudioProbeTests {
    /// Contract test: the live output environment installs its listener and reads the system's default output.
    @Test func realOutputEnvironmentReturnsCurrentDefaultOutputDevice() async throws {
        let environment = await offPool { OutputEnvironment() }
        let device = try #require(await environment.device())
        let (status, defaultDevice) = await offPool {
            var address = AudioObjectPropertyAddress(
                mSelector: kAudioHardwarePropertyDefaultOutputDevice,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            var defaultDevice = AudioDeviceID(kAudioObjectUnknown)
            var size = UInt32(MemoryLayout<AudioDeviceID>.size)
            let status = AudioObjectGetPropertyData(
                AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &defaultDevice
            )
            return (status, defaultDevice)
        }
        try #require(status == noErr)
        #expect(defaultDevice != kAudioObjectUnknown)
        #expect(device == defaultDevice)
    }

    /// Contract test: the production own-process muted Core Audio tap hears its stimulus and tears down.
    @Test func realOwnProcessProbeHearsMutedStimulus() async {
        let result = await CallAudioProbe().measure()
        #expect(result == .heard)
    }
}
