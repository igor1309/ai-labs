import DesignSystem
import SwiftUI

public extension HostState {
    /// One presentation value for each situation the operator can see.
    private static let framePreviews: [(name: String, state: HostState)] = [
        ("s1-typing-an-amount-m1", enterAmountPreview),
        ("s2-broadcasting-m2", HostState(
            eyebrow: "STEP 2 OF 5 · ADVERTISE", status: "Advertising", statusTone: .host,
            deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · 60 s",
            steps: [
                .init(.done, title: "Amount", detail: "124.50 locked"),
                .init(.active, title: "Advertise", detail: "47 s left"),
                .init(.todo, title: "Handshake", detail: "Keys + amount"),
                .init(.todo, title: "Client approval", detail: "On their iPhone"),
                .init(.todo, title: "Process", detail: "Mock processor")
            ],
            amountTitle: "Charge · locked", amount: "124.50",
            explanation: "Broadcasting as MIZAN-7F3A. The amount resets if no client connects in time.",
            exchange: .init(
                hostCode: "H2", hostDetail: "Advertising",
                message: "advertise · in range", clientCode: "C1", clientDetail: "Ready",
                tone: .host, direction: .toClient, symbol: "antenna.radiowaves.left.and.right", clientIsEmpty: false
            ),
            panel: .countdown(.init(seconds: "47", caption: "SECONDS LEFT", accessibilityLabel: "47 seconds left", fraction: 47.0 / 60), title: "Waiting for a client", detail: "TIMEOUT 60 S · SETTINGS"),
            buttons: [.init("Cancel", .cancel, symbol: "xmark")],
            isSettingsEnabled: false, isAmountMuted: false, accent: .host
        )),
        ("s3-timed-out-m10", HostState(
            eyebrow: "STEP 1 OF 5 · AMOUNT", status: "Timed out", statusTone: .host,
            deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · 60 s",
            steps: [
                .init(.active, title: "Amount", detail: "Reset"),
                .init(.todo, title: "Advertise", detail: "60 s broadcast"),
                .init(.todo, title: "Handshake", detail: "Keys + amount"),
                .init(.todo, title: "Client approval", detail: "On their iPhone"),
                .init(.todo, title: "Process", detail: "Mock processor")
            ],
            amountTitle: "Charge", amount: "0",
            explanation: "",
            exchange: .init(
                hostCode: "H1", hostDetail: "Enter amount",
                message: "not advertising", clientCode: "C —", clientDetail: "",
                tone: .idle, direction: .toClient, symbol: "antenna.radiowaves.left.and.right", clientIsEmpty: true
            ),
            panel: .keypad(rows: keypadPreview),
            buttons: [.init("Lock & broadcast", .lockAndBroadcast, symbol: "lock", kind: .host, isEnabled: false)],
            notice: .init(title: "No client in 60 s", detail: "Advertising stopped. 124.50 was cleared.", symbol: "clock.badge.xmark", isFailure: false),
            isSettingsEnabled: true, isAmountMuted: true, accent: .host
        )),
        ("s4-a-client-is-connecting-m3", HostState(
            eyebrow: "STEP 3 OF 5 · HANDSHAKE", status: "Connecting", statusTone: .host,
            deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · 60 s",
            steps: [
                .init(.done, title: "Amount", detail: "124.50 locked"),
                .init(.done, title: "Advertise", detail: "Client found"),
                .init(.active, title: "Handshake", detail: "Exchanging keys"),
                .init(.todo, title: "Client approval", detail: "On their iPhone"),
                .init(.todo, title: "Process", detail: "Mock processor")
            ],
            amountTitle: "Charge · locked", amount: "124.50",
            explanation: "A client is connecting. The countdown stops once the link is up.",
            exchange: .init(
                hostCode: "H3", hostDetail: "Handshake",
                message: "handshake", clientCode: "C2", clientDetail: "Connecting",
                tone: .client, direction: .toHost, symbol: "key", clientIsEmpty: false
            ),
            panel: .connection(title: "Securing the link", detail: "IPHONE · RSSI −52", secondsRemaining: "47 s left"),
            buttons: [],
            isSettingsEnabled: false, isAmountMuted: false, accent: .host
        )),
        ("s5-the-handshake-failed-m4", HostState(
            eyebrow: "STEP 3 OF 5 · HANDSHAKE", status: "Failed", statusTone: .bad,
            deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · 60 s",
            steps: [
                .init(.done, title: "Amount", detail: "124.50 locked"),
                .init(.done, title: "Advertise", detail: "Client found"),
                .init(.failed, title: "Handshake", detail: "Link lost"),
                .init(.todo, title: "Client approval", detail: "On their iPhone"),
                .init(.todo, title: "Process", detail: "Mock processor")
            ],
            amountTitle: "Charge · not sent", amount: "124.50",
            explanation: "The client could not finish the handshake. Broadcast again or start over.",
            exchange: .init(
                hostCode: "H3", hostDetail: "Handshake",
                message: "link lost", clientCode: "C2", clientDetail: "Failed",
                tone: .bad, direction: .toHost, symbol: "link.badge.plus", clientIsEmpty: false
            ),
            panel: .result(.linkLost, title: "Handshake failed"),
            buttons: [.init("Broadcast again", .broadcastAgain, symbol: "antenna.radiowaves.left.and.right", kind: .host), .init("New amount", .newAmount, symbol: "arrow.counterclockwise")],
            isSettingsEnabled: true, isAmountMuted: true, accent: .bad
        )),
        ("s6-waiting-for-the-client-m5", HostState(
            eyebrow: "STEP 4 OF 5 · CLIENT APPROVAL", status: "Awaiting client", statusTone: .client,
            deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · 60 s",
            steps: [
                .init(.done, title: "Amount", detail: "124.50 locked"),
                .init(.done, title: "Advertise", detail: "Client found"),
                .init(.done, title: "Handshake", detail: "Link secure"),
                .init(.active, title: "Client approval", detail: "On their iPhone"),
                .init(.todo, title: "Process", detail: "Mock processor")
            ],
            amountTitle: "Charge · sent", amount: "124.50",
            explanation: "The client sees this amount now and can confirm or decline it.",
            exchange: .init(
                hostCode: "H4", hostDetail: "Awaiting client",
                message: "amount sent", clientCode: "C3", clientDetail: "Reviewing",
                tone: .host, direction: .toClient, symbol: "paperplane", clientIsEmpty: false
            ),
            panel: .connection(title: "Waiting for the client", detail: "NO TIMEOUT WHILE REVIEWING"),
            buttons: [.init("Cancel", .cancel, symbol: "xmark")],
            isSettingsEnabled: false, isAmountMuted: false, accent: .host
        )),
        ("s7-declined-m6", HostState(
            eyebrow: "STEP 4 OF 5 · CLIENT APPROVAL", status: "Declined", statusTone: .bad,
            deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · 60 s",
            steps: [
                .init(.done, title: "Amount", detail: "124.50 locked"),
                .init(.done, title: "Advertise", detail: "Client found"),
                .init(.done, title: "Handshake", detail: "Link secure"),
                .init(.failed, title: "Client approval", detail: "Declined"),
                .init(.todo, title: "Process", detail: "Mock processor")
            ],
            amountTitle: "Charge · declined", amount: "124.50",
            explanation: "The client declined this payment. Nothing was charged.",
            exchange: .init(
                hostCode: "H6", hostDetail: "Ended",
                message: "declined", clientCode: "C5", clientDetail: "Declined",
                tone: .client, direction: .toHost, symbol: "nosign", clientIsEmpty: false
            ),
            panel: .result(.declined, title: "Client declined"),
            buttons: [.init("New amount", .newAmount, symbol: "plus", kind: .host)],
            isSettingsEnabled: true, isAmountMuted: true, accent: .idle
        )),
        ("s8-picking-the-outcome-m7", HostState(
            eyebrow: "STEP 5 OF 5 · PROCESS", status: "Processing", statusTone: .host,
            deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · 60 s",
            steps: [
                .init(.done, title: "Amount", detail: "124.50 locked"),
                .init(.done, title: "Advertise", detail: "Client found"),
                .init(.done, title: "Handshake", detail: "Link secure"),
                .init(.done, title: "Client approval", detail: "Confirmed"),
                .init(.active, title: "Process", detail: "Pick outcome")
            ],
            amountTitle: "Charge · confirmed", amount: "124.50",
            explanation: "Mock processor. Pick the result the client should receive.",
            exchange: .init(
                hostCode: "H5", hostDetail: "Processing",
                message: "confirmed · ack", clientCode: "C4", clientDetail: "Waiting",
                tone: .client, direction: .toHost, symbol: "checkmark", clientIsEmpty: false
            ),
            panel: .processor(eyebrow: "MOCK PROCESSOR", title: "Choose the outcome"),
            buttons: [.init("Success", .success, symbol: "checkmark", kind: .success), .init("Failure", .failure, symbol: "xmark", kind: .failure)],
            isSettingsEnabled: false, isAmountMuted: false, accent: .host
        )),
        ("s9-paid-m8", HostState(
            eyebrow: "COMPLETE", status: "Paid", statusTone: .ok,
            deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · 60 s",
            steps: [
                .init(.done, title: "Amount", detail: "124.50 locked"),
                .init(.done, title: "Advertise", detail: "Client found"),
                .init(.done, title: "Handshake", detail: "Link secure"),
                .init(.done, title: "Client approval", detail: "Confirmed"),
                .init(.done, title: "Process", detail: "Approved")
            ],
            amountTitle: "Paid", amount: "124.50",
            explanation: "Payment approved. The result was sent to the client.",
            exchange: .init(
                hostCode: "H6", hostDetail: "Done",
                message: "success", clientCode: "C5", clientDetail: "Done",
                tone: .ok, direction: .toClient, symbol: "checkmark.seal", clientIsEmpty: false
            ),
            panel: .result(.success, title: "Payment approved"),
            buttons: [.init("New amount", .newAmount, symbol: "plus", kind: .host)],
            isSettingsEnabled: true, isAmountMuted: false, accent: .ok
        )),
        ("s10-failed-m9", HostState(
            eyebrow: "STEP 5 OF 5 · PROCESS", status: "Failed", statusTone: .bad,
            deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · 60 s",
            steps: [
                .init(.done, title: "Amount", detail: "124.50 locked"),
                .init(.done, title: "Advertise", detail: "Client found"),
                .init(.done, title: "Handshake", detail: "Link secure"),
                .init(.done, title: "Client approval", detail: "Confirmed"),
                .init(.failed, title: "Process", detail: "Payment failed")
            ],
            amountTitle: "Charge · failed", amount: "124.50",
            explanation: "The processor rejected the payment. The result was sent to the client.",
            exchange: .init(
                hostCode: "H6", hostDetail: "Done",
                message: "failure", clientCode: "C5", clientDetail: "Done",
                tone: .bad, direction: .toClient, symbol: "xmark.seal", clientIsEmpty: false
            ),
            panel: .result(.failure, title: "Payment failed"),
            buttons: [.init("New amount", .newAmount, symbol: "plus", kind: .host)],
            isSettingsEnabled: true, isAmountMuted: true, accent: .bad
        )),
    ]

