import DesignSystem
import ClientFind
import ClientConnect
import ClientReview
import ClientPayment
import ClientUI
import ClientPaymentUI

enum ClientInput: Equatable { case find(ClientFind.Event), cancel, retry }
enum ClientPaymentInput: Equatable { case review(ClientReview.Event), payment(ClientPayment.Event) }

enum ClientMapping {
    static func event(_ event: ClientEvent) -> ClientInput {
        switch event {
        case .startHandshake: .find(.start)
        case .cancel: .cancel
        case .tryAgain: .retry
        }
    }
    static func event(_ event: ClientPaymentEvent, payment: Bool) -> ClientPaymentInput {
        switch event {
        case .confirm: .review(.decide(.confirm))
        case .decline: .review(.decide(.decline))
        case .done: payment ? .payment(.done) : .review(.done)
        }
    }
    static func atRest(find: ClientFind.State, connect: ClientConnect.State?, review: ClientReview.State?, payment: ClientPayment.State?) -> Bool {
        if let payment { return payment.status != .waiting }
        if let review {
            switch review.phase {
            case .ended, .over: return true
            case .reviewing, .sending, .handedOver: return false
            }
        }
        if let connect {
            switch connect.phase {
            case .couldNotConnect, .over: return true
            case .idle, .connecting, .handedOver, .ending: return false
            }
        }
        switch find.phase {
        case .stoppingScan(.some), .handedOver: return false
        default: return true
        }
    }
    static func screen(find: ClientFind.State, connect: ClientConnect.State?) -> ClientState {
        var screen = ClientState(
            eyebrow: "STEP 1 OF 4 · FIND", status: "Idle", statusTone: .idle,
            steps: .init(find: .init(.active, title: "Find", detail: "Searching"),
                         connect: .init(.todo, title: "Connect", detail: "Secure link"),
                         review: .init(.todo, title: "Review", detail: "Your call"),
                         result: .init(.todo, title: "Result", detail: "From host")),
            exchange: .init(hostCode: "H1", hostDetail: "Enter amount", message: "no host", clientCode: "C1",
                            clientDetail: "Ready", tone: .idle, direction: .toHost, symbol: "antenna.radiowaves.left.and.right"),
            title: "No host nearby", detail: "Hold the phone near the host iPad. It appears once the host locks an amount.",
            content: .discovery(icon: .bluetooth(isSlashed: false), isInRange: false),
            actions: [.init("Start handshake", event: .startHandshake, icon: .bluetooth(isSlashed: false), kind: .client, isEnabled: find.canStart)])
        if let connect {
            let failed = connect.canRetry
            screen.eyebrow = "STEP 2 OF 4 · CONNECT"
            screen.status = failed ? "Failed" : "Connecting"
            screen.statusTone = failed ? .bad : .client
            screen.steps.find = .init(.done, title: "Find", detail: "Host found")
            screen.steps.connect = .init(failed ? .failed : .active, title: "Connect", detail: failed ? "Link lost" : "Exchanging keys")
            screen.exchange = .init(hostCode: "H3", hostDetail: "Handshake", message: failed ? "link lost" : "handshake",
                                    clientCode: "C2", clientDetail: failed ? "Failed" : "Connecting", tone: failed ? .bad : .client,
                                    direction: .toHost, symbol: failed ? "link" : "key")
            screen.title = failed ? "Couldn’t connect" : "Connecting…"
            screen.detail = failed ? "The link to \(name(connect.host.name)) dropped. You were not charged." : "Keep the phone near the iPad until the amount appears."
            screen.content = failed ? .connectionFailure : .discovery(icon: .system("key", rotation: 45), isInRange: true)
            screen.actions = failed
                ? [.init("Try again", event: .tryAgain, icon: .system("arrow.counterclockwise"), kind: .client, isEnabled: connect.canRetry)]
                : [.init("Cancel", event: .cancel, icon: .system("xmark"), kind: .secondary, isEnabled: connect.canCancel)]
            return screen
        }
        if case .unavailable(let reason) = find.bluetooth {
            screen.title = reason
            screen.detail = "Turn on Bluetooth to find a nearby host."
            screen.content = .discovery(icon: .bluetooth(isSlashed: true), isInRange: false)
            return screen
        }
        switch find.selection {
        case .none: break
        case .host(let host):
            screen.status = "In range"
            screen.statusTone = .client
            screen.steps.find = .init(.active, title: "Find", detail: "Host in range")
            screen.exchange = .init(hostCode: "H2", hostDetail: "Advertising", message: "in range", clientCode: "C1",
                                    clientDetail: "Ready", tone: .host, direction: .toClient, symbol: "antenna.radiowaves.left.and.right")
            screen.title = "Pay a nearby host"
            screen.detail = "\(name(host.name)) is in range. Start the handshake to see the amount."
            screen.content = .discovery(icon: .bluetooth(isSlashed: false), isInRange: true)
        case .holdCloser:
            screen.title = "Hold closer"
            screen.detail = "Hold your phone closer to the till"
        case .gone:
            screen.title = "Host went quiet"
            screen.detail = "The host stopped advertising before you connected. Nothing was sent."
            screen.exchange.message = "host gone"
            screen.content = .discovery(icon: .bluetooth(isSlashed: true), isInRange: false)
        }
        return screen
    }

