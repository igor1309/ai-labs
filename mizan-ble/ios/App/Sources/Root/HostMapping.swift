import AmountEntry
import DesignSystem
import HostBroadcast
import HostPayment
import HostUI
import Settings
import SettingsUI

/// The destination is a translation; each reducer still decides whether to accept it.
enum HostInput: Equatable {
    case amount(AmountEntry.Event)
    case broadcast(HostBroadcast.Event)
    case payment(HostPayment.Event)
    case settings
}

enum SettingsInput: Equatable { case countdown(Int), dismiss }

enum HostMapping {
    static func event(_ event: HostEvent, amount: AmountEntry.State, payment: Bool) -> HostInput? {
        switch event {
        case .digit(let number):
            AmountEntry.Digit(rawValue: String(number)).map { .amount(.key(.digit($0))) }
        case .decimalPoint: .amount(.key(.decimalPoint))
        case .delete: .amount(.key(.delete))
        case .lockAndBroadcast: amount.canLock ? .broadcast(.lock(amount: amount.amount)) : nil
        case .cancel: payment ? .payment(.cancel) : .broadcast(.cancel)
        case .broadcastAgain: .broadcast(.retry)
        case .newAmount: payment ? .payment(.newAmount) : .broadcast(.newAmount)
        case .success: .payment(.outcome(.success))
        case .failure: .payment(.outcome(.failure))
        case .openSettings: .settings
        }
    }
    static func event(_ event: SettingsEvent) -> SettingsInput {
        switch event {
        case .chooseCountdown(let seconds): .countdown(seconds)
        case .done: .dismiss
        }
    }
    static func atRest(_ broadcast: HostBroadcast.State, _ payment: HostPayment.State?) -> Bool {
        if let payment { return payment.canEnterNewAmount || payment.isOver }
        switch broadcast.phase {
        case .ready, .timedOut, .failed: return true
        case .goingOnAir, .advertising, .handshake, .handedOver: return false
        }
    }
    static func screen(amount: AmountEntry.State, broadcast: HostBroadcast.State, payment: HostPayment.State?,
                       name: String, seconds: Int) -> HostState {
        var screen = entry(amount: amount, name: name, seconds: seconds)
        screen.isSettingsEnabled = atRest(broadcast, payment)
        if let payment {
            paymentScreen(&screen, payment)
            return screen
        }
        let locked = formattedAmount(broadcast.amount)
        switch broadcast.phase {
        case .ready:
            if broadcast.reason != nil {
                screen.status = "Could not go on air"
                screen.statusTone = .bad
                screen.notice = .init(title: "Could not go on air", detail: "The amount is still here. Lock it to try again.",
                                      symbol: "antenna.radiowaves.left.and.right.slash", isFailure: true)
            }
        case .timedOut:
            screen.status = "Timed out"
            screen.statusTone = .host
            screen.isAmountMuted = amount.amount.isEmpty
            screen.steps[0] = .init(.active, title: "Amount", detail: "Reset")
            screen.notice = .init(title: "No client in \(seconds) s", detail: "Advertising stopped. The amount was cleared.",
                                  symbol: "clock.badge.xmark", isFailure: false)
        case .goingOnAir, .advertising:
            let going = broadcast.phase == .goingOnAir
            let left = broadcast.secondsLeft ?? seconds
            screen.eyebrow = "STEP 2 OF 5 · ADVERTISE"
            screen.status = going ? "Going on air" : "Advertising"
            screen.statusTone = .host
            screen.amount = locked
            screen.amountTitle = "Charge · locked"
            screen.steps[0] = .init(.done, title: "Amount", detail: "\(locked) locked")
            screen.steps[1] = .init(.active, title: "Advertise", detail: going ? "Going on air" : "\(left) s left")
            screen.explanation = going ? "Going on air as \(name). The amount is locked." : "Broadcasting as \(name). The amount resets if no client connects in time."
            screen.exchange = .init(hostCode: "H2", hostDetail: "Advertising", message: going ? "going on air" : "advertise · in range",
                                    clientCode: going ? "C —" : "C1", clientDetail: going ? "" : "Ready", tone: .host,
                                    direction: .toClient, symbol: "antenna.radiowaves.left.and.right", clientIsEmpty: going)
            screen.panel = .countdown(.init(seconds: "\(left)", caption: "SECONDS LEFT", accessibilityLabel: "\(left) seconds left",
                                            fraction: Double(left) / Double(seconds)),
                                      title: going ? "Going on air" : "Waiting for a client", detail: "TIMEOUT \(seconds) S · SETTINGS")
            screen.buttons = [.init("Cancel", .cancel, symbol: "xmark")]
            screen.notice = nil
        case .handshake, .failed:
            let failed = broadcast.phase == .failed
            screen.eyebrow = "STEP 3 OF 5 · HANDSHAKE"
            screen.status = failed ? "Failed" : "Connecting"
            screen.statusTone = failed ? .bad : .host
            screen.amount = locked
            screen.amountTitle = failed ? "Charge · not sent" : "Charge · locked"
            secureSteps(&screen)
            screen.steps[2] = .init(failed ? .failed : .active, title: "Handshake", detail: failed ? "Link lost" : "Exchanging keys")
            screen.explanation = failed ? "The client could not finish the handshake. Broadcast again or start over." : "A client is connecting. The countdown stops once the link is up."
            screen.exchange = .init(hostCode: "H3", hostDetail: "Handshake", message: failed ? "link lost" : "handshake",
                                    clientCode: "C2", clientDetail: failed ? "Failed" : "Connecting", tone: failed ? .bad : .client,
                                    direction: .toHost, symbol: failed ? "link.badge.plus" : "key.horizontal")
            screen.panel = failed ? .result(.linkLost, title: "Handshake failed") : .connection(title: "Securing the link", detail: "EXCHANGING KEYS", secondsRemaining: broadcast.secondsLeft.map { "\($0) s left" })
            screen.buttons = failed ? [.init("Broadcast again", .broadcastAgain, symbol: "antenna.radiowaves.left.and.right", kind: .host),
                                        .init("New amount", .newAmount, symbol: "arrow.counterclockwise")] : []
            screen.notice = nil
            screen.isAmountMuted = failed
            screen.accent = failed ? .bad : .host
        case .handedOver(let secure):
            paymentScreen(&screen, .init(amount: secure.amount))
        }
        return screen
    }

