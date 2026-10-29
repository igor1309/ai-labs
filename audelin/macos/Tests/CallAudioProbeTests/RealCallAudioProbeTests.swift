import CallAudioProbe
import Foundation
import Testing

@Suite(.serialized, .timeLimit(.minutes(1)),
       .disabled(if: ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] != nil, "requires local system audio permission"))
struct RealCallAudioProbeTests {
    /// Contract test: the production own-process muted Core Audio tap hears its stimulus and tears down.
    @Test func realOwnProcessProbeHearsMutedStimulus() async {
        let result = await CallAudioProbe().measure()
        #expect(result == .heard)
    }
}
