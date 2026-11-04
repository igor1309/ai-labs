import MenuBar
import Testing

struct PanelPresenceTests {

    @Test func defaultStatePreservesInitialPresence() {

        let state = PanelPresence()
        #expect(state.recordingID == nil)
        #expect(!state.visible)
        #expect(state.generation == 0)
        #expect(!state.offersReopen)
    }

    @Test func everyStateFieldIsPubliclyConstructibleAndMutable() {

        var state = makePresence(recordingID: 7, visible: true, generation: 19, offersReopen: true)
        #expect(state.recordingID == 7)
        #expect(state.visible)
        #expect(state.generation == 19)
        #expect(state.offersReopen)

        state.recordingID = 8
        state.visible = false
        state.generation = 23
        state.offersReopen = false
        #expect(state.recordingID == 8)
        #expect(!state.visible)
        #expect(state.generation == 23)
        #expect(!state.offersReopen)
    }

    @Test func recordingBeginsOrReplacesTheCurrentRecording() {

        for (state, effects): (PanelPresence, [PanelPresence.Effect]) in [
            (makePresence(generation: 4), [.cancelDelay, .show(.recordingBegan)]),
            (makePresence(recordingID: 1, visible: true, generation: 5), [.cancelDelay]),
            (makePresence(recordingID: 1, generation: 6, offersReopen: true),
                [.cancelDelay, .show(.recordingBegan)]),
            (makePresence(visible: true, generation: 7), [.cancelDelay]),
        ] {
            assert(state, .recordingChanged(2)) {
                $0.recordingID = 2
                $0.visible = true
                $0.generation += 1
                $0.offersReopen = false
            }
            assert(state, .recordingChanged(2), delivers: effects)
        }
    }

    @Test func endingKeepsVisibleUntilThreeSecondDelayElapses() {

        let shown = makePresence(recordingID: 1, visible: true, generation: 5)
        assert(shown, .recordingChanged(nil)) {
            $0.recordingID = nil
            $0.generation = 6
        }
        assert(shown, .recordingChanged(nil), delivers: [.cancelDelay, .hideAfter(seconds: 3, generation: 6)])

        let ending = makePresence(visible: true, generation: 6)
        assert(ending, .delayElapsed(6)) { $0.visible = false }
        assert(ending, .delayElapsed(6), delivers: [.hide(.recordingEnded)])
    }

    @Test func endingAClosedRecordingClearsReopenWithoutSchedulingAHide() {

        let state = makePresence(recordingID: 1, generation: 8, offersReopen: true)
        assert(state, .recordingChanged(nil)) {
            $0.recordingID = nil
            $0.generation = 9
            $0.offersReopen = false
        }
        assert(state, .recordingChanged(nil), delivers: [.cancelDelay])
    }

    @Test func repeatedRecordingNotificationsLeavePresenceAndEffectsUnchanged() {

        for state in [
            makePresence(),
            makePresence(recordingID: 1, visible: true, generation: 5),
            makePresence(recordingID: 1, generation: 6, offersReopen: true),
            makePresence(visible: true, generation: 7),
            makePresence(generation: 8),
        ] {
            assert(state, .recordingChanged(state.recordingID))
            assert(state, .recordingChanged(state.recordingID), delivers: [])
        }
    }

    @Test func ignoredDelaysLeavePresenceAndEffectsUnchanged() {

        for state in [
            makePresence(generation: 6),
            makePresence(recordingID: 1, visible: true, generation: 6),
            makePresence(recordingID: 1, generation: 6, offersReopen: true),
        ] {
            assert(state, .delayElapsed(6))
            assert(state, .delayElapsed(6), delivers: [])
        }
        for state in [
            makePresence(visible: true, generation: 6),
            makePresence(recordingID: 2, visible: true, generation: 7),
            makePresence(visible: true, generation: 8),
        ] {
            for generation: UInt64 in [5, 9] {
                assert(state, .delayElapsed(generation))
                assert(state, .delayElapsed(generation), delivers: [])
            }
        }
    }

