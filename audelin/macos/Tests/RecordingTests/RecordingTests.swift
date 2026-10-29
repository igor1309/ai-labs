import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingTests {

    @Test(arguments: RecordingFault.allCases)
    func sessionFaultsStayNamedUntilTheNextRecording(_ fault: RecordingFault) async throws {

        try await withRecording { rig in
            try await rig.start(.call)
            await rig.recording.send(.sessionReported(id: 1, .failed(fault)))
            await rig.recording.send(.sessionReported(id: 1, .failed(fault)))
            await rig.recording.send(.sessionReported(id: 1, .failed(.diskFull)))
            let faulted = await rig.recording.snapshot()
            #expect(faulted.phase == .recording)
            #expect(faulted.faults == [fault, .diskFull])
            #expect(await rig.session.values() == [.begin(1)])
            try await rig.stop()
            #expect(await rig.recording.snapshot().faults == [fault, .diskFull])
            let ended = try await rig.finish()
            #expect(ended.faults == [fault, .diskFull])
            try await rig.start(.hand, id: 2)
            await rig.recording.send(.sessionReported(id: 1, .failed(fault)))
            #expect(await rig.recording.snapshot().faults.isEmpty)
            #expect(await rig.session.values() == [.begin(1), .end(1), .begin(2)])
        }
    }


    @Test func callBeginsAutomaticRecording() async throws {

        try await withRecording { rig in
            try await rig.start(.call)
            let state = await rig.recording.snapshot()
            #expect(state.phase == .recording)
            #expect(state.session == .init(id: 1, origin: .call))
            #expect(await rig.session.values() == [.begin(1)])
        }
    }

    @Test func automaticOffDoesNotBeginRecording() async throws {

        try await withRecording(automatic: false) { rig in
            await rig.recording.send(.callStarted)
            let state = await rig.recording.snapshot()
            #expect(state.phase == .idle)
            #expect(state.callOn)
            #expect(await rig.session.values().isEmpty)
        }
    }

    @Test func userBeginsRecordingWithoutCall() async throws {

        try await withRecording(automatic: false) { rig in
            try await rig.start(.hand)
            let state = await rig.recording.snapshot()
            #expect(state.session == .init(id: 1, origin: .hand))
            #expect(!state.callOn)
            #expect(await rig.session.values() == [.begin(1)])
        }
    }

    @Test func userEndsRecordingAfterSessionEnds() async throws {

        try await withRecording { rig in
            try await rig.start(.hand)
            try await rig.stop()
            #expect(await rig.recording.snapshot().session == .init(id: 1, origin: .hand))
            let state = try await rig.finish()
            #expect(state.session == nil)
            #expect(await rig.session.values() == [.begin(1), .end(1)])
        }
    }

    @Test(arguments: [RecordingState.Origin.call, .hand], [false, true])
    func callEndEndsRecordingBegunDuringCall(_ origin: RecordingState.Origin, _ ready: Bool) async throws {

        try await withRecording(automatic: origin == .call) { rig in
            if origin == .hand { await rig.recording.send(.callStarted) }
            try await rig.start(origin, ready: ready)
            let begun = await rig.recording.snapshot()
            #expect(begun.callOn)
            #expect(begun.session == .init(id: 1, origin: origin))
            try await rig.stop(.callEnded)
            let state = try await rig.finish()
            #expect(!state.callOn)
            #expect(state.session == nil)
            #expect(await rig.session.values() == [.begin(1), .end(1)])
        }
    }

    @Test func stoppedCallWaitsForANewCall() async throws {

        try await withRecording { rig in
            try await rig.start(.call)
            try await rig.stop()
            _ = try await rig.finish()
            await rig.recording.send(.callStarted)
            await rig.recording.send(.automaticChanged(false))
            await rig.recording.send(.automaticChanged(true))
            let held = await rig.recording.snapshot()
            #expect(held.phase == .idle)
            #expect(held.heldForCall)
            #expect(await rig.session.values() == [.begin(1), .end(1)])
            await rig.recording.send(.callEnded)
            try await rig.start(.call, id: 2)
            #expect(await rig.session.values() == [.begin(1), .end(1), .begin(2)])
        }
    }

    @Test(arguments: [false, true], [false, true])
    func repeatedStartsKeepTheSameRecording(_ ready: Bool, _ callStart: Bool) async throws {

        try await withRecording { rig in
            try await rig.start(.call, ready: ready)
            let before = await rig.recording.snapshot()
            await rig.recording.send(callStart ? .callStarted : .userStart)
            #expect(await rig.recording.snapshot() == before)
            #expect(await rig.session.values() == [.begin(1)])
        }
    }

    @Test func callDuringEndingBeginsAfterSessionEnds() async throws {

        try await withRecording { rig in
            try await rig.start(.hand)
            try await rig.stop()
            await rig.recording.send(.callStarted)
            #expect(await rig.recording.snapshot().phase == .ending)
            #expect(await rig.session.values() == [.begin(1), .end(1)])
            await rig.session.finish(1)
            try await rig.session.waitFor(.begin(2))
            await rig.session.comeUp(2)
            let state = try await rig.waitFor { $0.phase == .recording }
            #expect(state.session == .init(id: 2, origin: .call))
            #expect(await rig.session.values() == [.begin(1), .end(1), .begin(2)])
        }
    }

    @Test(arguments: RecordingCondition.allCases, [false, true])
    func missingConditionHoldsStartBack(_ condition: RecordingCondition, _ callStart: Bool) async throws {

        try await withRecording(missing: [condition]) { rig in
            await rig.recording.send(callStart ? .callStarted : .userStart)
            if condition == .callAudioAccess {
                await rig.recording.waitForDelivery(of: .sessionReported(id: 1, .ended))
            }
            let state = await rig.recording.snapshot()
            #expect(state.phase == .idle)
            #expect(state.missing == [condition])
            #expect(state.session == nil)
            #expect(await rig.session.values().isEmpty)
        }
    }

    @Test(arguments: [false, true])
    func cannotRecordEndsSessionAndKeepsReasonUntilNextBegin(_ ready: Bool) async throws {

        try await withRecording { rig in
            try await rig.start(.hand, ready: ready)
            await rig.session.fail(1, reason: "no audio can be kept")
            try await rig.session.waitFor(.end(1))
            #expect(await rig.recording.snapshot().phase == .ending)
            let ended = try await rig.finish()
            #expect(ended.cannotRecord == "no audio can be kept")
            await rig.recording.send(.conditionChanged(.microphoneAccess, available: false))
            await rig.recording.send(.automaticChanged(false))
            await rig.session.switchLiveText(true)
            #expect(await rig.recording.snapshot().cannotRecord == "no audio can be kept")
            await rig.recording.send(.conditionChanged(.microphoneAccess, available: true))
            try await rig.start(.hand, id: 2)
            #expect(await rig.recording.snapshot().cannotRecord == nil)
            #expect(await rig.session.values() == [.begin(1), .end(1), .begin(2)])
        }
    }

    @Test(arguments: [false, true])
    func stopDuringBeginningEndsSession(_ callEnd: Bool) async throws {

        try await withRecording { rig in
            try await rig.start(.call, ready: false)
            try await rig.stop(callEnd ? .callEnded : .userStop)
            let state = try await rig.finish()
            #expect(state.session == nil)
            #expect(await rig.session.values() == [.begin(1), .end(1)])
        }
    }

    @Test func callEndingDuringBringDownDoesNotBeginRecording() async throws {

        try await withRecording { rig in
            try await rig.start(.hand)
            try await rig.stop()
            await rig.recording.send(.callStarted)
            await rig.recording.send(.callEnded)
            #expect(await rig.recording.snapshot().phase == .ending)
            let state = try await rig.finish()
            #expect(!state.callOn)
            #expect(await rig.session.values() == [.begin(1), .end(1)])
        }
    }

    @Test(arguments: RecordingCondition.allCases)
    func folderOrRoomLossEndsRecordingButAccessLossDoesNot(_ condition: RecordingCondition) async throws {

        try await withRecording { rig in
            try await rig.start(.call)
            await rig.recording.send(.conditionChanged(condition, available: false))
            let state = await rig.recording.snapshot()
            #expect(state.missing == [condition])
            if condition == .callsFolder || condition == .room {
                try await rig.session.waitFor(.end(1))
                #expect(state.phase == .ending)
                let ended = try await rig.finish()
                #expect(ended.missing == [condition])
                #expect(await rig.session.values() == [.begin(1), .end(1)])
            } else {
                #expect(state.phase == .recording)
                #expect(await rig.session.values() == [.begin(1)])
            }
        }
    }

    @Test(arguments: RecordingCondition.allCases)
    func restoredConditionAllowsManualAndAutomaticStarts(_ condition: RecordingCondition) async throws {

        try await withRecording(missing: [condition]) { rig in
            await rig.recording.send(.conditionChanged(condition, available: true))
            try await rig.start(.hand)
            #expect(await rig.recording.snapshot().missing.isEmpty)
            try await rig.stop()
            _ = try await rig.finish()
            try await rig.start(.call, id: 2)
            #expect(await rig.recording.snapshot().session?.origin == .call)
            #expect(await rig.session.values() == [.begin(1), .end(1), .begin(2)])
            try await rig.stop(id: 2)
            #expect(await rig.recording.snapshot().session == .init(id: 2, origin: .call))
            #expect(await rig.session.values() == [.begin(1), .end(1), .begin(2), .end(2)])
            let ended = try await rig.finish(2)
            #expect(ended.phase == .idle)
            #expect(ended.session == nil)
        }
    }
}