    static func settings(name: String, seconds: Int) -> SettingsState {
        .init(steps: entrySteps(seconds), eyebrow: "SETTINGS", statusText: "Idle", deviceCode: name,
              deviceMeta: "Advertised name · \(seconds) s", title: "Settings",
              countdown: .init(title: "Advertising countdown", detail: "After this, advertising stops and the amount resets.",
                               choices: Settings.countdownChoices.map { .init(seconds: $0, text: "\($0) s") },
                               selectedSeconds: seconds, selectedText: "\(seconds) s", ringSeconds: seconds),
              readOnlyRows: [.init(title: "Advertised name", value: name), .init(title: "Currency", value: "Mizan · MZN"),
                             .init(title: "Processor", value: "Mock · manual outcome")],
              previewCaption: "PREVIEW · FULL RING", doneTitle: "Done")
    }

    private static func entry(amount: AmountEntry.State, name: String, seconds: Int) -> HostState {
        var screen = HostState(
            eyebrow: "STEP 1 OF 5 · AMOUNT", status: "Idle", statusTone: .idle, deviceCode: name,
            deviceMeta: "Advertised name · \(seconds) s", steps: entrySteps(seconds), amountTitle: "Charge",
            amount: amount.amount.isEmpty ? "0" : amount.amount.hasPrefix(".") ? "0" + amount.amount : amount.amount,
            explanation: "Confirming locks the amount and broadcasts it for \(seconds) seconds. Nothing is charged until the client accepts.",
            exchange: .init(hostCode: "H1", hostDetail: "Enter amount", message: "not advertising", clientCode: "C —",
                            clientDetail: "", tone: .idle, direction: .toClient, symbol: "antenna.radiowaves.left.and.right", clientIsEmpty: true),
            panel: .keypad(rows: keypad),
            buttons: [.init("Lock & broadcast", .lockAndBroadcast, symbol: "lock", kind: .host, isEnabled: amount.canLock)],
            isSettingsEnabled: true)
        if case .unavailable(let reason) = amount.bluetooth {
            screen.status = reason
            screen.statusTone = .bad
            screen.notice = .init(title: reason, detail: "Turn on Bluetooth to lock and broadcast an amount.",
                                  symbol: "antenna.radiowaves.left.and.right.slash", isFailure: true)
        }
        return screen
    }

    private static func entrySteps(_ seconds: Int) -> [SessionStep] {
        [.init(.active, title: "Amount", detail: "Typing…"), .init(.todo, title: "Advertise", detail: "\(seconds) s broadcast"),
         .init(.todo, title: "Handshake", detail: "Keys + amount"), .init(.todo, title: "Client approval", detail: "On their iPhone"),
         .init(.todo, title: "Process", detail: "Mock processor")]
    }
    private static var keypad: [[HostAction]] {
        [[1, 2, 3], [4, 5, 6], [7, 8, 9]].map { $0.map { .init("\($0)", .digit($0)) } } +
        [[.init(".", .decimalPoint), .init("0", .digit(0)), .init("Delete", .delete, symbol: "delete.left")]]
    }
    private static func secureSteps(_ screen: inout HostState) {
        screen.steps[0] = .init(.done, title: "Amount", detail: "\(screen.amount) locked")
        screen.steps[1] = .init(.done, title: "Advertise", detail: "Client found")
        screen.steps[2] = .init(.done, title: "Handshake", detail: "Link secure")
    }
    private static func formattedAmount(_ amount: String) -> String {
        let units = minorUnits(amount)
        let fraction = String(units % 100)
        return "\(units / 100)." + (fraction.count == 1 ? "0" : "") + fraction
    }