    static let previews: [(name: String, state: HostState)] = framePreviews + [
        ("s11-the-client-was-lost", linkLostPreview),
        ("s12-bluetooth-off", bluetoothOffPreview),
        ("s13-could-not-go-on-air", couldNotGoOnAirPreview),
        ("s14-going-on-air", goingOnAirPreview),
    ]

    private static var enterAmountPreview: HostState {
        HostState(
            eyebrow: "STEP 1 OF 5 · AMOUNT", status: "Idle", statusTone: .idle,
            deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · 60 s",
            steps: [
                .init(.active, title: "Amount", detail: "Typing…"),
                .init(.todo, title: "Advertise", detail: "60 s broadcast"),
                .init(.todo, title: "Handshake", detail: "Keys + amount"),
                .init(.todo, title: "Client approval", detail: "On their iPhone"),
                .init(.todo, title: "Process", detail: "Mock processor")
            ],
            amountTitle: "Charge", amount: "124.5",
            explanation: "Confirming locks the amount and broadcasts it for 60 seconds. Nothing is charged until the client accepts.",
            exchange: .init(
                hostCode: "H1", hostDetail: "Enter amount",
                message: "not advertising", clientCode: "C —", clientDetail: "",
                tone: .idle, direction: .toClient, symbol: "antenna.radiowaves.left.and.right", clientIsEmpty: true
            ),
            panel: .keypad(rows: keypadPreview),
            buttons: [.init("Lock & broadcast", .lockAndBroadcast, symbol: "lock", kind: .host)],
            isSettingsEnabled: true, isAmountMuted: false, accent: .host
        )
    }

