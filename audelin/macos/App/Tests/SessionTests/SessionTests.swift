import Foundation
import Session
import Testing

@Suite(.timeLimit(.minutes(1)))
struct SessionTests {

    @Test func processSelectionReachesOnlyCallCapture() async throws {

        let rig = await Rig(selection: .init(id: "fallback-apps"))
        await rig.begin(liveText: false)
        _ = await rig.waitFor { $0.phase == .recording }
        #expect(await rig.output.selection(for: "microphone") == nil)
        #expect(await rig.output.selection(for: "call") == .chosen(.init(id: "fallback-apps")))
        await end(rig)
    }

    @Test func failedProcessChoiceHearsEveryAppButAudelin() async {

        let rig = await Rig(failing: ["processes.select"], callAudioSelection: .everyAppButAudelin)
        await rig.begin(liveText: false)
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(state.failures == [.init(piece: "processes", message: "processes.select failed")])
        #expect(state.microphoneCapture == .up)
        #expect(state.callCapture == .up)
        await rig.callCapture.sendAudio("call-1")
        await rig.callCapture.sendAudio("call-2")
        #expect(await rig.callTrack.values() == ["call-first", "call-1", "call-2"])
        await end(rig)
    }

    @Test(arguments: ["microphone.track.close", "call.track.close", "transcript.close"])
    func closeFailureIsNamedAndEndingContinues(_ failing: String) async throws {

        let rig = await Rig(failing: [failing])
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.session.send(.end)
        let state = await rig.waitFor { $0.phase == .ended }
        #expect(state.failures.contains { $0.message == "close failed" })
        let output = await rig.output.values()
        for label in [
            "microphone.capture.stop", "call.capture.stop", "microphone.track.close",
            "call.track.close", "callText.stop", "transcript.close"
        ] {
            #expect(output.contains(label))
        }
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        #expect(await rig.transcript.values() == ["callText-first", "finishing text"])
    }
}

private func end(_ rig: Rig) async {

    await rig.session.send(.end)
    _ = await rig.waitFor { $0.phase == .ended }
}