    private static func paymentScreen(_ screen: inout HostState, _ payment: HostPayment.State) {
        screen.amount = formattedAmount(payment.amount)
        screen.notice = nil
        secureSteps(&screen)
        screen.eyebrow = "STEP 4 OF 5 · CLIENT APPROVAL"
        screen.amountTitle = "Charge · sent"
        screen.status = "Awaiting client"
        screen.statusTone = .client
        screen.steps[3] = .init(.active, title: "Client approval", detail: "On their iPhone")
        screen.explanation = "The client sees this amount now and can confirm or decline it."
        screen.exchange = .init(hostCode: "H4", hostDetail: "Awaiting client", message: "amount sent", clientCode: "C3",
                                clientDetail: "Reviewing", tone: .host, direction: .toClient, symbol: "paperplane")
        screen.panel = .connection(title: "Waiting for the client", detail: "NO TIMEOUT WHILE REVIEWING")
        screen.buttons = [.init("Cancel", .cancel, symbol: "xmark")]
        switch payment.phase {
        case .awaitingDecision: return
        case .choosingOutcome:
            screen.eyebrow = "STEP 5 OF 5 · PROCESS"
            screen.status = "Processing"
            screen.statusTone = .host
            screen.amountTitle = "Charge · confirmed"
            screen.steps[3] = .init(.done, title: "Client approval", detail: "Confirmed")
            screen.steps[4] = .init(.active, title: "Process", detail: "Pick outcome")
            screen.explanation = "Mock processor. Pick the result the client should receive."
            screen.exchange = .init(hostCode: "H5", hostDetail: "Processing", message: "confirmed · ack", clientCode: "C4",
                                    clientDetail: "Waiting", tone: .client, direction: .toHost, symbol: "checkmark")
            screen.panel = .processor(eyebrow: "MOCK PROCESSOR", title: "Choose the outcome")
            screen.buttons = [.init("Success", .success, symbol: "checkmark", kind: .success), .init("Failure", .failure, symbol: "xmark", kind: .failure)]
            return
        case .over: return
        default: break
        }
        screen.buttons = [.init("New amount", .newAmount, symbol: "plus", kind: .host, isEnabled: payment.canEnterNewAmount)]
        screen.isAmountMuted = true
        screen.statusTone = .bad
        screen.exchange.hostCode = "H6"
        screen.exchange.hostDetail = "Ended"
        switch payment.phase {
        case .paid, .failed:
            let paid = payment.phase == .paid
            screen.status = paid ? "Paid" : "Failed"
            screen.statusTone = paid ? .ok : .bad
            screen.eyebrow = paid ? "COMPLETE" : "STEP 5 OF 5 · PROCESS"
            screen.amountTitle = paid ? "Paid" : "Charge · failed"
            screen.steps[3] = .init(.done, title: "Client approval", detail: "Confirmed")
            screen.steps[4] = .init(paid ? .done : .failed, title: "Process", detail: paid ? "Approved" : "Payment failed")
            screen.explanation = payment.resultSent
                ? (paid ? "Payment approved. The result was sent to the client." : "The processor rejected the payment. The result was sent to the client.")
                : "Sending the result to the client."
            screen.exchange = .init(hostCode: "H6", hostDetail: "Done", message: paid ? "success" : "failure", clientCode: "C5", clientDetail: "Done",
                                    tone: paid ? .ok : .bad, direction: .toClient, symbol: paid ? "checkmark.circle" : "xmark.circle")
            screen.panel = .result(paid ? .success : .failure, title: paid ? "Payment approved" : "Payment failed")
            screen.isAmountMuted = !paid
            screen.accent = paid ? .ok : .bad
        case .declined, .cancelled:
            let declined = payment.phase == .declined
            screen.status = declined ? "Declined" : "Cancelled"
            screen.amountTitle = declined ? "Charge · declined" : "Charge · cancelled"
            screen.steps[3] = .init(.failed, title: "Client approval", detail: screen.status)
            screen.explanation = declined ? "The client declined this payment. Nothing was charged." : "The payment was cancelled. Nothing was charged."
            screen.exchange = .init(hostCode: "H6", hostDetail: "Ended", message: declined ? "declined" : "cancelled", clientCode: "C5", clientDetail: screen.status,
                                    tone: .client, direction: declined ? .toHost : .toClient, symbol: "nosign")
            screen.panel = .result(.declined, title: declined ? "Client declined" : "Payment cancelled")
            screen.accent = .idle
        case .linkLost:
            screen.status = "Link lost"
            screen.amountTitle = "Charge · link lost"
            screen.steps[4] = .init(.failed, title: "Process", detail: "Link lost")
            screen.explanation = "The link to the client was lost. No result was sent."
            screen.exchange = .init(hostCode: "H6", hostDetail: "Ended", message: "link lost", clientCode: "C4", clientDetail: "Waiting", tone: .bad,
                                    direction: .toHost, symbol: "antenna.radiowaves.left.and.right.slash")
            screen.panel = .result(.linkLost, title: "Link lost")
            screen.accent = .bad
        default: break
        }
    }
}