    static func screen(review: ClientReview.State, payment: ClientPayment.State?) -> ClientPaymentState {
        let host = name(payment.map { $0.hostName } ?? review.host.name)
        let amount = formatted(payment?.amountMinorUnits ?? review.amount)
        var screen = ClientPaymentState(
            eyebrow: "STEP 3 OF 4 · REVIEW", pill: .init("Review", tone: .client),
            steps: .init(find: .init(.done, title: "Find", detail: "Host found"),
                         connect: .init(.done, title: "Connect", detail: "Link secure"),
                         review: .init(.active, title: "Review", detail: "Your call"),
                         result: .init(.todo, title: "Result", detail: "From host")),
            exchange: .init(hostCode: "H4", hostDetail: "Awaiting client", message: "amount", clientCode: "C3",
                            clientDetail: "Reviewing", tone: .host, direction: .toClient, symbol: "paperplane"),
            content: .review(title: "\(host) asks for", amount: amount, detail: "Confirm to pay this amount. Decline to end the request."),
            actions: [.init("Decline", event: .decline, symbol: "xmark", kind: .decline, isEnabled: review.canDecide),
                      .init("Confirm", event: .confirm, symbol: "checkmark", kind: .client, isEnabled: review.canDecide)])
        if let payment {
            paymentScreen(&screen, payment, host: host, amount: amount)
            return screen
        }
        switch review.phase {
        case .reviewing: break
        case .sending(let decision):
            let word = decision == .confirm ? "confirm" : "decline"
            screen.pill = .init("Sending", tone: .client)
            screen.steps.review = .init(.active, title: "Review", detail: "Sending")
            screen.exchange.message = word
            screen.exchange.clientDetail = "Sending"
            screen.exchange.tone = .client
            screen.exchange.direction = .toHost
            screen.exchange.symbol = decision == .confirm ? "paperplane" : "nosign"
            screen.content = .result(mark: .declined, title: "Sending \(word)", detail: "Your \(word) is on its way to \(host).")
            screen.actions = [done(enabled: false)]
        case .ended(let outcome):
            screen.actions = [done(enabled: review.canFinish)]
            switch outcome {
            case .declined, .hostCancelled:
                let declined = outcome == .declined
                let title = declined ? "Declined" : "Cancelled"
                screen.pill = .init(title, tone: declined ? .bad : .idle)
                screen.steps.review = .init(.failed, title: "Review", detail: title)
                screen.exchange = .init(hostCode: "H6", hostDetail: "Ended", message: declined ? "host notified" : "cancelled",
                                        clientCode: "C5", clientDetail: title, tone: declined ? .client : .host,
                                        direction: declined ? .toHost : .toClient, symbol: "nosign")
                screen.content = .result(mark: .declined, title: declined ? "You declined" : "Host cancelled",
                                         detail: declined ? "\(host) was told. You were not charged." : "\(host) cancelled the request. You were not charged.")
            case .linkLost(let charge):
                lostScreen(&screen, host: host, unknown: charge == .unknown)
            }
        case .handedOver:
            paymentScreen(&screen, .init(hostName: review.host.name, amountMinorUnits: review.amount), host: host, amount: amount)
        case .over: screen.actions = []
        }
        return screen
    }