    @Test func userCloseCancelsDelaysAndOffersReopenOnlyDuringARecording() {

        for (state, offersReopen, effects): (PanelPresence, Bool, [PanelPresence.Effect]) in [
            (makePresence(), false, [.cancelDelay]),
            (makePresence(visible: true, generation: 6), false, [.cancelDelay, .hide(.userClosed)]),
            (makePresence(recordingID: 1, visible: true, generation: 5), true,
                [.cancelDelay, .hide(.userClosed)]),
            (makePresence(recordingID: 1, generation: 6, offersReopen: true), true, [.cancelDelay]),
        ] {
            assert(state, .userClosed) {
                $0.visible = false
                $0.generation += 1
                $0.offersReopen = offersReopen
            }
            assert(state, .userClosed, delivers: effects)
        }
    }

    @Test func menuReopenShowsAClosedRecordingPanel() {

        let state = makePresence(recordingID: 1, generation: 6, offersReopen: true)
        assert(state, .reopen) {
            $0.visible = true
            $0.offersReopen = false
        }
        assert(state, .reopen, delivers: [.show(.menuReopen)])
    }

    @Test func menuReopenIsIgnoredUnlessOffered() {

        for state in [
            makePresence(),
            makePresence(recordingID: 1, visible: true, generation: 5),
            makePresence(recordingID: 1, visible: true, generation: 6),
            makePresence(visible: true, generation: 7),
            makePresence(generation: 8),
        ] {
            assert(state, .reopen)
            assert(state, .reopen, delivers: [])
        }
    }

    @Test func appReopenShowsTheRecordingPanelWithItsOwnReason() {

        for state in [
            makePresence(recordingID: 1, visible: true, generation: 5),
            makePresence(recordingID: 1, visible: true, generation: 6),
        ] {
            assert(state, .appReopen)
            assert(state, .appReopen, delivers: [.show(.appReopen)])
        }
        let hidden = makePresence(recordingID: 1, generation: 6, offersReopen: true)
        assert(hidden, .appReopen) {
            $0.visible = true
            $0.offersReopen = false
        }
        assert(hidden, .appReopen, delivers: [.show(.appReopen)])
    }

    @Test func appReopenBetweenRecordingsShowsCallsWithoutChangingPresence() {

        for state in [makePresence(), makePresence(visible: true, generation: 7), makePresence(generation: 8)] {
            assert(state, .appReopen)
            assert(state, .appReopen, delivers: [.showCalls])
        }
    }

    @Test func menuOffersReopenOnlyDuringARecordingWithHiddenPanel() {

        for (presence, offers): (PanelPresence, Bool) in [
            (makePresence(), false),
            (makePresence(recordingID: 1, visible: true, generation: 5), false),
            (makePresence(recordingID: 1, generation: 6, offersReopen: true), true),
            (makePresence(generation: 7), false),
            (makePresence(recordingID: 1, visible: true, generation: 6), false),
        ] {
            #expect(presence.offersReopen == offers)
            for recording: MenuBarRecording in [
                .idle(automatic: true, unavailable: [], failure: nil),
                .recording(call: true, faults: []), .recording(call: false, faults: []), .ending(faults: []),
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

private func makePresence(recordingID: UInt64? = nil, visible: Bool = false,
                          generation: UInt64 = 0, offersReopen: Bool = false) -> PanelPresence {
    PanelPresence(recordingID: recordingID, visible: visible, generation: generation, offersReopen: offersReopen)
}

private func assert(_ state: PanelPresence, _ event: PanelPresence.Event,
                    sourceLocation: SourceLocation = #_sourceLocation,
                    _ mutate: (inout PanelPresence) -> Void = { _ in }) {
    var expected = state
    mutate(&expected)
    #expect(PanelPresence.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}

private func assert(_ state: PanelPresence, _ event: PanelPresence.Event, delivers expected: [PanelPresence.Effect],
                    sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(PanelPresence.reduce(state, event).1 == expected, sourceLocation: sourceLocation)
}
