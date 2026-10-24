import Foundation
@testable import Machine
import Session
import Testing

@Suite(.timeLimit(.minutes(1)))
struct SessionTests {

    @Test func reducerOrdersBringUpAndBringDown() {

        var state = SessionState()
        var effect: SessionEffect? = nil
        let steps: [(SessionEvent, SessionEffect?, SessionState)] = [
            (.begin(liveText: true), .createFolder, SessionState(wantedLiveText: true, phase: .bringingUp, liveText: .off, folder: .starting)),
            (.folderFinished(error: nil), .selectProcesses, SessionState(wantedLiveText: true, phase: .bringingUp, liveText: .off, folder: .up, processes: .starting)),
            (.processesFinished(selection: .init(id: "chosen-app"), error: nil), .openTrack(.microphone), SessionState(wantedLiveText: true, phase: .bringingUp, liveText: .off, folder: .up, processes: .up, microphoneTrack: .starting, processSelection: .init(id: "chosen-app"))),
            (.trackFinished(.microphone, error: nil), .openTrack(.call), SessionState(wantedLiveText: true, phase: .bringingUp, liveText: .off, folder: .up, processes: .up, microphoneTrack: .up, callTrack: .starting, processSelection: .init(id: "chosen-app"))),
            (.trackFinished(.call, error: nil), .openTranscript, SessionState(wantedLiveText: true, phase: .bringingUp, liveText: .off, folder: .up, processes: .up, microphoneTrack: .up, callTrack: .up, transcript: .starting, processSelection: .init(id: "chosen-app"))),
            (.transcriptFinished(error: nil), .startCallText(enabled: true), SessionState(wantedLiveText: true, phase: .bringingUp, liveText: .off, folder: .up, processes: .up, microphoneTrack: .up, callTrack: .up, transcript: .up, callText: .starting, processSelection: .init(id: "chosen-app"))),
            (.callTextFinished(error: nil), .startMicrophoneCapture, SessionState(wantedLiveText: true, phase: .bringingUp, liveText: .off, folder: .up, processes: .up, microphoneTrack: .up, callTrack: .up, microphoneCapture: .starting, transcript: .up, callText: .up, processSelection: .init(id: "chosen-app"))),
            (.captureFinished(.microphone, error: nil), .startCallCapture(selection: .init(id: "chosen-app")), SessionState(wantedLiveText: true, phase: .bringingUp, liveText: .off, folder: .up, processes: .up, microphoneTrack: .up, callTrack: .up, microphoneCapture: .up, callCapture: .starting, transcript: .up, callText: .up, processSelection: .init(id: "chosen-app"))),
        ]

        for (event, expected, expectedState) in steps {
            (state, effect) = SessionReducer.reduce(state, event)
            #expect(effect == expected)
            #expect(state == expectedState)
        }
        (state, effect) = SessionReducer.reduce(state, .captureFinished(.call, error: nil))
        #expect(state.phase == .recording)
        #expect(effect == nil)

        let (ending, repeatedEffect) = SessionReducer.reduce(state, .end)
        #expect(ending.phase == .ending)
        #expect(repeatedEffect == .stopCapture(.microphone))
        let (stillEnding, noDuplicate) = SessionReducer.reduce(ending, .end)
        #expect(stillEnding == ending)
        #expect(noDuplicate == nil)

        (state, effect) = (ending, repeatedEffect)
        #expect(effect == .stopCapture(.microphone))
        (state, effect) = SessionReducer.reduce(state, .captureStopped(.microphone, error: nil))
        #expect(effect == .stopCapture(.call))
        (state, effect) = SessionReducer.reduce(state, .captureStopped(.call, error: nil))
        #expect(effect == .closeTrack(.microphone))
        (state, effect) = SessionReducer.reduce(state, .trackClosed(.microphone, error: nil))
        #expect(effect == .closeTrack(.call))
        (state, effect) = SessionReducer.reduce(state, .trackClosed(.call, error: nil))
        #expect(effect == .stopCallText)
        (state, effect) = SessionReducer.reduce(state, .callTextStopped(error: nil))
        #expect(effect == .closeTranscript)
        (state, effect) = SessionReducer.reduce(state, .transcriptClosed(error: nil))
        #expect(state.phase == .ended)
        #expect(effect == nil)
    }

