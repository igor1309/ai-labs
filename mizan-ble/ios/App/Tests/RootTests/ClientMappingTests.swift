import Testing
import ClientFind
import ClientConnect
import ClientReview
import ClientPayment
import ClientUI
import ClientPaymentUI
@testable import Root

@Suite @MainActor struct ClientMappingTests {
    @Test func findScreens() {
        let base = findState([.bluetoothChanged(.available), .scanningStarted])
        let host = ClientFind.Host(id: "host", name: "MIZAN-7F3A")
        let chosen = ClientFind.reduce(base, .pickerAnswered(.host(host))).0
        let cases: [(ClientFind.State, Int)] = [
            (base, 0), (chosen, 1),
            (ClientFind.reduce(base, .pickerAnswered(.holdCloser)).0, 2),
            (ClientFind.reduce(chosen, .pickerAnswered(.none)).0, 3),
            (findState([.bluetoothChanged(.unavailable(reason: "Bluetooth is off"))]), 6),
            (ClientFind.reduce(base, .pickerAnswered(.host(.init(id: "unnamed", name: nil)))).0, 7),
        ]
        for (state, index) in cases {
            var expected = ClientState.previews[index].state
            if index == 3 { expected.detail = "The host stopped advertising before you connected. Nothing was sent." }
            #expect(ClientMapping.screen(find: state, connect: nil) == expected)
        }
        for reason in ["Bluetooth not allowed", "Bluetooth unsupported", "Bluetooth unavailable"] {
            let state = findState([.bluetoothChanged(.unavailable(reason: reason))])
            let screen = ClientMapping.screen(find: state, connect: nil)
            #expect(screen.title == reason)
            #expect(screen.actions.allSatisfy { !$0.isEnabled })
        }
    }