    private static var keypadPreview: [[HostAction]] {
        [
            [.init("1", .digit(1)), .init("2", .digit(2)), .init("3", .digit(3))],
            [.init("4", .digit(4)), .init("5", .digit(5)), .init("6", .digit(6))],
            [.init("7", .digit(7)), .init("8", .digit(8)), .init("9", .digit(9))],
            [.init(".", .decimalPoint), .init("0", .digit(0)), .init("Delete", .delete, symbol: "delete.left")],
        ]
    }

    private static var linkLostPreview: HostState {
        var state = framePreviews[7].state
        state.status = "Link lost"
        state.statusTone = .bad
        state.amountTitle = "Charge · link lost"
        state.isAmountMuted = true
        state.accent = .bad
        state.explanation = "The link to the client was lost. No result was sent."
        state.steps[4] = .init(.failed, title: "Process", detail: "Link lost")
        state.exchange = .init(
            hostCode: "H6", hostDetail: "Ended", message: "link lost",
            clientCode: "C4", clientDetail: "Waiting", tone: .bad, direction: .toHost,
            symbol: "antenna.radiowaves.left.and.right.slash"
        )
        state.panel = .result(.linkLost, title: "Link lost")
        state.buttons = [.init("New amount", .newAmount, symbol: "plus", kind: .host)]
        state.isSettingsEnabled = true
        return state
    }