    @Test func bothSidesComeUpInDestinationOrder() async throws {

        let rig = Rig()
        let states = await rig.session.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        await rig.begin(liveText: true)
        let recording = try await nextState(&updates) { $0.phase == .recording }
        #expect(recording.microphoneCapture == .up)
        #expect(recording.callCapture == .up)
        #expect(await rig.output.values() == [
            "folder.create", "processes.select", "microphone.track.open", "call.track.open",
            "transcript.open", "callText.start(on)", "call.text", "microphone.capture.start",
            "microphone.audio", "call.capture.start", "call.audio"
        ])
        #expect(await rig.output.selection(for: "microphone") == nil)
        #expect(await rig.output.selection(for: "call") == .init(id: "chosen-app"))
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        #expect(await rig.transcript.values() == ["callText-first"])
        await end(rig)
    }

    @Test func endingKeepsAllOutputAndStopsSourcesFirst() async throws {

        let rig = Rig()
        let states = await rig.session.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        await rig.begin(liveText: true)
        _ = try await nextState(&updates) { $0.phase == .recording }
        await rig.callText.speak("finishing text")
        rig.session.send(.end)
        _ = try await nextState(&updates) { $0.phase == .ended }
        let output = await rig.output.values()
        #expect(output.contains("callText.text(finishing text)"))
        #expect(output.firstIndex(of: "microphone.capture.stop")! < output.firstIndex(of: "microphone.track.close")!)
        #expect(output.firstIndex(of: "call.capture.stop")! < output.firstIndex(of: "call.track.close")!)
        #expect(output.last == "transcript.close")
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        #expect(await rig.transcript.values() == ["callText-first", "finishing text", "finishing text"])
        #expect(output.contains("callText.stop"))
        await rig.session.end()
    }

    @Test(arguments: [
        "folder.create", "processes.select", "microphone.track.open", "call.track.open",
        "transcript.open", "callText.start(on)", "microphone.capture.start", "call.capture.start"
    ])
    func endingDuringBringUpDoesNotStartLaterPieces(_ held: String) async throws {

        let rig = Rig(held: [held])
        let states = await rig.session.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld(held)
        rig.session.send(.end)
        await rig.output.release(held)
        _ = try await nextState(&updates) { $0.phase == .ended }
        let output = await rig.output.values()
        let bringUp = [
            "folder.create", "processes.select", "microphone.track.open", "call.track.open",
            "transcript.open", "callText.start(on)", "microphone.capture.start", "call.capture.start"
        ]
        let actualBringUp = output.filter { bringUp.contains($0) }
        let heldIndex = bringUp.firstIndex(of: held)!
        #expect(actualBringUp == Array(bringUp.prefix(heldIndex + 1)))
        #expect(!actualBringUp.contains { bringUp.firstIndex(of: $0)! > heldIndex })
        #expect(output == endingOutput(for: held))
        await rig.session.end()
    }

    @Test func aCaptureThatComesUpAfterEndIsStoppedBeforeEnded() async throws {

        let held = "call.capture.start"
        let rig = Rig(held: [held])
        let states = await rig.session.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld(held)
        rig.session.send(.end)
        await rig.output.release(held)
        let ending = try await nextState(&updates) { $0.phase == .ending && $0.microphoneCapture == .stopping }
        #expect(ending.microphoneCapture == .stopping)
        _ = try await nextState(&updates) { $0.phase == .ended }
        let output = await rig.output.values()
        #expect(output.contains("call.capture.start"))
        #expect(output.contains("call.capture.stop"))
        #expect(output.firstIndex(of: "call.capture.start")! < output.firstIndex(of: "call.capture.stop")!)
        await rig.session.end()
    }

    @Test func shutdownWaitsForStartsAndStopsBeforeClosingTracks() async throws {

        let rig = Rig(held: ["call.capture.start", "microphone.capture.stop"])
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld("call.capture.start")
        rig.session.send(.end)
        let starting = await rig.session.snapshot()
        #expect(starting.phase == .ending)
        #expect(starting.callCapture == .starting)
        #expect(starting.microphoneCapture == .up)
        #expect(!(await rig.output.values()).contains("microphone.capture.stop"))
        await rig.output.release("call.capture.start")
        await rig.output.waitUntilHeld("microphone.capture.stop")
        let stopping = await rig.session.snapshot()
        #expect(stopping.phase == .ending)
        #expect(stopping.microphoneCapture == .stopping)
        #expect(stopping.callCapture == .up)
        #expect(stopping.microphoneTrack == .up)
        #expect(stopping.callTrack == .up)
        await rig.microphoneCapture.sendAudio("last audio")
        #expect(await rig.microphoneTrack.values() == ["microphone-first", "last audio"])
        await rig.output.release("microphone.capture.stop")
        let ended = await rig.waitFor { $0.phase == .ended }
        #expect(ended.lifecycles.allSatisfy { $0 == .closed || $0 == .down })
        #expect(await rig.microphoneTrack.values() == ["microphone-first", "last audio"])
        await rig.session.end()
    }

    @Test(arguments: [
        "folder", "processes", "microphone.track", "call.track", "transcript", "callText",
        "microphone.capture", "call.capture", "microphone.access", "call.access"
    ])
    func healthChangesDuringStartDoNotErasePendingWork(_ caseName: String) async throws {

        let label = startLabel(for: caseName)
        let rig = Rig(held: [label])
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld(label)
        let failure = runtimeFailure(for: caseName)
        rig.session.send(failure.event)
        rig.session.send(.end)
        let pending = await rig.session.snapshot()
        #expect(pending.phase == .ending)
        #expect(pending.lifecycles.contains(.starting))
        #expect(pending.failures.contains(failure.expected))
        #expect(!(await rig.output.values()).contains { $0.hasSuffix(".close") || $0.hasSuffix(".stop") })
        await rig.output.release(label)
        let ended = await rig.waitFor { $0.phase == .ended }
        #expect(ended.lifecycles.allSatisfy { $0 == .closed || $0 == .down })
        #expect(ended.failures.contains(failure.expected))
        if let cleanup = cleanupLabel(for: label) {
            #expect(await rig.output.values().contains(cleanup))
        }
        await rig.session.end()
    }

    @Test(arguments: [
        "microphone.capture.stop", "call.capture.stop", "microphone.track.close",
        "call.track.close", "callText.stop", "transcript.close",
        "microphone.access", "call.access"
    ])
    func healthChangesDuringStopDoNotErasePendingWork(_ caseName: String) async throws {

        let label = caseName.hasSuffix("access") ? caseName.replacingOccurrences(of: "access", with: "capture.stop") : caseName
        let rig = Rig(held: [label])
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        rig.session.send(.end)
        await rig.output.waitUntilHeld(label)
        let failure = runtimeFailure(for: caseName.replacingOccurrences(of: ".stop", with: "").replacingOccurrences(of: ".close", with: ""))
        rig.session.send(failure.event)
        let pending = await rig.session.snapshot()
        #expect(pending.phase == .ending)
        #expect(pending.lifecycles.contains(.stopping))
        #expect(pending.failures.contains(failure.expected))
        #expect(await rig.output.values().last == label)
        await rig.output.release(label)
        let ended = await rig.waitFor { $0.phase == .ended }
        #expect(ended.lifecycles.allSatisfy { $0 == .closed || $0 == .down })
        #expect(ended.failures.contains(failure.expected))
        await rig.session.end()
    }

    @Test func folderFailureSaysCannotRecordAndWaitsForEnd() async throws {

        let rig = Rig(failing: ["folder.create"])
        await rig.begin(liveText: true)
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "folder: folder.create failed")
        #expect(state.phase == .bringingUp)
        #expect(await rig.output.values() == ["folder.create"])
        await end(rig)
    }

    @Test func folderFailureAlreadyInFlightStillSettlesAfterEnd() async throws {

        let rig = Rig(held: ["folder.create"], failing: ["folder.create"])
        let states = await rig.session.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld("folder.create")
        rig.session.send(.end)
        await rig.output.release("folder.create")
        let state = try await nextState(&updates) { $0.phase == .ended }
        #expect(state.cannotRecord != nil)
        await rig.session.end()
    }

    @Test func bothCaptureFailuresSayCannotRecord() async throws {

        let rig = Rig(failing: ["microphone.capture.start", "call.capture.start"])
        await rig.begin(liveText: true)
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "no track can record")
        #expect(state.phase == .bringingUp)
        #expect(state.health[.capture(.microphone)] == .failed("microphone.capture.start failed"))
        #expect(state.health[.capture(.call)] == .failed("call.capture.start failed"))
        #expect(state.failures == [
            .init(piece: "microphone capture", message: "microphone.capture.start failed"),
            .init(piece: "call capture", message: "call.capture.start failed")
        ])
        await end(rig)
    }

    @Test func bothTrackFailuresSayCannotRecord() async throws {

        let rig = Rig(failing: ["microphone.track.open", "call.track.open"])
        await rig.begin(liveText: true)
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "no track can record")
        #expect(state.health[.track(.microphone)] == .failed("microphone.track.open failed"))
        #expect(state.health[.track(.call)] == .failed("call.track.open failed"))
        #expect(state.failures == [
            .init(piece: "microphone track", message: "microphone.track.open failed"),
            .init(piece: "call track", message: "call.track.open failed")
        ])
        await end(rig)
    }

    @Test func otherFailureIsNamedAndTheOtherSideRecords() async throws {

        let rig = Rig(failing: ["call.track.open"])
        await rig.begin(liveText: true)
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(state.failures.contains { $0.piece == "call track" })
        #expect(state.microphoneCapture == .up)
        await rig.microphoneCapture.sendAudio()
        #expect(await rig.output.values().contains("microphone.audio"))
        await end(rig)
    }

    @Test(arguments: [
        "processes.select", "microphone.track.open", "call.track.open", "transcript.open",
        "callText.start(on)", "microphone.capture.start", "call.capture.start"
    ])
    func eachOtherBringUpFailureKeepsAnotherTrack(_ failing: String) async throws {

        let rig = Rig(failing: [failing])
        await rig.begin(liveText: true)
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(state.failures.contains(.init(piece: bringUpFailurePiece(failing), message: "\(failing) failed")))
        #expect(state.microphoneTrack.isUp || state.callTrack.isUp)
        let output = await rig.output.values()
        if failing.contains("microphone") || failing == "processes.select" {
            #expect(output.contains("call.audio"))
        } else if failing.contains("call") {
            #expect(output.contains("microphone.audio"))
        } else {
            #expect(output.contains("microphone.audio"))
            #expect(output.contains("call.audio"))
        }
        await end(rig)
    }

    @Test func lostAccessIsNamedWhileTheOtherSideRecords() async throws {

        let rig = Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        rig.session.send(.accessChanged(.microphone, available: false))
        let state = await rig.waitFor { $0.failures.contains { $0.piece == "microphone access" } }
        #expect(state.callCapture == .up)
        #expect(state.microphoneCapture == .up)
        await end(rig)
        let output = await rig.output.values()
        #expect(output.firstIndex(of: "microphone.capture.stop")! < output.firstIndex(of: "microphone.track.close")!)
        #expect((await rig.session.snapshot()).microphoneCapture == .closed)
    }

    @Test func runtimeFailureKeepsOtherSideAndNamesThePiece() async throws {

        let rig = Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.microphoneCapture.sendAudio("before-failure")
        rig.session.send(.pieceFailed(.capture(.microphone), error: "device stopped"))
        let state = await rig.waitFor { $0.failures.contains { $0.piece == "microphone capture" } }
        #expect(state.health[.capture(.microphone)] == .failed("device stopped"))
        #expect(state.callCapture == .up)
        #expect(state.phase == .recording)
        #expect(await rig.microphoneTrack.values() == ["microphone-first", "before-failure"])
        await end(rig)
    }

    @Test(arguments: [SessionSide.microphone, SessionSide.call])
    func runtimeTrackFailureAndAccessLossSaysCannotRecord(_ failedTrack: SessionSide) async throws {

        let rig = Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        let lostAccess = failedTrack == .microphone ? SessionSide.call : .microphone
        rig.session.send(.pieceFailed(.track(failedTrack), error: "disk stopped"))
        rig.session.send(.accessChanged(lostAccess, available: false))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "no track can record")
        #expect(state.failures.contains(.init(piece: failedTrack == .microphone ? "microphone track" : "call track", message: "disk stopped")))
        #expect(state.failures.contains(.init(piece: lostAccess == .microphone ? "microphone access" : "call access", message: "access lost")))
        if failedTrack == .microphone {
            #expect(state.health[.track(.microphone)] == .failed("disk stopped"))
            #expect(state.health[.access(.call)] == .accessLost)
        } else {
            #expect(state.health[.track(.call)] == .failed("disk stopped"))
            #expect(state.health[.access(.microphone)] == .accessLost)
        }
        await end(rig)
    }

    @Test(arguments: [SessionSide.microphone, SessionSide.call])
    func bringUpAccessLossKeepsTheOtherSide(_ side: SessionSide) async throws {

        let rig = Rig(held: ["folder.create"])
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld("folder.create")
        rig.session.send(.accessChanged(side, available: false))
        await rig.output.release("folder.create")
        let state = await rig.waitFor { $0.phase == .recording }
        let piece = side == .microphone ? "microphone access" : "call access"
        #expect(state.failures.contains(.init(piece: piece, message: "access lost")))
        if side == .microphone {
            #expect(state.health[.access(.microphone)] == .accessLost)
            #expect(state.callCapture == .up)
            #expect(await rig.output.values().contains("call.audio"))
        } else {
            #expect(state.health[.access(.call)] == .accessLost)
            #expect(state.microphoneCapture == .up)
            #expect(await rig.output.values().contains("microphone.audio"))
        }
        await end(rig)
    }

    @Test func bothRuntimeCaptureFailuresSayCannotRecord() async throws {

        let rig = Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        rig.session.send(.pieceFailed(.capture(.microphone), error: "microphone stopped"))
        rig.session.send(.pieceFailed(.capture(.call), error: "call stopped"))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "no track can record")
        #expect(state.health[.capture(.microphone)] == .failed("microphone stopped"))
        #expect(state.health[.capture(.call)] == .failed("call stopped"))
        #expect(state.failures == [
            .init(piece: "microphone capture", message: "microphone stopped"),
            .init(piece: "call capture", message: "call stopped")
        ])
        await end(rig)
    }

    @Test func bothRuntimeTrackFailuresSayCannotRecord() async throws {

        let rig = Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.microphoneCapture.sendAudio("microphone kept")
        await rig.callCapture.sendAudio("call kept")
        rig.session.send(.pieceFailed(.track(.microphone), error: "microphone disk failed"))
        rig.session.send(.pieceFailed(.track(.call), error: "call disk failed"))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "no track can record")
        #expect(state.failures == [
            .init(piece: "microphone track", message: "microphone disk failed"),
            .init(piece: "call track", message: "call disk failed")
        ])
        #expect(state.microphoneTrack == .up)
        #expect(state.callTrack == .up)
        #expect(!(await rig.output.values()).contains { $0.hasSuffix(".close") || $0.hasSuffix(".stop") })
        await end(rig)
        #expect(await rig.microphoneTrack.values() == ["microphone-first", "microphone kept"])
        #expect(await rig.callTrack.values() == ["call-first", "call kept"])
    }

    @Test func lateCaptureSuccessDoesNotEraseRuntimeFailure() {

        var state = SessionState(
            phase: .bringingUp,
            microphoneTrack: .up,
            callTrack: .up,
            microphoneCapture: .starting,
            callCapture: .starting
        )
        (state, _) = SessionReducer.reduce(state, .pieceFailed(.capture(.microphone), error: "device stopped"))
        (state, _) = SessionReducer.reduce(state, .captureFinished(.microphone, error: nil))
        #expect(state.health[.capture(.microphone)] == .failed("device stopped"))
        #expect(state.failures == [SessionFailure(piece: "microphone capture", message: "device stopped")])
    }

    @Test func folderFailureWhileRecordingSaysCannotRecord() async throws {

        let rig = Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        rig.session.send(.pieceFailed(.folder, error: "folder stopped"))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "folder: folder stopped")
        #expect(state.health[.folder] == .failed("folder stopped"))
        #expect(state.failures.contains(SessionFailure(piece: "folder", message: "folder stopped")))
        await end(rig)
    }

    @Test func endingWaitsForLiveTextSwitch() async throws {

        let rig = Rig(held: ["callText.set(off)"])
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        rig.session.send(.liveTextChanged(false))
        await rig.output.waitUntilHeld("callText.set(off)")
        rig.session.send(.end)
        let pending = await rig.session.snapshot()
        #expect(pending.phase == .ending)
        #expect(pending.pendingLiveText != nil)
        #expect(pending.callText == .up)
        #expect(!(await rig.output.values()).contains("callText.stop"))
        await rig.output.release("callText.set(off)")
        let state = await rig.waitFor { $0.phase == .ended }
        #expect(state.phase == .ended)
        await rig.session.end()
    }

    @Test(arguments: [true, false], [true, false])
    func newerLiveTextRequestReplacesHeldSwitch(_ enabled: Bool, _ fails: Bool) async throws {

        let held = enabled ? "callText.set(off)" : "callText.set(on)"
        let latestLabel = enabled ? "callText.set(on)" : "callText.set(off)"
        let rig = Rig(held: [held], failing: fails ? [held] : [])
        await rig.begin(liveText: enabled)
        _ = await rig.waitFor { $0.phase == .recording }
        rig.session.send(.liveTextChanged(!enabled))
        await rig.output.waitUntilHeld(held)
        rig.session.send(.preferenceChanged(enabled))
        let pending = await rig.session.snapshot()
        #expect(pending.wantedLiveText == enabled)
        #expect(pending.pendingLiveText?.enabled == !enabled)
        #expect(!(await rig.output.values()).contains(latestLabel))
        await rig.output.release(held)
        let latest = await rig.waitFor { $0.liveText == (enabled ? .on : .off) && $0.pendingLiveText == nil }
        #expect(latest.wantedLiveText == enabled)
        #expect(latest.failures.isEmpty)
        #expect(await rig.callText.enabled == enabled)
        await rig.callText.speak("latest choice")
        #expect(await rig.transcript.values() == (enabled ? ["callText-first", "latest choice"] : []))
        rig.session.send(.liveTextSet(request: .init(id: 1, enabled: !enabled), error: "stale failure"))
        let unchanged = await rig.session.snapshot()
        #expect(unchanged == latest)
        await end(rig)
    }

    @Test func switchAcknowledgementDoesNotReportReadiness() async throws {

        let rig = Rig()
        await rig.begin(liveText: false)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.callText.setSwitchStatus(.gettingReady)
        rig.session.send(.liveTextChanged(true))
        let ready = await rig.waitFor { $0.pendingLiveText == nil && $0.wantedLiveText }
        #expect(ready.liveText == .gettingReady)
        await rig.callText.report(.on)
        #expect((await rig.waitFor { $0.liveText == .on }).liveText == .on)
        await end(rig)
    }

    @Test(arguments: [
        "folder", "processes", "microphone.track", "call.track", "transcript",
        "callText", "microphone.capture", "call.capture", "microphone.access", "call.access"
    ])
    func runtimeFailureMatrixRunsThroughSession(_ caseName: String) async throws {

        let rig = Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.microphoneCapture.sendAudio("microphone before")
        await rig.callCapture.sendAudio("call before")
        await rig.callText.speak("text before")
        let failure = runtimeFailure(for: caseName)
        rig.session.send(failure.event)
        _ = await rig.waitFor { $0.failures.contains(failure.expected) }
        await rig.settleEffects()
        let state = await rig.session.snapshot()
        #expect(state.failures.contains(failure.expected))
        #expect(state.failures.contains { $0.message == "runtime failed" || $0.message == "access lost" })
        if caseName == "folder" {
            #expect(state.cannotRecord == "folder: runtime failed")
        } else if caseName.hasSuffix("access") {
            if failure.side == .microphone {
                #expect(state.health[.access(.microphone)] == .accessLost)
                #expect(state.callCapture == .up)
            } else {
                #expect(state.health[.access(.call)] == .accessLost)
                #expect(state.microphoneCapture == .up)
            }
        } else {
            #expect(state.phase == .recording)
            #expect(state.failures.contains(failure.expected))
        }
        #expect(state.lifecycles.allSatisfy { $0 == .up })
        switch failure.event {
        case let .pieceFailed(piece, error):
            #expect(state.health(of: piece) == .failed(error))
        case let .accessChanged(side, _):
            #expect(state.health(of: .access(side)) == .accessLost)
        default:
            Issue.record("The failure matrix must supply a health change")
        }
        let survivors = survivingSides(for: caseName)
        for side in survivors {
            #expect(state.health(of: .capture(side)) == .fine)
            #expect(state.health(of: .track(side)) == .fine)
            #expect(state.health(of: .access(side)) == .fine)
        }
        if caseName != "callText" && caseName != "transcript" {
            await rig.callText.speak("after-\(caseName)")
        }
        if survivors.contains(.microphone) { await rig.microphoneCapture.sendAudio("after-\(caseName)") }
        if survivors.contains(.call) {
            await rig.callCapture.sendAudio("after-\(caseName)")
        }
        let microphoneAudio = await rig.microphoneTrack.values()
        let callAudio = await rig.callTrack.values()
        #expect(Array(microphoneAudio.prefix(2)) == ["microphone-first", "microphone before"])
        #expect(Array(callAudio.prefix(2)) == ["call-first", "call before"])
        let text = await rig.transcript.values()
        #expect(Array(text.prefix(2)) == ["callText-first", "text before"])
        if caseName != "callText" && caseName != "transcript" {
            #expect(text == ["callText-first", "text before", "after-\(caseName)"])
        }
        if survivors.contains(.microphone) { #expect(microphoneAudio.contains("after-\(caseName)")) }
        if survivors.contains(.call) { #expect(callAudio.contains("after-\(caseName)")) }
        await end(rig)
    }

    @Test func heldHarnessOperationEndsOnCancellation() async throws {

        let output = TestOutput(held: ["held operation"], failing: [])
        let operation = Task { try await output.perform("held operation") }
        await output.waitUntilHeld("held operation")
        operation.cancel()
        do {
            try await operation.value
            Issue.record("A held operation must stop when cancelled")
        } catch {
            #expect(error is CancellationError)
        }
    }

    @Test func accessLossWinsOverLateCaptureStart() {

        var state = SessionState(
            phase: .bringingUp,
            microphoneTrack: .up,
            callTrack: .up,
            microphoneCapture: .starting,
            callCapture: .starting
        )
        (state, _) = SessionReducer.reduce(state, .accessChanged(.microphone, available: false))
        (state, _) = SessionReducer.reduce(state, .captureFinished(.microphone, error: nil))
        #expect(state.health[.access(.microphone)] == .accessLost)
        #expect(state.failures.contains { $0.piece == "microphone access" })
    }

    @Test func processSelectionReachesOnlyCallCapture() async throws {

        let rig = Rig(selection: .init(id: "fallback-apps"))
        await rig.begin(liveText: false)
        _ = await rig.waitFor { $0.phase == .recording }
        #expect(await rig.output.selection(for: "microphone") == nil)
        #expect(await rig.output.selection(for: "call") == .init(id: "fallback-apps"))
        await end(rig)
    }

    @Test func liveTextIsGettingReadyWhenRecordingStarts() async throws {

        let rig = Rig(held: ["callText.start(on)"])
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld("callText.start(on)")
        #expect((await rig.session.snapshot()).liveText == .off)
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

        let rig = Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.callText.speak("before")
        rig.session.send(.liveTextChanged(false))
        let state = await rig.waitFor { $0.liveText == .off }
        #expect(state.microphoneCapture == .up)
        await rig.output.waitUntilRecorded("callText.set(off)")
        await rig.callText.speak("after")
        #expect(await rig.output.values().contains("callText.text(before)"))
        #expect(!(await rig.output.values()).contains("callText.text(after)"))
        #expect(await rig.transcript.values() == ["callText-first", "before"])
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        await end(rig)
    }

    @Test func liveTextSwitchesOnAndAcceptsNewText() async throws {

        let rig = Rig()
        await rig.begin(liveText: false)
        _ = await rig.waitFor { $0.phase == .recording }
        rig.session.send(.liveTextChanged(true))
        _ = await rig.waitFor { $0.liveText == .on }
        await rig.output.waitUntilRecorded("callText.set(on)")
        await rig.callText.speak("new")
        #expect(await rig.output.values().contains("callText.text(new)"))
        #expect(await rig.transcript.values() == ["new"])
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        await end(rig)
    }

    @Test func preferenceEventsChangeTheRunningSession() async throws {

        let rig = Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        rig.session.send(.preferenceChanged(false))
        #expect((await rig.waitFor { $0.liveText == .off }).liveText == .off)
        let before = await rig.transcript.values()
        await rig.callText.speak("ignored while preference off")
        #expect(await rig.transcript.values() == before)
        rig.session.send(.preferenceChanged(true))
        #expect((await rig.waitFor { $0.liveText == .on }).liveText == .on)
        await rig.callText.speak("kept")
        #expect(await rig.transcript.values().contains("kept"))
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        await end(rig)
    }

    @Test func preferenceAtStartControlsLiveText() async throws {

        let rig = Rig()
        await rig.begin(liveText: false)
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(state.liveText == .off)
        await rig.callText.speak("ignored")
        #expect(!(await rig.output.values()).contains("callText.text(ignored)"))
        #expect(await rig.transcript.values().isEmpty)
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        await end(rig)
    }

    @Test(arguments: ["microphone.track.close", "call.track.close", "transcript.close"])
    func closeFailureIsNamedAndEndingContinues(_ failing: String) async throws {

        let rig = Rig(failing: [failing])
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        rig.session.send(.end)
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
        await rig.session.end()
    }
}

private extension SessionState {

    var lifecycles: [PieceStatus] {

        [folder, processes, microphoneTrack, callTrack, microphoneCapture, callCapture, transcript, callText]
    }
}

private func startLabel(for name: String) -> String {

    switch name {
    case "folder": "folder.create"
    case "processes": "processes.select"
    case "microphone.track", "call.track", "transcript": name + ".open"
    case "callText": "callText.start(on)"
    case "microphone.access": "microphone.capture.start"
    case "call.access": "call.capture.start"
    default: name + ".start"
    }
}

private func cleanupLabel(for start: String) -> String? {

    switch start {
    case "folder.create", "processes.select": nil
    case "callText.start(on)": "callText.stop"
    default: start.replacingOccurrences(of: ".start", with: ".stop").replacingOccurrences(of: ".open", with: ".close")
    }
}

private struct RuntimeFailure {

    let event: SessionEvent
    let expected: SessionFailure
    let side: SessionSide?
}

private func bringUpFailurePiece(_ label: String) -> String {

    switch label {
    case "processes.select": "processes"
    case "microphone.track.open": "microphone track"
    case "call.track.open": "call track"
    case "transcript.open": "transcript"
    case "callText.start(on)": "call text"
    case "microphone.capture.start": "microphone capture"
    case "call.capture.start": "call capture"
    default: fatalError("unknown bring-up failure \(label)")
    }
}

private func survivingSides(for name: String) -> [SessionSide] {

    switch name {
    case "microphone.track", "microphone.capture", "microphone.access": [.call]
    case "call.track", "call.capture", "call.access": [.microphone]
    default: [.microphone, .call]
    }
}

private func runtimeFailure(for name: String) -> RuntimeFailure {

    switch name {
    case "folder":
        RuntimeFailure(event: .pieceFailed(.folder, error: "runtime failed"), expected: .init(piece: "folder", message: "runtime failed"), side: nil)
    case "processes":
        RuntimeFailure(event: .pieceFailed(.processes, error: "runtime failed"), expected: .init(piece: "processes", message: "runtime failed"), side: nil)
    case "microphone.track":
        RuntimeFailure(event: .pieceFailed(.track(.microphone), error: "runtime failed"), expected: .init(piece: "microphone track", message: "runtime failed"), side: nil)
    case "call.track":
        RuntimeFailure(event: .pieceFailed(.track(.call), error: "runtime failed"), expected: .init(piece: "call track", message: "runtime failed"), side: nil)
    case "transcript":
        RuntimeFailure(event: .pieceFailed(.transcript, error: "runtime failed"), expected: .init(piece: "transcript", message: "runtime failed"), side: nil)
    case "callText":
        RuntimeFailure(event: .pieceFailed(.callText, error: "runtime failed"), expected: .init(piece: "call text", message: "runtime failed"), side: nil)
    case "microphone.capture":
        RuntimeFailure(event: .pieceFailed(.capture(.microphone), error: "runtime failed"), expected: .init(piece: "microphone capture", message: "runtime failed"), side: nil)
    case "call.capture":
        RuntimeFailure(event: .pieceFailed(.capture(.call), error: "runtime failed"), expected: .init(piece: "call capture", message: "runtime failed"), side: nil)
    case "microphone.access":
        RuntimeFailure(event: .accessChanged(.microphone, available: false), expected: .init(piece: "microphone access", message: "access lost"), side: .microphone)
    case "call.access":
        RuntimeFailure(event: .accessChanged(.call, available: false), expected: .init(piece: "call access", message: "access lost"), side: .call)
    default:
        fatalError("unknown runtime failure \(name)")
    }
}

private func endingOutput(for held: String) -> [String] {

    switch held {
    case "folder.create": ["folder.create"]
    case "processes.select": ["folder.create", "processes.select"]
    case "microphone.track.open": ["folder.create", "processes.select", "microphone.track.open", "microphone.track.close"]
    case "call.track.open": ["folder.create", "processes.select", "microphone.track.open", "call.track.open", "microphone.track.close", "call.track.close"]
    case "transcript.open": ["folder.create", "processes.select", "microphone.track.open", "call.track.open", "transcript.open", "microphone.track.close", "call.track.close", "transcript.close"]
    case "callText.start(on)": ["folder.create", "processes.select", "microphone.track.open", "call.track.open", "transcript.open", "callText.start(on)", "call.text", "microphone.track.close", "call.track.close", "callText.stop", "callText.finalText", "transcript.close"]
    case "microphone.capture.start": ["folder.create", "processes.select", "microphone.track.open", "call.track.open", "transcript.open", "callText.start(on)", "call.text", "microphone.capture.start", "microphone.audio", "microphone.capture.stop", "microphone.track.close", "call.track.close", "callText.stop", "callText.finalText", "transcript.close"]
    case "call.capture.start": ["folder.create", "processes.select", "microphone.track.open", "call.track.open", "transcript.open", "callText.start(on)", "call.text", "microphone.capture.start", "microphone.audio", "call.capture.start", "call.audio", "microphone.capture.stop", "call.capture.stop", "microphone.track.close", "call.track.close", "callText.stop", "callText.finalText", "transcript.close"]
    default: []
    }
}

private func nextState(
    _ iterator: inout AsyncStream<SessionState>.AsyncIterator,
    matching: (SessionState) -> Bool
) async throws -> SessionState {

    while let state = await iterator.next() {
        if matching(state) { return state }
    }
    throw TestFailure()
}

private func end(_ rig: Rig) async {

    rig.session.send(.end)
    _ = await rig.waitFor { $0.phase == .ended }
    await rig.session.end()
}
