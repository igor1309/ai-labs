@testable import Compose
import struct CallText.State
import Foundation
import MenuBar
import PanelUI
import Preferences
import Recording
import Testing

@MainActor
struct PanelWindowWiringTests {

    @Test func recordingMenuAndPanelPortsCarryStateActionsDelayAndLogs() async throws {

        for origin: RecordingState.Origin in [.call, .hand] {
            let recording = AsyncStream<RecordingState>.makeStream()
            let failures = AsyncStream<any Error>.makeStream()
            let panel = AsyncStream<PanelState>.makeStream()
            let delivered = Signal(), visibilityDelivered = Signal(), timerStarted = Signal(), fireTimer = Signal()
            let waits = Values<Duration>()
            let sink = PanelLogSpy()
            var visibility: [Bool] = [], events: [RecordingEvent] = [], panelEvents: [PanelEvent] = []
            defer {
                recording.continuation.finish(); failures.continuation.finish(); panel.continuation.finish()
                delivered.end(); visibilityDelivered.end(); timerStarted.end(); fireTimer.end()
            }
            let menu = await AudelinMenu(storage: PanelPreferences(), makeApplication: {
                MenuApplication(states: { recording.stream }, failures: failures.stream,
                    send: { events.append($0) }, quit: {}, panelStates: { panel.stream },
                    sendPanel: { panelEvents.append($0) })
            }, openFolder: { _ in }, terminate: {}, didDeliver: { delivered.send() }, sink: sink,
                presentPanel: { visibility.append($0); visibilityDelivered.send() }, sleep: { duration in
                    waits.append(duration)
                    timerStarted.send()
                    await fireTimer.next()
                })
            var state = RecordingState()
            state.phase = .beginning
            state.session = .init(id: 1, origin: origin)
            recording.continuation.yield(state)
            await delivered.next()
            await visibilityDelivered.next()
            #expect(visibility == [true])
            menu.panelClosed()
            await visibilityDelivered.next()
            state.phase = .recording
            recording.continuation.yield(state)
            await delivered.next()
            #expect(visibility == [true, false])
            let reopen = try #require(menu.menu.entries.first { $0 == .button("Показать панель", .showPanel) })
            guard case let .button(_, action) = reopen else { return }
            await menu.perform(action)
            await visibilityDelivered.next()
            #expect(visibility == [true, false, true])
            #expect(!menu.menu.entries.contains(.button("Показать панель", .showPanel)))

            let held = PanelState.Held(entryID: 9, text: "held")
            let readingEvents: [PanelEvent] = [.switchLiveTextOn, .hold(held), .letGo(held),
                                              .scrolled(atBottom: false), .jumpToLive]
            await menu.sendPanel(.start)
            await menu.sendPanel(.stop)
            for event in readingEvents { await menu.sendPanel(event) }
            #expect(events == [.userStart, .userStop])
            #expect(panelEvents == readingEvents)
            let content = PanelState(recording: .on(elapsed: "00:02"), log: .liveTextOff(kept: nil))
            panel.continuation.yield(content)
            panel.continuation.finish()

            state.phase = .ending
            recording.continuation.yield(state)
            await delivered.next()
            await timerStarted.next()
            #expect(waits.all == [.seconds(3)])
            #expect(menu.panelPresence.visible)
            fireTimer.send()
            await visibilityDelivered.next()
            #expect(!menu.panelPresence.visible)
            #expect(visibility == [true, false, true, false])
            recording.continuation.finish()
            failures.continuation.finish()
            await menu.waitForObservers()
            #expect(menu.panelState == content)
            #expect(sink.entries.all.filter { $0.category == .panel }.map(\.message) == [
                "shown reason=recordingBegan", "hidden reason=userClosed",
                "shown reason=menuReopen", "hidden reason=recordingEnded",
            ])
        }
    }

    @Test func panelLiveTextControlReachesOnlyItsCurrentSession() async {

        let panel = ReadingClockSpy().panel()
        let text = AsyncStream<State>.makeStream()
        let enabled = Values<Int>()
        let reading = await panel.begin(id: 1, text: text.stream, enableLiveText: { enabled.append(1) })
        await panel.send(.switchLiveTextOn)
        #expect(enabled.all == [1])
        await panel.end(id: 1)
        await panel.send(.switchLiveTextOn)
        #expect(enabled.all == [1])
        text.continuation.finish()
        await reading.end()
    }
}

private struct PanelPreferences: PreferenceSettingsStorage {
    func read() -> Preferences { .init() }
    func write(_ preferences: Preferences) throws { Issue.record("Panel actions do not write preferences") }
}

private struct PanelLogSpy: LogSink {
    let entries = Values<LogEntry>()
    func write(_ entry: LogEntry) { entries.append(entry) }
}