    private static var bluetoothOffPreview: HostState {
        var state = enterAmountPreview
        state.status = "Bluetooth off"
        state.statusTone = .bad
        state.notice = .init(
            title: "Bluetooth is off", detail: "Turn on Bluetooth to lock and broadcast an amount.",
            symbol: "antenna.radiowaves.left.and.right.slash", isFailure: true
        )
        state.buttons[0].isEnabled = false
        return state
    }

    private static var couldNotGoOnAirPreview: HostState {
        var state = enterAmountPreview
        state.status = "Could not go on air"
        state.statusTone = .bad
        state.notice = .init(
            title: "Could not go on air", detail: "The amount is still here. Lock it to try again.",
            symbol: "antenna.radiowaves.left.and.right.slash", isFailure: true
        )
        return state
    }

    private static var goingOnAirPreview: HostState {
        var state = framePreviews[1].state
        state.status = "Going on air"
        state.steps[1].detail = "Going on air"
        state.explanation = "Going on air as MIZAN-7F3A. The amount is locked."
        state.exchange.message = "going on air"
        state.exchange.clientCode = "C —"
        state.exchange.clientDetail = ""
        state.exchange.clientIsEmpty = true
        state.panel = .countdown(
            .init(seconds: "60", caption: "SECONDS LEFT", accessibilityLabel: "60 seconds left", fraction: 1),
            title: "Going on air", detail: "TIMEOUT 60 S · SETTINGS"
        )
        return state
    }
}

private struct HostPreview: View {
    let state: HostState
    let scheme: ColorScheme

    var body: some View {
        HostView(state: state, event: { _ in })
            .environment(\.modeSwitch, .init(side: .host, isEnabled: state.isSettingsEnabled, onSelect: { _ in }))
            .environment(\.colorScheme, scheme)
            .frame(width: Tokens.space20 * 15 - Tokens.space1, height: Tokens.space20 * 10 + Tokens.space8)
    }
}

#Preview("s1-typing-an-amount-m1 · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[0].state, scheme: .light)
}

#Preview("s1-typing-an-amount-m1 · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[0].state, scheme: .dark)
}

#Preview("s2-broadcasting-m2 · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[1].state, scheme: .light)
}

#Preview("s2-broadcasting-m2 · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[1].state, scheme: .dark)
}

#Preview("s3-timed-out-m10 · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[2].state, scheme: .light)
}

#Preview("s3-timed-out-m10 · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[2].state, scheme: .dark)
}

#Preview("s4-a-client-is-connecting-m3 · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[3].state, scheme: .light)
}

#Preview("s4-a-client-is-connecting-m3 · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[3].state, scheme: .dark)
}

#Preview("s5-the-handshake-failed-m4 · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[4].state, scheme: .light)
}

#Preview("s5-the-handshake-failed-m4 · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[4].state, scheme: .dark)
}

#Preview("s6-waiting-for-the-client-m5 · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[5].state, scheme: .light)
}

#Preview("s6-waiting-for-the-client-m5 · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[5].state, scheme: .dark)
}

#Preview("s7-declined-m6 · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[6].state, scheme: .light)
}

#Preview("s7-declined-m6 · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[6].state, scheme: .dark)
}

#Preview("s8-picking-the-outcome-m7 · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[7].state, scheme: .light)
}

#Preview("s8-picking-the-outcome-m7 · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[7].state, scheme: .dark)
}

#Preview("s9-paid-m8 · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[8].state, scheme: .light)
}

#Preview("s9-paid-m8 · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[8].state, scheme: .dark)
}

#Preview("s10-failed-m9 · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[9].state, scheme: .light)
}

#Preview("s10-failed-m9 · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[9].state, scheme: .dark)
}

#Preview("s11-the-client-was-lost · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[10].state, scheme: .light)
}

#Preview("s11-the-client-was-lost · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[10].state, scheme: .dark)
}

#Preview("s12-bluetooth-off · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[11].state, scheme: .light)
}

#Preview("s12-bluetooth-off · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[11].state, scheme: .dark)
}

#Preview("s13-could-not-go-on-air · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[12].state, scheme: .light)
}

#Preview("s13-could-not-go-on-air · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[12].state, scheme: .dark)
}

#Preview("s14-going-on-air · light", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[13].state, scheme: .light)
}

#Preview("s14-going-on-air · dark", traits: .sizeThatFitsLayout) {
    HostPreview(state: HostState.previews[13].state, scheme: .dark)
}
