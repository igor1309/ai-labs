import Foundation
import Session
import Testing

@Suite(.timeLimit(.minutes(1)))
struct SessionTests {

    @Test func successfulFolderResultKeepsItsIdentityInState() {
        let folder = SessionCallFolder(id: "/calls/2026.10.24-1405 Zoom")
        let state = SessionState(phase: .bringingUp, folder: .starting)
        let (next, effect) = SessionReducer.reduce(state, .folderFinished(error: nil, folder: folder))
        #expect(next.recordedFolder == folder)
        #expect(next.folder == .up)
        #expect(effect == .selectProcesses)
        let (failed, _) = SessionReducer.reduce(state, .folderFinished(error: "denied"))
        #expect(failed.recordedFolder == nil)
    }

    @Test func bothSidesComeUpInDestinationOrder() async throws {

        let rig = await Rig()
        await rig.begin(liveText: true)
        let recording = await rig.waitFor { $0.phase == .recording }
        #expect(recording.microphoneCapture == .up)
        #expect(recording.callCapture == .up)
        #expect(await rig.output.values() == [
            "folder.create", "processes.select", "microphone.track.open", "call.track.open",
            "transcript.open", "callText.start(on)", "call.text", "microphone.capture.start",
            "microphone.audio", "call.capture.start", "call.audio"
        ])
        #expect(await rig.output.selection(for: "microphone") == nil)
        #expect(await rig.output.selection(for: "call") == .chosen(.init(id: "chosen-app")))
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        #expect(await rig.transcript.values() == ["callText-first"])
        await end(rig)
    }

    @Test(arguments: ["first-call", "another-call"])
    func everyFileOpensInTheFolderReturnedByCreate(id: String) async {

        let folder = SessionCallFolder(id: id)
        let rig = await Rig(callFolder: folder)
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        #expect(await rig.microphoneTrack.receivedFolders == [folder])
        #expect(await rig.callTrack.receivedFolders == [folder])
        #expect(await rig.transcript.receivedFolders == [folder])
        await end(rig)
    }

    @Test func endingKeepsAllOutputAndStopsSourcesFirst() async throws {

        let rig = await Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.callText.speak("finishing text")
        await rig.session.send(.end)
        _ = await rig.waitFor { $0.phase == .ended }
        let output = await rig.output.values()
        #expect(output.contains("callText.text(finishing text)"))
        #expect(output.firstIndex(of: "microphone.capture.stop")! < output.firstIndex(of: "microphone.track.close")!)
        #expect(output.firstIndex(of: "call.capture.stop")! < output.firstIndex(of: "call.track.close")!)
        #expect(output.last == "transcript.close")
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        #expect(await rig.transcript.values() == ["callText-first", "finishing text", "finishing text"])
        #expect(output.contains("callText.stop"))
    }

    @Test(arguments: [
        "folder.create", "processes.select", "microphone.track.open", "call.track.open",
        "transcript.open", "callText.start(on)", "microphone.capture.start", "call.capture.start"
    ])
    func endingDuringBringUpDoesNotStartLaterPieces(_ held: String) async throws {

        let rig = await Rig(held: [held])
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld(held)
        await rig.session.send(.end)
        await rig.output.release(held)
        _ = await rig.waitFor { $0.phase == .ended }
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
    }

    @Test func aCaptureThatComesUpAfterEndIsStoppedBeforeEnded() async throws {

        let held = "call.capture.start"
        let rig = await Rig(held: [held, "microphone.capture.stop"])
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld(held)
        await rig.session.send(.end)
        await rig.output.release(held)
        await rig.output.waitUntilHeld("microphone.capture.stop")
        let ending = await rig.waitFor { $0.phase == .ending && $0.microphoneCapture == .stopping }
        #expect(ending.callCapture == .up)
        await rig.output.release("microphone.capture.stop")
        _ = await rig.waitFor { $0.phase == .ended }
        let output = await rig.output.values()
        #expect(output.contains("call.capture.start"))
        #expect(output.contains("call.capture.stop"))
        #expect(output.firstIndex(of: "call.capture.start")! < output.firstIndex(of: "call.capture.stop")!)
    }

    @Test func shutdownWaitsForStartsAndStopsBeforeClosingTracks() async throws {

        let rig = await Rig(held: ["call.capture.start", "microphone.capture.stop"])
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld("call.capture.start")
        await rig.session.send(.end)
        let starting = await rig.waitFor { $0.phase == .ending }
        #expect(starting.phase == .ending)
        #expect(starting.callCapture == .starting)
        #expect(starting.microphoneCapture == .up)
        #expect(!(await rig.output.values()).contains("microphone.capture.stop"))
        await rig.output.release("call.capture.start")
        await rig.output.waitUntilHeld("microphone.capture.stop")
        let stopping = await rig.waitFor { $0.microphoneCapture == .stopping }
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
    }

    @Test(arguments: [
        "folder", "processes", "microphone.track", "call.track", "transcript", "callText",
        "microphone.capture", "call.capture", "microphone.access", "call.access"
    ])
    func healthChangesDuringStartDoNotErasePendingWork(_ caseName: String) async throws {

        let label = startLabel(for: caseName)
        let rig = await Rig(held: [label])
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld(label)
        let failure = runtimeFailure(for: caseName)
        await rig.session.send(failure.event)
        await rig.session.send(.end)
        let pending = await rig.waitFor { $0.phase == .ending && $0.failures.contains(failure.expected) }
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
    }

    @Test(arguments: [
        "microphone.capture.stop", "call.capture.stop", "microphone.track.close",
        "call.track.close", "callText.stop", "transcript.close",
        "microphone.access", "call.access"
    ])
    func healthChangesDuringStopDoNotErasePendingWork(_ caseName: String) async throws {

        let label = caseName.hasSuffix("access") ? caseName.replacingOccurrences(of: "access", with: "capture.stop") : caseName
        let rig = await Rig(held: [label])
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.session.send(.end)
        await rig.output.waitUntilHeld(label)
        let failure = runtimeFailure(for: caseName.replacingOccurrences(of: ".stop", with: "").replacingOccurrences(of: ".close", with: ""))
        await rig.session.send(failure.event)
        let pending = await rig.waitFor { $0.failures.contains(failure.expected) }
        #expect(pending.phase == .ending)
        #expect(pending.lifecycles.contains(.stopping))
        #expect(pending.failures.contains(failure.expected))
        #expect(await rig.output.values().last == label)
        await rig.output.release(label)
        let ended = await rig.waitFor { $0.phase == .ended }
        #expect(ended.lifecycles.allSatisfy { $0 == .closed || $0 == .down })
        #expect(ended.failures.contains(failure.expected))
    }

    @Test(arguments: [["Parakeet v3"], ["Parakeet v3", "Nemotron"]])
    func missingModelSaysCannotRecordAndStartsNothing(missing: [String]) async throws {

        let rig = await Rig(missingModels: missing)
        await rig.begin(liveText: true)
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "model: \(missing.joined(separator: ", ")) not on disk")
        #expect(state.phase == .bringingUp)
        #expect(state.folder == .down)
        #expect(await rig.output.values() == [])
        await end(rig)
    }

    @Test func endDuringModelCheckStaysEnded() {

        let (checking, check) = SessionReducer.reduce(SessionState(), .begin(liveText: false))
        #expect(check == .checkModels)
        let (ended, _) = SessionReducer.reduce(checking, .end)
        #expect(ended.phase == .ended)
        let (after, effect) = SessionReducer.reduce(ended, .modelsChecked(missing: []))
        #expect(after == ended)
        #expect(effect == nil)
    }

    @Test func folderFailureSaysCannotRecordAndWaitsForEnd() async throws {

        let rig = await Rig(failing: ["folder.create"])
        await rig.begin(liveText: true)
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "folder: folder.create failed")
        #expect(state.phase == .bringingUp)
        #expect(await rig.output.values() == ["folder.create"])
        await end(rig)
    }

    @Test func folderFailureAlreadyInFlightStillSettlesAfterEnd() async throws {

        let rig = await Rig(held: ["folder.create"], failing: ["folder.create"])
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld("folder.create")
        await rig.session.send(.end)
        await rig.output.release("folder.create")
        let state = await rig.waitFor { $0.phase == .ended }
        #expect(state.cannotRecord != nil)
    }

    @Test func bothCaptureFailuresSayCannotRecord() async throws {

        let rig = await Rig(failing: ["microphone.capture.start", "call.capture.start"])
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

        let rig = await Rig(failing: ["microphone.track.open", "call.track.open"])
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

        let rig = await Rig(failing: ["call.track.open"])
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

        let rig = await Rig(failing: [failing])
        await rig.begin(liveText: true)
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(state.failures.contains(.init(piece: bringUpFailurePiece(failing), message: "\(failing) failed")))
        let piece = String(failing.prefix { $0 != "(" }.split(separator: ".").dropLast().joined(separator: "."))
        await expectTracksKeepRecording(rig, "after", on: survivingSides(for: piece))
        await rig.callText.speak("after")
        let textSurvives = !failing.hasPrefix("transcript") && !failing.hasPrefix("callText")
        #expect(await rig.transcript.values().contains("after") == textSurvives)
        await end(rig)
    }

    @Test func lostAccessIsNamedWhileTheOtherSideRecords() async throws {

        let rig = await Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.session.send(.accessChanged(.microphone, available: false))
        let state = await rig.waitFor { $0.failures.contains { $0.piece == "microphone access" } }
        #expect(state.callCapture == .up)
        #expect(state.microphoneCapture == .up)
        await end(rig)
        let output = await rig.output.values()
        #expect(output.firstIndex(of: "microphone.capture.stop")! < output.firstIndex(of: "microphone.track.close")!)
        #expect((await rig.waitFor { $0.phase == .ended }).microphoneCapture == .closed)
    }

    @Test func runtimeFailureKeepsOtherSideAndNamesThePiece() async throws {

        let rig = await Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.microphoneCapture.sendAudio("before-failure")
        await rig.session.send(.pieceFailed(.capture(.microphone), error: "device stopped"))
        let state = await rig.waitFor { $0.failures.contains { $0.piece == "microphone capture" } }
        #expect(state.health[.capture(.microphone)] == .failed("device stopped"))
        #expect(state.callCapture == .up)
        #expect(state.phase == .recording)
        #expect(await rig.microphoneTrack.values() == ["microphone-first", "before-failure"])
        await end(rig)
    }

    @Test(arguments: [SessionSide.microphone, SessionSide.call])
    func runtimeTrackFailureAndAccessLossSaysCannotRecord(_ failedTrack: SessionSide) async throws {

        let rig = await Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        let lostAccess = failedTrack == .microphone ? SessionSide.call : .microphone
        await rig.session.send(.pieceFailed(.track(failedTrack), error: "disk stopped"))
        await rig.session.send(.accessChanged(lostAccess, available: false))
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

        let rig = await Rig(held: ["folder.create"])
        await rig.begin(liveText: true)
        await rig.output.waitUntilHeld("folder.create")
        await rig.session.send(.accessChanged(side, available: false))
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

        let rig = await Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.session.send(.pieceFailed(.capture(.microphone), error: "microphone stopped"))
        await rig.session.send(.pieceFailed(.capture(.call), error: "call stopped"))
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

        let rig = await Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.microphoneCapture.sendAudio("microphone kept")
        await rig.callCapture.sendAudio("call kept")
        await rig.session.send(.pieceFailed(.track(.microphone), error: "microphone disk failed"))
        await rig.session.send(.pieceFailed(.track(.call), error: "call disk failed"))
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

    @Test(arguments: [SessionSide.microphone, .call])
    func failedCaptureStreamStopsItsSide(_ side: SessionSide) {

        let other: SessionSide = side == .microphone ? .call : .microphone
        var state = SessionState(
            phase: .recording,
            folder: .up,
            microphoneTrack: .up,
            callTrack: .up,
            microphoneCapture: .up,
            callCapture: .up
        )
        let effect: SessionEffect?
        (state, effect) = SessionReducer.reduce(state, .pieceFailed(.capture(side), error: "stream failed"))
        #expect(state.health[.capture(side)] == .failed("stream failed"))
        #expect(status(state, side) == .stopping)
        #expect(status(state, other) == .up)
        #expect(effect == .stopCapture(side))
        (state, _) = SessionReducer.reduce(state, .captureStopped(side, error: nil))
        #expect(status(state, side) == .closed)
        #expect(state.phase == .recording)
        var ending: SessionEffect?
        (state, ending) = SessionReducer.reduce(state, .end)
        #expect(ending == .stopCapture(other))
    }

    @Test(arguments: [SessionSide.microphone, .call])
    func captureStreamEndingAfterStopChangesNoHealth(_ side: SessionSide) {

        var state = SessionState(
            phase: .ending,
            folder: .up,
            microphoneTrack: .up,
            callTrack: .up,
            microphoneCapture: side == .microphone ? .stopping : .closed,
            callCapture: side == .call ? .stopping : .closed
        )
        (state, _) = SessionReducer.reduce(state, .captureStopped(side, error: nil))
        #expect(state.health.isEmpty)
        #expect(state.failures.isEmpty)
        #expect(status(state, side) == .closed)
    }

    private func status(_ state: SessionState, _ side: SessionSide) -> SessionState.PieceStatus {

        side == .microphone ? state.microphoneCapture : state.callCapture
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

        let rig = await Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.session.send(.pieceFailed(.folder, error: "folder stopped"))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "folder: folder stopped")
        #expect(state.health[.folder] == .failed("folder stopped"))
        #expect(state.failures.contains(SessionFailure(piece: "folder", message: "folder stopped")))
        await end(rig)
    }

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

    @Test(arguments: [
        "folder", "processes", "microphone.track", "call.track", "transcript",
        "callText", "microphone.capture", "call.capture", "microphone.access", "call.access"
    ])
    func runtimeFailureMatrixRunsThroughSession(_ caseName: String) async throws {

        let rig = await Rig()
        await rig.begin(liveText: true)
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.microphoneCapture.sendAudio("microphone before")
        await rig.callCapture.sendAudio("call before")
        await rig.callText.speak("text before")
        let failure = runtimeFailure(for: caseName)
        await rig.session.send(failure.event)
        let state = await rig.waitFor { $0.failures.contains(failure.expected) && !$0.lifecycles.contains(.stopping) }
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
        // A failed capture is stopped; every other piece stays up.
        if case let .pieceFailed(.capture(side), _) = failure.event {
            #expect(status(state, side) == .closed)
            #expect(state.lifecycles.filter { $0 != .up } == [.closed])
        } else {
            #expect(state.lifecycles.allSatisfy { $0 == .up })
        }
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