    @Test func connectScreensAndEvents() {
        let initial = ClientConnect.State(host: .init(id: "host", name: "MIZAN-7F3A"))
        let connecting = ClientConnect.reduce(initial, .start).0
        let failed = ClientConnect.reduce(connecting, .linkDropped).0
        for (state, index) in [(connecting, 4), (failed, 5)] {
            #expect(ClientMapping.screen(find: .init(), connect: state) == ClientState.previews[index].state)
        }
        let cases: [(ClientEvent, ClientInput)] = [(.startHandshake, .find(.start)), (.cancel, .cancel), (.tryAgain, .retry)]
        for (input, expected) in cases { #expect(ClientMapping.event(input) == expected) }
        for payment in [true, false] {
            let cases: [(ClientPaymentEvent, ClientPaymentInput)] = [
                (.confirm, .review(.decide(.confirm))), (.decline, .review(.decide(.decline))),
                (.done, payment ? .payment(.done) : .review(.done)),
            ]
            for (input, expected) in cases { #expect(ClientMapping.event(input, payment: payment) == expected) }
        }
    }

    @Test func reviewAndPaymentScreens() {
        let initial = ClientReview.State(host: .init(id: "host", name: "MIZAN-7F3A"), amount: 12450)
        let confirm = reviewState(initial, [.decide(.confirm), .sealed(.confirm, [1])])
        let decline = reviewState(initial, [.decide(.decline), .sealed(.decline, [1])])
        let cases: [(ClientReview.State, Int)] = [
            (initial, 0), (reviewState(decline, [.message([1]), .opened(.decisionAcknowledged)]), 1),
            (reviewState(initial, [.message([1]), .opened(.end)]), 3),
            (reviewState(initial, [.linkLost]), 7), (confirm, 8), (decline, 9),
            (reviewState(confirm, [.message([1]), .opened(.end)]), 10),
            (reviewState(decline, [.message([1]), .opened(.end)]), 12),
        ]
        for (state, index) in cases {
            #expect(ClientMapping.screen(review: state, payment: nil) == ClientPaymentState.previews[index].state)
        }
        for (events, index) in [([], 2), ([.message([1]), .opened(.success)], 4),
                                 ([.message([1]), .opened(.failure)], 5), ([.linkDropped], 6)] as [([ClientPayment.Event], Int)] {
            let state = events.reduce(ClientPayment.State(hostName: "MIZAN-7F3A", amountMinorUnits: 12450)) { ClientPayment.reduce($0, $1).0 }
            #expect(ClientMapping.screen(review: initial, payment: state) == ClientPaymentState.previews[index].state)
        }
        let unnamed = ClientPayment.reduce(.init(hostName: nil, amountMinorUnits: 12450), .message([1])).0
        let paid = ClientPayment.reduce(unnamed, .opened(.success)).0
        #expect(ClientMapping.screen(review: initial, payment: paid) == ClientPaymentState.previews[11].state)
        for (amount, text) in [(UInt64(0), "0.00"), (1, "0.01"), (100, "1.00"), (UInt64.max, "184467440737095516.15")] {
            let state = ClientReview.State(host: .init(id: "host", name: nil), amount: amount)
            #expect(ClientMapping.screen(review: state, payment: nil).content == .review(title: "Mizan till asks for", amount: text, detail: "Confirm to pay this amount. Decline to end the request."))
        }
    }

    @Test func restStates() {
        let host = ClientFind.Host(id: "host", name: nil)
        var find = ClientFind.State()
        for (event, rest) in [(.bluetoothChanged(.available), true), (.scanningStarted, true),
                              (.pickerAnswered(.host(host)), true), (.start, false), (.scanningStopped, false)] as [(ClientFind.Event, Bool)] {
            find = ClientFind.reduce(find, event).0
            #expect(ClientMapping.atRest(find: find, connect: nil, review: nil, payment: nil) == rest)
        }
        var connect = ClientConnect.State(host: .init(id: "host", name: nil))
        for (event, rest) in [(.start, false), (.deadlineStarted, false), (.connectionInitiated, false), (.linkDropped, true),
                              (.deadlineStopped, true), (.linkDroppedForCleanup, true), (.sessionClosed, true), (.retry, true)] as [(ClientConnect.Event, Bool)] {
            connect = ClientConnect.reduce(connect, event).0
            #expect(ClientMapping.atRest(find: find, connect: connect, review: nil, payment: nil) == rest)
        }
        let resources = MappingResources()
        var secureConnect = ClientConnect.State(host: .init(id: "host", name: nil))
        #expect(!ClientMapping.atRest(find: find, connect: secureConnect, review: nil, payment: nil))
        let steps: [ClientConnect.Event] = [
            .start, .deadlineStarted, .connectionInitiated,
            .connectionResult(.success(.init(session: .init(publicKey: [], id: []), largestWrite: 100))),
            .derivationResult(.success([1])), .keyWriteInitiated, .keyWriteResult(.success(())),
            .amountReceived(.init(counter: 0, box: [1])),
            .amountOpened(.success(.init(minorUnits: 1)), link: resources, session: resources), .deadlineStopped,
        ]
        for event in steps {
            secureConnect = ClientConnect.reduce(secureConnect, event).0
            #expect(!ClientMapping.atRest(find: find, connect: secureConnect, review: nil, payment: nil))
        }
        let ending = ClientConnect.reduce(ClientConnect.reduce(.init(host: .init(id: "host", name: nil)), .start).0, .cancel).0
        #expect(!ClientMapping.atRest(find: find, connect: ending, review: nil, payment: nil))
        let initial = ClientReview.State(host: .init(id: "host", name: nil), amount: 1)
        let confirmed: [ClientReview.Event] = [.decide(.confirm), .sealed(.confirm, [1]), .message([1]), .opened(.decisionAcknowledged)]
        let declined: [ClientReview.Event] = [.decide(.decline), .sealed(.decline, [1]), .message([1]), .opened(.decisionAcknowledged)]
        for events in [[], [.decide(.confirm)], [.decide(.decline)], confirmed, declined,
                       [.message([1]), .opened(.end)], [.linkLost], [.decide(.confirm), .sealed(.confirm, [1]), .linkLost],
                       [.linkLost, .sessionClosed, .linkDropped], [.linkLost, .sessionClosed, .linkDropped, .done]] as [[ClientReview.Event]] {
            let state = reviewState(initial, events)
            let rest = state.canFinish || state.phase == .over
            #expect(ClientMapping.atRest(find: find, connect: nil, review: state, payment: nil) == rest)
        }
        for events in [[], [.message([1]), .opened(.success)], [.message([1]), .opened(.failure)], [.linkDropped], [.linkDropped, .finished, .done]] as [[ClientPayment.Event]] {
            let state = events.reduce(ClientPayment.State(hostName: nil, amountMinorUnits: 1)) { ClientPayment.reduce($0, $1).0 }
            #expect(ClientMapping.atRest(find: find, connect: nil, review: nil, payment: state) == (state.status != .waiting))
        }
    }
}

private func findState(_ events: [ClientFind.Event]) -> ClientFind.State {
    events.reduce(.init()) { ClientFind.reduce($0, $1).0 }
}
private func reviewState(_ state: ClientReview.State, _ events: [ClientReview.Event]) -> ClientReview.State {
    events.reduce(state) { ClientReview.reduce($0, $1).0 }
}

@MainActor private final class MappingResources: ClientConnect.Link, ClientConnect.Session {
    func connect(to host: ClientConnect.Host) {}
    func writeKey(_ key: [UInt8]) {}
    func drop() {}
    func derive(with host: ClientConnect.HostSession) -> Result<[UInt8], ClientConnect.Failure> { .failure(.sessionDisagreement) }
    func open(_ amount: ClientConnect.SealedAmount) -> Result<ClientConnect.Amount, ClientConnect.Failure> { .failure(.unreadableAmount) }
    func close() {}
}
