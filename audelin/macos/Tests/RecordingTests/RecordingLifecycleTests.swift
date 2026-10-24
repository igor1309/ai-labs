import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingLifecycleTests {

    @Test(arguments: [false, true])
    func callJoiningManualRecordingKeepsItsOrigin(_ ready: Bool) async throws {

        try await withRecording { rig in
            try await rig.start(.hand, ready: ready)
            let before = await rig.recording.snapshot()
            rig.recording.send(.callStarted)
            let after = await rig.recording.snapshot()
            #expect(after.callOn)
            #expect(after.session == before.session)
            #expect(after.phase == before.phase)
            #expect(await rig.session.values() == [.begin(1)])
        }
    }

    @Test func lateBeginAndFailureReportsCannotChangeTheNextSession() async throws {

        try await withRecording { rig in
            try await rig.start(.hand, ready: false)
            try await rig.stop()
            _ = try await rig.finish()
            try await rig.start(.hand, id: 2)
            let before = await rig.recording.snapshot()
            await rig.session.comeUp(1)
            await rig.settleEffects()
            rig.recording.send(.sessionReported(id: 1, .cannotRecord("late failure")))
            rig.recording.send(.sessionReported(id: 1, .ended))
            #expect(await rig.recording.snapshot() == before)
            #expect(await rig.session.values() == [.begin(1), .end(1), .begin(2)])
        }
    }

    @Test func lateReadyWhileEndingCannotRestoreRecording() async throws {

        try await withRecording { rig in
            try await rig.start(.hand, ready: false)
            try await rig.stop()
            let before = await rig.recording.snapshot()
            rig.recording.send(.sessionReported(id: 1, .ready))
            rig.recording.send(.userStart)
            rig.recording.send(.userStop)
            #expect(await rig.recording.snapshot() == before)
            #expect(await rig.session.values() == [.begin(1), .end(1)])
            _ = try await rig.finish()
        }
    }

    @Test(arguments: RecordingCondition.allCases)
    func deferredCallRechecksConditionsBeforeBeginning(_ condition: RecordingCondition) async throws {

        try await withRecording { rig in
            try await rig.start(.hand)
            try await rig.stop()
            rig.recording.send(.callStarted)
            rig.recording.send(.conditionChanged(condition, available: false))
            #expect(await rig.recording.snapshot().pendingCall)
            let idle = try await rig.finish()
            #expect(idle.missing == [condition])
            #expect(await rig.session.values() == [.begin(1), .end(1)])
        }
    }

    @Test func disablingAutomaticRecordingCancelsDeferredCall() async throws {

        try await withRecording { rig in
            try await rig.start(.hand)
            try await rig.stop()
            rig.recording.send(.callStarted)
            rig.recording.send(.automaticChanged(false))
            #expect(!(await rig.recording.snapshot().automatic))
            let idle = try await rig.finish()
            #expect(idle.callOn)
            #expect(await rig.session.values() == [.begin(1), .end(1)])
        }
    }

    @Test func stoppingDeferredCallHoldsItUntilCallEnds() async throws {

        try await withRecording { rig in
            try await rig.start(.hand)
            try await rig.stop()
            rig.recording.send(.callStarted)
            rig.recording.send(.userStop)
            #expect(await rig.recording.snapshot().heldForCall)
            _ = try await rig.finish()
            rig.recording.send(.callStarted)
            #expect(await rig.recording.snapshot().phase == .idle)
            #expect(await rig.session.values() == [.begin(1), .end(1)])
        }
    }

    @Test func duplicateCallEndDoesNotStopAnUnrelatedManualRecording() async throws {

        try await withRecording { rig in
            try await rig.start(.call)
            try await rig.stop(.callEnded)
            _ = try await rig.finish()
            try await rig.start(.hand, id: 2)
            let before = await rig.recording.snapshot()
            rig.recording.send(.callEnded)
            #expect(await rig.recording.snapshot() == before)
            #expect(await rig.session.values() == [.begin(1), .end(1), .begin(2)])
        }
    }

    @Test(arguments: [RecordingCondition.callsFolder, .room])
    func storageLossWhileBeginningEndsSession(_ condition: RecordingCondition) async throws {

        try await withRecording { rig in
            try await rig.start(.hand, ready: false)
            try await rig.stop(.conditionChanged(condition, available: false))
            let idle = try await rig.finish()
            #expect(idle.missing == [condition])
            #expect(await rig.session.values() == [.begin(1), .end(1)])
        }
    }

    @Test func failedCallIsNotAutomaticallyBegunAgain() async throws {

        try await withRecording { rig in
            try await rig.start(.call)
            await rig.session.fail(1, reason: "no recording possible")
            try await rig.session.waitFor(.end(1))
            let idle = try await rig.finish()
            #expect(idle.callOn)
            #expect(idle.cannotRecord == "no recording possible")
            rig.recording.send(.callStarted)
            #expect(await rig.recording.snapshot() == idle)
            #expect(await rig.session.values() == [.begin(1), .end(1)])
        }
    }
}