    private static func paymentScreen(_ screen: inout ClientPaymentState, _ payment: ClientPayment.State, host: String, amount: String) {
        screen.eyebrow = "STEP 4 OF 4 · RESULT"
        screen.pill = .init("Waiting", tone: .client)
        screen.steps.review = .init(.done, title: "Review", detail: "Confirmed")
        screen.steps.result = .init(.active, title: "Result", detail: "Waiting")
        screen.exchange = .init(hostCode: "H5", hostDetail: "Processing", message: "ack received", clientCode: "C4",
                                clientDetail: "Waiting", tone: .client, direction: .toHost, symbol: "checkmark")
        screen.content = .processing(amount: amount, rows: [
            .init("Confirmed", detail: "YOU · \(amount)", symbol: "checkmark", isComplete: true),
            .init("Acknowledged", detail: "HOST · RECEIVED", symbol: "checkmark", isComplete: true),
            .init("Waiting for host", detail: "PROCESSING PAYMENT", symbol: "rays", isComplete: false)])
        screen.actions = []
        switch payment.status {
        case .waiting, .over: return
        case .lost: lostScreen(&screen, host: host, unknown: true)
        case .paid, .failed:
            let paid = payment.status == .paid
            screen.eyebrow = paid ? "COMPLETE" : "STEP 4 OF 4 · RESULT"
            screen.pill = .init(paid ? "Paid" : "Failed", tone: paid ? .ok : .bad)
            screen.steps.result = .init(paid ? .done : .failed, title: "Result", detail: paid ? "Paid" : "Failed")
            screen.exchange = .init(hostCode: "H6", hostDetail: "Done", message: paid ? "success" : "failure", clientCode: "C5",
                                    clientDetail: "Done", tone: paid ? .ok : .bad, direction: .toClient, symbol: paid ? "checkmark.circle" : "xmark.circle")
            screen.content = paid ? .paid(title: "Paid", amount: amount, detail: "to \(host)")
                : .result(mark: .failure, title: "Payment failed", detail: "\(host) could not process \(amount). You were not charged.")
        }
        screen.actions = [done(enabled: true)]
    }
    private static func lostScreen(_ screen: inout ClientPaymentState, host: String, unknown: Bool) {
        screen.pill = .init("Link lost", tone: .bad)
        if unknown {
            screen.eyebrow = "STEP 4 OF 4 · RESULT"
            screen.steps.review = .init(.done, title: "Review", detail: "Confirmed")
            screen.steps.result = .init(.failed, title: "Result", detail: "Unknown")
        } else { screen.steps.review = .init(.failed, title: "Review", detail: "Link lost") }
        screen.exchange = .init(hostCode: unknown ? "H5" : "H4", hostDetail: unknown ? "Processing" : "Awaiting client", message: "link lost",
                                clientCode: "C5", clientDetail: unknown ? "Unknown" : "Ended", tone: .bad, direction: .toClient,
                                symbol: "antenna.radiowaves.left.and.right.slash")
        screen.content = .result(mark: .linkLost, title: unknown ? "Result unknown" : "Link lost",
                                 detail: unknown ? "The link to \(host) was lost before a result arrived. Check with the host before paying again."
                                 : "The link to \(host) was lost. You were not charged.")
    }
    private static func done(enabled: Bool) -> ClientPaymentState.Action {
        .init("Done", event: .done, symbol: "checkmark", kind: .secondary, isEnabled: enabled)
    }
    private static func name(_ value: String?) -> String { value ?? "Mizan till" }
    private static func formatted(_ units: UInt64) -> String {
        let fraction = String(units % 100)
        return "\(units / 100)." + (fraction.count == 1 ? "0" : "") + fraction
    }
}
