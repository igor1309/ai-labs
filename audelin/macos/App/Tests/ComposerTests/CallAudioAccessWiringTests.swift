import Composer
import Synchronization
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CallAudioAccessWiringTests {
    @Test func cleanupCompletesBeforeSessionStarts() async throws {
        let reserve = DrainGate(), events = Values<String>()
        defer { reserve.release() }
        try await withComposition(configure: { boundary in
            boundary.access = ComposerAccess(refresh: { true }, reserve: {
                await reserve.wait(); events.append("probe cleanup"); return true
            }, release: { events.append("released") }, states: { AsyncStream { $0.yield(true); $0.finish() } }, invalidate: {})
            let microphone = boundary.microphone
            boundary.microphone = FixtureMicrophone(begin: {
                events.append("session begin"); return try await microphone.start()
            })
        }) { rig in
            await rig.menu.perform(.start)
            await reserve.waitUntilEntered()
            #expect(events.all.isEmpty)
            #expect(rig.microphone.starts.all.isEmpty && rig.call.starts.all.isEmpty)
            reserve.release()
            _ = try await rig.state { $0.phase == .recording }
            #expect(events.all == ["probe cleanup", "session begin"])
            try await rig.stop()
            #expect(events.all == ["probe cleanup", "session begin", "released"])
        }
    }

    @Test(arguments: [false, true])
    func unavailableAccessBlocksBothStartOrigins(automatic: Bool) async throws {
        let reservations = Values<Bool>()
        try await withComposition(preferences: { .init(automaticRecording: automatic, liveText: false, callsFolder: $0) },
            configure: { boundary in
                boundary.processes = FixtureProcesses(binding: CallBinding(fails: false, input: automatic))
                boundary.access = ComposerAccess(refresh: { false }, reserve: { reservations.append(true); return false },
                    release: {}, states: { AsyncStream { $0.yield(false); $0.finish() } }, invalidate: {})
            }) { rig in
                if automatic { _ = try await rig.state { $0.callOn } }
                else { await rig.menu.perform(.start) }
                let state = try await rig.state { $0.phase == .idle }
                #expect(state.missing == [.callAudioAccess])
                #expect(state.session == nil)
                #expect(rig.microphone.starts.all.isEmpty && rig.call.starts.all.isEmpty)
                #expect(reservations.all.isEmpty)
            }
    }

    @Test func deferredStartRechecksEvidenceAfterCaptureCleanup() async throws {
        let stopping = DrainGate(), reservations = Values<Bool>(), events = Values<String>()
        let binding = CallBinding(fails: false, input: false)
        defer { stopping.release() }
        try await withComposition(preferences: { .init(automaticRecording: true, liveText: false, callsFolder: $0) },
            configure: { boundary in
                boundary.processes = FixtureProcesses(binding: binding)
                boundary.access = ComposerAccess(refresh: { true }, reserve: {
                    reservations.append(true); events.append("reserve"); return reservations.all.count == 1
                }, release: { events.append("released") }, states: { AsyncStream { $0.yield(true); $0.finish() } }, invalidate: {})
                let microphone = boundary.microphone
                boundary.microphone = FixtureMicrophone(begin: {
                    let capture = try await microphone.start()
                    return StartedCapture(stream: capture.stream, stop: {
                        await stopping.wait(); try await capture.stop(); events.append("capture cleanup")
                    })
                })
            }) { rig in
                try await rig.start()
                await rig.menu.perform(.stop)
                await stopping.waitUntilEntered()
                binding.setInput(true)
                _ = try await rig.state { $0.pendingCall }
                #expect(reservations.all.count == 1)
                stopping.release()
                let blocked = try await rig.state { $0.phase == .idle && $0.missing.contains(.callAudioAccess) }
                #expect(blocked.lastSessionID == 2)
                #expect(events.all == ["reserve", "capture cleanup", "released", "reserve", "released"])
                #expect(rig.microphone.starts.all == [true])
            }
    }
}
