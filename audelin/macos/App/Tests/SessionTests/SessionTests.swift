import Foundation
import Session
import Testing

@Suite(.timeLimit(.minutes(1)))
struct SessionTests {

    @Test func endingWaitsForLiveTextSwitch() async throws {

        let rig = await Rig(held: ["callText.set(off)"])
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.session.send(.liveTextChanged(false))
        await rig.output.waitUntilHeld("callText.set(off)")
        await rig.session.send(.end)
        let pending = await rig.waitFor { $0.phase == .ending }
        #expect(pending.pendingLiveText != nil)
        #expect(pending.callText == .up)
        #expect(!(await rig.output.values()).contains("callText.stop"))
        await rig.output.release("callText.set(off)")
        let state = await rig.waitFor { $0.phase == .ended }
        #expect(state.phase == .ended)
    }

    @Test(arguments: [true, false], [true, false])
    func newerLiveTextRequestReplacesHeldSwitch(_ enabled: Bool, _ fails: Bool) async throws {

        let held = enabled ? "callText.set(off)" : "callText.set(on)"
        let latestLabel = enabled ? "callText.set(on)" : "callText.set(off)"
        let rig = await Rig(held: [held], failing: fails ? [held] : [])
        await rig.begin(liveText: enabled)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.session.send(.liveTextChanged(!enabled))
        await rig.output.waitUntilHeld(held)
        await rig.session.send(.preferenceChanged(enabled))
        let pending = await rig.waitFor { $0.wantedLiveText == enabled }
        #expect(pending.pendingLiveText?.enabled == !enabled)
        #expect(!(await rig.output.values()).contains(latestLabel))
        await rig.output.release(held)
        let latest = await rig.waitFor { $0.liveText == (enabled ? .on : .off) && $0.pendingLiveText == nil }
        #expect(latest.wantedLiveText == enabled)
        #expect(latest.failures.isEmpty)
        #expect(await rig.callText.enabled == enabled)
        await rig.callText.speak("latest choice")
        #expect(await rig.transcript.values() == (enabled ? ["callText-first", "latest choice"] : []))
        let (unchanged, effect) = SessionReducer.reduce(latest, .liveTextSet(request: .init(id: 1, enabled: !enabled), error: "stale failure"))
        #expect(unchanged == latest)
        #expect(effect == nil)
        await end(rig)
    }

    @Test func switchAcknowledgementDoesNotReportReadiness() async throws {

        let rig = await Rig()
        await rig.begin(liveText: false)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.callText.setSwitchStatus(.gettingReady)
        await rig.session.send(.liveTextChanged(true))
        let ready = await rig.waitFor { $0.pendingLiveText == nil && $0.wantedLiveText }
        #expect(ready.liveText == .gettingReady)
        await rig.callText.report(.on)
        #expect((await rig.waitFor { $0.liveText == .on }).liveText == .on)
        await end(rig)
    }




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

    @Test func liveTextIsGettingReadyWhenRecordingStarts() async throws {

        let rig = await Rig(held: ["callText.start(on)"])
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld("callText.start(on)")
        #expect((await rig.waitFor { $0.callText == .starting }).liveText == .off)
        await rig.output.release("callText.start(on)")
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(state.liveText == .gettingReady)
        await rig.callText.report(.on)
        #expect((await rig.waitFor { $0.liveText == .on }).liveText == .on)
        await rig.callText.report(.gettingReady)
        #expect((await rig.waitFor { $0.liveText == .gettingReady }).liveText == .gettingReady)
        await end(rig)
    }

    @Test func liveTextSwitchesOffAndStopsNewText() async throws {

        let rig = await Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.callText.speak("before")
        await rig.session.send(.liveTextChanged(false))
        let state = await rig.waitFor { $0.liveText == .off }
        #expect(state.microphoneCapture == .up)
        await rig.output.waitUntilRecorded("callText.set(off)")
        await rig.callText.speak("after")
        #expect(await rig.output.values().contains("callText.text(before)"))
        #expect(!(await rig.output.values()).contains("callText.text(after)"))
        #expect(await rig.transcript.values() == ["callText-first", "before"])
        await expectTracksKeepRecording(rig, "after")
        await end(rig)
    }

    @Test func liveTextSwitchesOnAndAcceptsNewText() async throws {

        let rig = await Rig()
        await rig.begin(liveText: false)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.session.send(.liveTextChanged(true))
        _ = await rig.waitFor { $0.liveText == .on }
        await rig.output.waitUntilRecorded("callText.set(on)")
        await rig.callText.speak("new")
        #expect(await rig.output.values().contains("callText.text(new)"))
        #expect(await rig.transcript.values() == ["new"])
        await expectTracksKeepRecording(rig, "after")
        await end(rig)
    }

    @Test func preferenceEventsChangeTheRunningSession() async throws {

        let rig = await Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.session.send(.preferenceChanged(false))
        #expect((await rig.waitFor { $0.liveText == .off }).liveText == .off)
        let before = await rig.transcript.values()
        await rig.callText.speak("ignored while preference off")
        #expect(await rig.transcript.values() == before)
        await expectTracksKeepRecording(rig, "while off")
        await rig.session.send(.preferenceChanged(true))
        #expect((await rig.waitFor { $0.liveText == .on }).liveText == .on)
        await rig.callText.speak("kept")
        #expect(await rig.transcript.values().contains("kept"))
        await expectTracksKeepRecording(rig, "after")
        await end(rig)
    }

    @Test func preferenceAtStartControlsLiveText() async throws {

        let rig = await Rig()
        await rig.begin(liveText: false)
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(state.liveText == .off)
        await rig.callText.speak("ignored")
        #expect(!(await rig.output.values()).contains("callText.text(ignored)"))
        #expect(await rig.transcript.values().isEmpty)
        await expectTracksKeepRecording(rig, "after")
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

// Audio sent now reaches the track of each side named, and no other.
private func expectTracksKeepRecording(
    _ rig: Rig,
    _ audio: String,
    on sides: [SessionSide] = [.microphone, .call]
) async {

    await rig.microphoneCapture.sendAudio("microphone-\(audio)")
    await rig.callCapture.sendAudio("call-\(audio)")
    let microphoneKept = await rig.microphoneTrack.values().last == "microphone-\(audio)"
    let callKept = await rig.callTrack.values().last == "call-\(audio)"
    #expect(microphoneKept == sides.contains(.microphone))
    #expect(callKept == sides.contains(.call))
}

private func end(_ rig: Rig) async {

    await rig.session.send(.end)
    _ = await rig.waitFor { $0.phase == .ended }
}
