import MenuBar
import Testing

struct PanelPresenceTests {

    @Test func endingKeepsVisibleUntilThreeSecondDelayElapses() throws {

        let (shown, _) = PanelPresence.reduce(.init(), .recordingChanged(1))
        let (ending, effects) = PanelPresence.reduce(shown, .recordingChanged(nil))
        #expect(ending.visible)
        #expect(!ending.offersReopen)
        guard case let .hideAfter(seconds, generation) = try #require(effects.last) else {
            Issue.record("Ending must request a delayed hide")
            return
        }
        #expect(seconds == 3)
        #expect(PanelPresence.reduce(ending, .recordingChanged(nil)).1.isEmpty)
        let (hidden, hiddenEffects) = PanelPresence.reduce(ending, .delayElapsed(generation))
        #expect(!hidden.visible)
        #expect(hiddenEffects == [.hide(.recordingEnded)])
        #expect(PanelPresence.reduce(hidden, .delayElapsed(generation)).1.isEmpty)
    }

    @Test func newRecordingInvalidatesEarlierDelaysEvenAfterItEnds() throws {

        let (shown, _) = PanelPresence.reduce(.init(), .recordingChanged(1))
        let (ending, effects) = PanelPresence.reduce(shown, .recordingChanged(nil))
        guard case let .hideAfter(_, generation) = try #require(effects.last) else {
            Issue.record("Ending must request a delayed hide")
            return
        }
        let (restarted, restartedEffects) = PanelPresence.reduce(ending, .recordingChanged(2))
        #expect(restarted.visible)
        #expect(restartedEffects == [.cancelDelay])
        #expect(PanelPresence.reduce(restarted, .delayElapsed(generation)).0 == restarted)
        let (endingAgain, _) = PanelPresence.reduce(restarted, .recordingChanged(nil))
        #expect(PanelPresence.reduce(endingAgain, .delayElapsed(generation)).0 == endingAgain)
    }

    @Test func userCloseLastsUntilMenuReopenOrNextRecording() {

        let (shown, shownEffects) = PanelPresence.reduce(.init(), .recordingChanged(1))
        #expect(shown.visible)
        #expect(shown.recordingID == 1)
        #expect(shownEffects == [.cancelDelay, .show(.recordingBegan)])
        #expect(PanelPresence.reduce(shown, .recordingChanged(1)).1.isEmpty)
        let (closed, effects) = PanelPresence.reduce(shown, .userClosed)
        let (repeated, _) = PanelPresence.reduce(closed, .recordingChanged(1))
        #expect(!repeated.visible)
        #expect(!closed.visible)
        #expect(closed.offersReopen)
        #expect(effects == [.cancelDelay, .hide(.userClosed)])
        let (reopened, reopenEffects) = PanelPresence.reduce(closed, .reopen)
        #expect(reopened.visible)
        #expect(reopenEffects == [.show(.menuReopen)])
        #expect(PanelPresence.reduce(reopened, .reopen).1.isEmpty)
        let (ended, endEffects) = PanelPresence.reduce(closed, .recordingChanged(nil))
        #expect(!ended.visible)
        #expect(endEffects == [.cancelDelay])
        #expect(PanelPresence.reduce(ended, .reopen).0 == ended)
        let (next, nextEffects) = PanelPresence.reduce(ended, .recordingChanged(2))
        #expect(next.visible)
        #expect(nextEffects == [.cancelDelay, .show(.recordingBegan)])
    }

    @Test func menuOffersReopenOnlyDuringARecordingWithHiddenPanel() {

        let initial = PanelPresence()
        let (shown, _) = PanelPresence.reduce(initial, .recordingChanged(1))
        let (hidden, _) = PanelPresence.reduce(shown, .userClosed)
        let (ended, _) = PanelPresence.reduce(hidden, .recordingChanged(nil))
        let (reopened, _) = PanelPresence.reduce(hidden, .reopen)
        for (presence, offers): (PanelPresence, Bool) in [
            (initial, false), (shown, false), (hidden, true), (ended, false), (reopened, false),
        ] {
            #expect(presence.offersReopen == offers)
            for recording: MenuBarRecording in [
                .idle(automatic: true, unavailable: [], failure: nil),
                .recording(call: true), .recording(call: false), .ending,
            ] {
                let menu = MenuBarModel(recording: recording,
                    preferences: .init(automatic: true, liveText: true),
                    offersPanelReopen: presence.offersReopen)
                let active = if case .recording = recording { true } else { false }
                #expect(menu.entries.contains(.button("Показать панель", .showPanel)) == (active && offers))
            }
        }
    }
}
