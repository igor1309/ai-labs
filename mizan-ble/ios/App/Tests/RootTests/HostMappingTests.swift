import Testing
import AmountEntry
import HostBroadcast
import HostPayment
import HostUI
import SettingsUI
@testable import Root

@Suite @MainActor struct HostMappingTests {
    @Test func eventsMapByDestination() {
        let empty = AmountEntry.State(bluetooth: .available)
        let amount = AmountEntry.reduce(empty, .key(.digit(.one))).0
        let cases: [(HostEvent, HostInput?, HostInput?)] = [
            (.digit(0), .amount(.key(.digit(.zero))), .amount(.key(.digit(.zero)))),
            (.digit(9), .amount(.key(.digit(.nine))), .amount(.key(.digit(.nine)))),
            (.digit(-1), nil, nil), (.digit(10), nil, nil),
            (.decimalPoint, .amount(.key(.decimalPoint)), .amount(.key(.decimalPoint))),
            (.delete, .amount(.key(.delete)), .amount(.key(.delete))),
            (.lockAndBroadcast, .broadcast(.lock(amount: "1")), .broadcast(.lock(amount: "1"))),
            (.cancel, .broadcast(.cancel), .payment(.cancel)),
            (.broadcastAgain, .broadcast(.retry), .broadcast(.retry)),
            (.newAmount, .broadcast(.newAmount), .payment(.newAmount)),
            (.success, .payment(.outcome(.success)), .payment(.outcome(.success))),
            (.failure, .payment(.outcome(.failure)), .payment(.outcome(.failure))),
            (.openSettings, .settings, .settings),
        ]
        for (event, broadcast, payment) in cases {
            #expect(HostMapping.event(event, amount: amount, payment: false) == broadcast)
            #expect(HostMapping.event(event, amount: amount, payment: true) == payment)
        }
        #expect(HostMapping.event(.lockAndBroadcast, amount: empty, payment: false) == nil)
        let unavailable = AmountEntry.reduce(amount, .bluetoothChanged(.unavailable(reason: "off"))).0
        #expect(HostMapping.event(.lockAndBroadcast, amount: unavailable, payment: false) == nil)
        for seconds in [15, 30, 45, 60, 90, 120] {
            #expect(HostMapping.event(SettingsEvent.chooseCountdown(seconds)) == .countdown(seconds))
        }
        #expect(HostMapping.event(SettingsEvent.done) == .dismiss)
    }

    @Test func settingsMapEveryChoice() {
        for seconds in [15, 30, 60, 90, 120] {
            var expected = SettingsState.previews.first { $0.state.countdown.selectedSeconds == seconds }!.state
            expected.deviceCode = "MIZAN-ABCD"
            expected.readOnlyRows[0].value = "MIZAN-ABCD"
            #expect(HostMapping.settings(name: "MIZAN-ABCD", seconds: seconds) == expected)
        }
    }

