@testable import Composer
import CoreAudioProcesses
import Foundation
import Observation
import Preferences
import PanelUI
import Recording
import Synchronization
import Testing
@testable import Audelin

@Suite(.timeLimit(.minutes(1)))
@MainActor
struct MenuBarTests {

    @Test func applicationConnectsStartupAndStopsDetectionBeforeDraining() async throws {

        for failureAfterStartup in [false, true] {
            try await withComposeFolder { root in
                let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
                try preferences.write(Preferences(liveText: false, callsFolder: root))
                let binding = CallBinding(fails: false, input: false)
                let clock = QueuedCallClock()
                let checks = Values<String>(), events = Values<String>()
                let selections = Values<CaptureSelection>()
                let microphone = AsyncThrowingStream<CaptureBuffer, any Error>.makeStream()
                let call = AsyncThrowingStream<CaptureBuffer, any Error>.makeStream()
                let stopping = Signal(), release = Signal()
                let model = Task<Void, any Error> {}
                defer {
                    model.cancel(); stopping.end(); release.end()
                    microphone.continuation.finish(); call.continuation.finish()
                }
                let panelClock = ReadingClockSpy()
                let permissionRead = Signal()
                let boundary = ComposerBoundary(
                    capturePersistence: .recorded,
                    microphone: FixtureMicrophone(begin: {
                        events.append("microphone started")
                        return StartedCapture(stream: microphone.stream, stop: {
                            #expect(binding.activeListeners == 0)
                            #expect(!clock.active)
                            events.append("stopping")
                            stopping.send()
                            await release.next()
                            microphone.continuation.finish()
                        })
                    }),
                    callAudio: FixtureCallAudio(begin: { selection in
                        selections.append(selection)
                        return StartedCapture(stream: call.stream, stop: { call.continuation.finish() })
                    }),
                    recognizers: FixtureRecognizers(source: { _ in preconditionFailure("Live text is disabled") },
                        missing: { [] }, load: { events.append("model started"); return model }),
                    processes: FixtureProcesses(binding: binding),
                    access: ComposerAccess(refresh: { true }, reserve: { true }, release: {},
                        states: { AsyncStream { $0.yield(true); $0.finish() } }, invalidate: {}),
                    microphonePermission: FixturePermission(status: {
                        checks.append("microphone")
                        if checks.all.count == 2 { permissionRead.send() }
                        return true
                    }, prompt: {}),
                    capacity: FixtureCapacity(read: { folder in #expect(folder == root); return Int64.max }),
                    time: ComposerTime(now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt },
                        monotonicNow: panelClock.now, sleep: { _ in throw CancellationError() },
                        after: { delay, fire in
                            let token = clock.after(delay, fire)
                            return BoundaryCancellation { token.cancel() }
                        }, ticks: panelClock.ticks), log: TestLogSink(), intervals: testIntervals
                )
                let app = await compose(boundary: boundary, preferencesURL: root.appendingPathComponent("preferences.json"),
                    openCallsFolder: { _ in false }, presentCalls: {}, openURL: { _ in }, presentPanel: { _ in },
                    terminate: { events.append("terminated") })
                await permissionRead.next()
                permissionRead.end()
                var panelStates = await app.panelStates().makeAsyncIterator()
                #expect(await panelStates.next() == .init(recording: .off, log: .empty))
                let initial = await app.snapshot()
                #expect(initial.phase == .idle && initial.missing.isEmpty && initial.automatic)
                #expect(selections.all.isEmpty)
                #expect(binding.activeListeners == 2)
                #expect(events.all == ["model started"])

                if failureAfterStartup {
                    binding.fail()
                    for await state in Observations({ app.menu }) {
                        if state.entries.first == .stateLine("Наблюдение за звонками остановлено: failed") { break }
                    }
                    #expect(app.menu.entries.first == .stateLine("Наблюдение за звонками остановлено: failed"))
                    #expect(binding.activeListeners == 0)
                    #expect(await app.snapshot().phase == .idle)
                    await app.perform(.quit)
                    #expect(events.all == ["model started", "terminated"])
                    #expect(model.isCancelled)
                    return
                }

                binding.setInput(true)
                for await state in await app.states() {
                    if state.phase == .recording {
                        #expect(state.session == .init(id: 1, origin: .call))
                        break
                    }
                }
                var recordingPanel: PanelState?
                while let state = await panelStates.next() {
                    if state.recording == .on(elapsed: "00:00:00") {
                        recordingPanel = state
                        break
                    }
                }
                #expect(recordingPanel == .init(recording: .on(elapsed: "00:00:00"), log: .liveTextOff(kept: nil)))
                panelClock.advance(3)
                while let state = await panelStates.next() {
                    if state.recording == .on(elapsed: "00:00:03") { break }
                }
                #expect(selections.all == [.only([42])])
                // Starts consult the call-audio port; microphone status is read at launch.
                #expect(checks.all == ["microphone", "microphone", "microphone"])
                binding.setInput(false)
                #expect(clock.active)
                let lateNotifications = binding.queuedNotifications()
                let quit = Task { await app.perform(.quit) }
                await stopping.next()
                #expect(events.all == ["model started", "microphone started", "stopping"])
                clock.fireQueued()
                binding.setInput(true)
                lateNotifications.forEach { $0() }
                #expect(await app.snapshot().phase == .ending)
                release.send()
                await quit.value
                #expect(events.all == ["model started", "microphone started", "stopping", "terminated"])
                #expect(await app.snapshot().lastSessionID == 1)
                #expect(await app.snapshot().phase == .idle)
                var terminal = await app.panelStates().makeAsyncIterator()
                #expect(await terminal.next() == .init(recording: .off, log: .empty))
                #expect(model.isCancelled)
            }
        }
    }

}

private final class QueuedCallClock: CallClock {

    private struct State {

        var fire: (@Sendable () -> Void)?
        var active = false
    }
    private let state = Mutex(State())

    var active: Bool { state.withLock { $0.active } }

    func after(_ delay: Duration, _ fire: @escaping @Sendable () -> Void) -> Cancellation {

        #expect(delay == .seconds(30))
        state.withLock { $0.fire = fire; $0.active = true }
        return Cancellation { [weak self] in self?.state.withLock { $0.active = false } }
    }

    func fireQueued() {

        let fire = state.withLock { $0.fire }
        fire?()
    }
}

extension AudelinMenu {
    func snapshot() async -> RecordingState {
        for await state in await states() { return state }
        return self.state
    }
}
