import AppUpdate
import Testing

private let reason = "after saving"
private let reducer = Reducer(disabledReason: reason)

struct ReducerTests {
    @Test func started_state() { for state in states() { assert(state, .started) } }
    @Test func started_effect() { for state in states() { assert(state, .started, delivers: .watch) } }

    @Test func bundleChanged_state() { for state in states() { assert(state, .bundleChanged) } }
    @Test func bundleChanged_effect() {
        for state in states() { assert(state, .bundleChanged, delivers: state.restart == .none ? .read : nil) }
    }

    @Test func buildReadIncludingSecondInstallAndRollback_state() {
        for state in states() {
            for id in ["running", "first", "second"] {
                if state.restart != .none { assert(state, .read(.build(id))); continue }
                assert(state, .read(.build(id))) {
                    $0.installed = id == "running" ? .none : .available(id)
                    $0.badge = id != "running"
                    $0.item = id == "running" ? .absent : (state.call == .idle ? .active : .disabled(reason))
                }
            }
        }
    }
    @Test func buildReadIncludingSecondInstallAndRollback_effect() {
        for state in states() {
            for id in ["running", "first", "second"] { assert(state, .read(.build(id)), delivers: nil) }
        }
    }

    @Test func unreadableRead_state() { for state in states() { assert(state, .read(.unreadable)) } }
    @Test func unreadableRead_effect() { for state in states() { assert(state, .read(.unreadable), delivers: nil) } }

    @Test func callChangedIncludingInstallDuringCallAndCallAfterTap_state() {
        for state in states() {
            for call in Call.allCases {
                assert(state, .callChanged(call)) {
                    $0.call = call
                    if state.installed != .none {
                        $0.item = call == .idle && state.restart == .none ? .active : .disabled(reason)
                    }
                }
            }
        }
    }
    @Test func callChangedIncludingInstallDuringCallAndCallAfterTap_effect() {
        for state in states() {
            for call in Call.allCases { assert(state, .callChanged(call), delivers: nil) }
        }
    }

    @Test func tapIncludingNonIdleAndRepeatedTap_state() {
        for state in states() {
            if state.installed != .none && state.call == .idle && state.restart == .none {
                assert(state, .restartTapped) { $0.restart = .requested; $0.item = .disabled(reason) }
            } else { assert(state, .restartTapped) }
        }
    }
    @Test func tapIncludingNonIdleAndRepeatedTap_effect() {
        for state in states() {
            let permitted = state.installed != .none && state.call == .idle && state.restart == .none
            assert(state, .restartTapped, delivers: permitted ? .relaunch : nil)
        }
    }

    @Test func relaunchStarted_state() {
        for state in states() {
            assert(state, .relaunchStarted) {
                $0.restart = .quitting
                if state.installed != .none { $0.item = .disabled(reason) }
            }
        }
    }
    @Test func relaunchStarted_effect() { for state in states() { assert(state, .relaunchStarted, delivers: .terminate) } }

    @Test func failedRelaunchRestoresItem_state() {
        for state in states() {
            assert(state, .relaunchFailed) {
                $0.restart = .none
                if state.installed != .none { $0.item = state.call == .idle ? .active : .disabled(reason) }
            }
        }
    }
    @Test func failedRelaunchRestoresItem_effect() { for state in states() { assert(state, .relaunchFailed, delivers: nil) } }

    @Test func publicInitializerPreservesAllFields() {
        let state = State(running: "own", installed: .available("other"), call: .inCall,
                          restart: .requested, badge: false, item: .disabled("custom"))
        #expect(state.running == "own")
        #expect(state.installed == .available("other"))
        #expect(state.call == .inCall)
        #expect(state.restart == .requested)
        #expect(!state.badge)
        #expect(state.item == .disabled("custom"))
    }

    @Test func everyEventRefreshesStoredPresentation_state() {
        for event: Event in [.started, .bundleChanged, .read(.unreadable), .callChanged(.idle), .restartTapped, .relaunchFailed] {
            let state = makeState(installed: .none, badge: true, item: .active)
            assert(state, event) { $0.badge = false; $0.item = .absent }
        }
    }
    @Test func everyEventRefreshesStoredPresentation_effect() {
        for (event, effect): (Event, Effect?) in [(.started, .watch), (.bundleChanged, .read), (.read(.unreadable), nil),
            (.callChanged(.idle), nil), (.restartTapped, nil), (.relaunchFailed, nil)] {
            assert(makeState(installed: .none, badge: true, item: .active), event, delivers: effect)
        }
    }

    @Test(arguments: [
        ("unknown", "unknown", false), ("unknown", "a-20261108T063502Z", true),
        ("b-20261108T063502Z", "a-20261107T063502Z", true),
        ("a-20261108T063502Z", "a-20261108T063502Z", false),
        ("a-20261108T063502Z", "a-dirty-20261108T063502Z", true),
        ("a-20261108T063502Z", "a-20261108T063503Z", true),
    ])
    func comparesIdentityNotOrder(running: String, installed: String, available: Bool) {
        #expect(updateAvailable(running: running, installed: installed) == available)
    }
}

private func makeState(installed: Installed = .none, call: Call = .idle, restart: Restart = .none,
                       badge: Bool = false, item: Item = .absent) -> State {
    State(running: "running", installed: installed, call: call, restart: restart, badge: badge, item: item)
}

private func states() -> [State] {
    Restart.allCases.flatMap { restart in
        Call.allCases.flatMap { call in
            [Installed.none, .available("first"), .available("second")].map { installed in
                makeState(installed: installed, call: call, restart: restart, badge: installed != .none,
                    item: installed == .none ? .absent : (call == .idle && restart == .none ? .active : .disabled(reason)))
            }
        }
    }
}

private func assert(_ state: State, _ event: Event, _ update: (inout State) -> Void = { _ in },
                    sourceLocation: SourceLocation = #_sourceLocation) {
    var expected = state
    update(&expected)
    #expect(reducer.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

private func assert(_ state: State, _ event: Event, delivers effect: Effect?,
                    sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(reducer.reduce(state, event).1 == effect, "\(state) + \(event)", sourceLocation: sourceLocation)
}