    @Test func screensAndRestMapEveryPhase() {
        let amount = typedAmount("124.5")
        let broadcastCases: [(HostBroadcast.State, String, [HostEvent], Bool)] = [
            (.init(), "Idle", [.lockAndBroadcast], true),
            (broadcastState([.lock(amount: "124.5")]), "Going on air", [.cancel], false),
            (onAir(), "Advertising", [.cancel], false),
            (handshake(), "Connecting", [], false),
            (broadcastState([.lock(amount: "124.5"), .couldNotGoOnAir(.init(number: 1), reason: "denied")]),
             "Could not go on air", [.lockAndBroadcast], true),
            (HostBroadcast.reduce(onAir(), .secondsLeft(.init(number: 1), 0)).0,
             "Timed out", [.lockAndBroadcast], true),
            (HostBroadcast.reduce(handshake(), .handshakeFailed(.init(number: 1), reason: "bad key")).0,
             "Failed", [.broadcastAgain, .newAmount], true),
            (handedOver(), "Awaiting client", [.cancel], false),
        ]
        for (broadcast, status, buttons, rest) in broadcastCases {
            let screen = HostMapping.screen(amount: amount, broadcast: broadcast, payment: nil, name: "MIZAN-ABCD", seconds: 60)
            #expect(screen.status == status)
            #expect(screen.buttons.map(\.event) == buttons)
            #expect(screen.isSettingsEnabled == rest)
            #expect(HostMapping.atRest(broadcast, nil) == rest)
            #expect(screen.deviceCode == "MIZAN-ABCD")
            #expect(screen.deviceMeta == "Advertised name · 60 s")
            #expect(screen.steps.count == 5)
        }
        let paymentCases: [([HostPayment.Event], String, [HostEvent], Bool)] = [
            ([], "Awaiting client", [.cancel], false),
            ([.opened(.confirm)], "Processing", [.success, .failure], false),
            ([.opened(.decline)], "Declined", [.newAmount], true),
            ([.opened(.confirm), .outcome(.success)], "Paid", [.newAmount], true),
            ([.opened(.confirm), .outcome(.failure)], "Failed", [.newAmount], true),
            ([.linkLost], "Link lost", [.newAmount], true),
            ([.cancel], "Cancelled", [.newAmount], true),
        ]
        for (events, status, buttons, rest) in paymentCases {
            let payment = paymentState(events, cleaned: rest)
            let screen = HostMapping.screen(amount: amount, broadcast: handedOver(), payment: payment, name: "MIZAN-ABCD", seconds: 30)
            #expect(screen.status == status)
            #expect(screen.amount == "124.50")
            #expect(screen.buttons.map(\.event) == buttons)
            #expect(screen.buttons.allSatisfy { $0.isEnabled })
            #expect(screen.isSettingsEnabled == rest)
            #expect(HostMapping.atRest(handedOver(), payment) == rest)
        }
        let previewCases: [(HostBroadcast.State, HostPayment.State?, Int)] = [
            (.init(), nil, 0),
            (HostBroadcast.reduce(onAir(), .secondsLeft(.init(number: 1), 47)).0, nil, 1),
            (handedOver(), nil, 5),
            (handedOver(), paymentState([.opened(.decline)], cleaned: true), 6),
            (handedOver(), paymentState([.opened(.confirm)], cleaned: false), 7),
            (handedOver(), paymentState([.opened(.confirm), .outcome(.success)], cleaned: true), 8),
            (handedOver(), paymentState([.opened(.confirm), .outcome(.failure)], cleaned: true), 9),
            (broadcastState([.lock(amount: "124.5")]), nil, 13),
        ]
        for (broadcast, payment, index) in previewCases {
            #expect(HostMapping.screen(amount: amount, broadcast: broadcast, payment: payment, name: "MIZAN-7F3A", seconds: 60) == HostState.previews[index].state)
        }
        let pending = paymentState([.opened(.decline)], cleaned: false)
        #expect(!HostMapping.atRest(handedOver(), pending))
        #expect(!HostMapping.screen(amount: amount, broadcast: handedOver(), payment: pending, name: "MIZAN-ABCD", seconds: 60).buttons[0].isEnabled)
        let unavailable = AmountEntry.reduce(amount, .bluetoothChanged(.unavailable(reason: "Bluetooth off"))).0
        let off = HostMapping.screen(amount: unavailable, broadcast: .init(), payment: nil, name: "MIZAN-ABCD", seconds: 60)
        #expect(off.notice?.title == "Bluetooth off")
        #expect(!off.buttons[0].isEnabled)
    }
}

func typedAmount(_ text: String) -> AmountEntry.State {
    text.reduce(AmountEntry.State(bluetooth: .available)) { state, character in
        AmountEntry.reduce(state, character == "." ? .key(.decimalPoint) : .key(.digit(AmountEntry.Digit(rawValue: String(character))!))).0
    }
}

func broadcastState(_ events: [HostBroadcast.Event]) -> HostBroadcast.State {
    events.reduce(.init()) { HostBroadcast.reduce($0, $1).0 }
}

func onAir() -> HostBroadcast.State {
    let a = HostBroadcast.Attempt(number: 1)
    return broadcastState([.lock(amount: "124.5"), .countdownRead(a, 60),
                           .sessionOpened(a, .init(id: Array(repeating: 1, count: 16), publicKey: Array(repeating: 2, count: 33))),
                           .served(a), .onAir(a)])
}

func handshake() -> HostBroadcast.State {
    HostBroadcast.reduce(onAir(), .clientKey(.init(number: 1), .init(id: "client"), key: [3])).0
}

func handedOver() -> HostBroadcast.State {
    let a = HostBroadcast.Attempt(number: 1)
    return [.advertisingStopped(a), .keyDerived(a), .amountSealed(a, .init(bytes: [4])), .amountSent(a)]
        .reduce(handshake()) { HostBroadcast.reduce($0, $1).0 }
}

func paymentState(_ events: [HostPayment.Event], cleaned: Bool) -> HostPayment.State {
    var state = events.reduce(HostPayment.State(amount: "124.5")) { HostPayment.reduce($0, $1).0 }
    if cleaned {
        let message: HostPayment.Message = switch state.phase {
        case .declined: .acknowledgement
        case .paid: .result(.success)
        case .failed: .result(.failure)
        default: .end
        }
        // Confirm's acknowledgement precedes a queued outcome.
        if state.phase == .paid || state.phase == .failed {
            state = HostPayment.reduce(state, .sealed(.acknowledgement, [])).0
            state = HostPayment.reduce(state, .sent(.acknowledgement)).0
        }
        state = HostPayment.reduce(state, .sealed(message, [])).0
        state = HostPayment.reduce(state, .sent(message)).0
        state = HostPayment.reduce(state, .sessionClosed).0
        state = HostPayment.reduce(state, .linkEnded).0
    }
    return state
}
