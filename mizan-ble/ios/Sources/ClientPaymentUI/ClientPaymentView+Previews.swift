import DesignSystem
import SwiftUI

public extension ClientPaymentState {
    static let previews: [(name: String, state: ClientPaymentState)] = [
        ("s1-reviewing-m5", .init(
            eyebrow: "STEP 3 OF 4 · REVIEW", pill: .init("Review", tone: .client),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.active, title: "Review", detail: "Your call"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H4", hostDetail: "Awaiting client", message: "amount",
                clientCode: "C3", clientDetail: "Reviewing", tone: .host,
                direction: .toClient, symbol: "paperplane"
            ),
            content: .review(title: "MIZAN-7F3A asks for", amount: "124.50", detail: "Confirm to pay this amount. Decline to end the request."),
            actions: [
                .init("Decline", event: .decline, symbol: "xmark", kind: .decline, isEnabled: true),
                .init("Confirm", event: .confirm, symbol: "checkmark", kind: .client, isEnabled: true),
            ]
        )),
        ("s2-declined-m6", .init(
            eyebrow: "STEP 3 OF 4 · REVIEW", pill: .init("Declined", tone: .bad),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.failed, title: "Review", detail: "Declined"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H6", hostDetail: "Ended", message: "host notified",
                clientCode: "C5", clientDetail: "Declined", tone: .client,
                direction: .toHost, symbol: "nosign"
            ),
            content: .result(mark: .declined, title: "You declined", detail: "MIZAN-7F3A was told. You were not charged."),
            actions: [.init("Done", event: .done, symbol: "checkmark", kind: .secondary, isEnabled: true)]
        )),
        ("s3-waiting-for-the-host-m7", .init(
            eyebrow: "STEP 4 OF 4 · RESULT", pill: .init("Waiting", tone: .client),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.done, title: "Review", detail: "Confirmed"),
                result: .init(.active, title: "Result", detail: "Waiting")
            ),
            exchange: .init(
                hostCode: "H5", hostDetail: "Processing", message: "ack received",
                clientCode: "C4", clientDetail: "Waiting", tone: .client,
                direction: .toHost, symbol: "checkmark"
            ),
            content: .processing(amount: "124.50", rows: [
                .init("Confirmed", detail: "YOU · 124.50", symbol: "checkmark", isComplete: true),
                .init("Acknowledged", detail: "HOST · RECEIVED", symbol: "checkmark", isComplete: true),
                .init("Waiting for host", detail: "PROCESSING PAYMENT", symbol: "rays", isComplete: false),
            ]),
            actions: []
        )),
        ("s4-the-host-cancelled", .init(
            eyebrow: "STEP 3 OF 4 · REVIEW", pill: .init("Cancelled", tone: .idle),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.failed, title: "Review", detail: "Cancelled"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H6", hostDetail: "Ended", message: "cancelled",
                clientCode: "C5", clientDetail: "Cancelled", tone: .host,
                direction: .toClient, symbol: "nosign"
            ),
            content: .result(mark: .declined, title: "Host cancelled", detail: "MIZAN-7F3A cancelled the request. You were not charged."),
            actions: [.init("Done", event: .done, symbol: "checkmark", kind: .secondary, isEnabled: true)]
        )),
        ("s5-paid-m8", .init(
            eyebrow: "COMPLETE", pill: .init("Paid", tone: .ok),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.done, title: "Review", detail: "Confirmed"),
                result: .init(.done, title: "Result", detail: "Paid")
            ),
            exchange: .init(
                hostCode: "H6", hostDetail: "Done", message: "success",
                clientCode: "C5", clientDetail: "Done", tone: .ok,
                direction: .toClient, symbol: "checkmark.seal"
            ),
            content: .paid(title: "Paid", amount: "124.50", detail: "to MIZAN-7F3A"),
            actions: [.init("Done", event: .done, symbol: "checkmark", kind: .secondary, isEnabled: true)]
        )),
        ("s6-payment-failed-m9", .init(
            eyebrow: "STEP 4 OF 4 · RESULT", pill: .init("Failed", tone: .bad),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.done, title: "Review", detail: "Confirmed"),
                result: .init(.failed, title: "Result", detail: "Failed")
            ),
            exchange: .init(
                hostCode: "H6", hostDetail: "Done", message: "failure",
                clientCode: "C5", clientDetail: "Done", tone: .bad,
                direction: .toClient, symbol: "xmark.seal"
            ),
            content: .result(mark: .failure, title: "Payment failed", detail: "MIZAN-7F3A could not process 124.50. You were not charged."),
            actions: [.init("Done", event: .done, symbol: "checkmark", kind: .secondary, isEnabled: true)]
        )),
        ("s7-link-lost-before-a-result", .init(
            eyebrow: "STEP 4 OF 4 · RESULT", pill: .init("Link lost", tone: .bad),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.done, title: "Review", detail: "Confirmed"),
                result: .init(.failed, title: "Result", detail: "Unknown")
            ),
            exchange: .init(
                hostCode: "H5", hostDetail: "Processing", message: "link lost",
                clientCode: "C5", clientDetail: "Unknown", tone: .bad,
                direction: .toClient, symbol: "antenna.radiowaves.left.and.right.slash"
            ),
            content: .result(mark: .linkLost, title: "Result unknown", detail: "The link to MIZAN-7F3A was lost before a result arrived. Check with the host before paying again."),
            actions: [.init("Done", event: .done, symbol: "checkmark", kind: .secondary, isEnabled: true)]
        )),
        ("s8-link-lost-with-nothing-charged", .init(
            eyebrow: "STEP 3 OF 4 · REVIEW", pill: .init("Link lost", tone: .bad),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.failed, title: "Review", detail: "Link lost"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H4", hostDetail: "Awaiting client", message: "link lost",
                clientCode: "C5", clientDetail: "Ended", tone: .bad,
                direction: .toClient, symbol: "antenna.radiowaves.left.and.right.slash"
            ),
            content: .result(mark: .linkLost, title: "Link lost", detail: "The link to MIZAN-7F3A was lost. You were not charged."),
            actions: [.init("Done", event: .done, symbol: "checkmark", kind: .secondary, isEnabled: true)]
        )),
        ("s9-a-confirm-on-its-way", .init(
            eyebrow: "STEP 3 OF 4 · REVIEW", pill: .init("Sending", tone: .client),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.active, title: "Review", detail: "Sending"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H4", hostDetail: "Awaiting client", message: "confirm",
                clientCode: "C3", clientDetail: "Sending", tone: .client,
                direction: .toHost, symbol: "paperplane"
            ),
            content: .result(mark: .declined, title: "Sending confirm", detail: "Your confirm is on its way to MIZAN-7F3A."),
            actions: [.init("Done", event: .done, symbol: "checkmark", kind: .secondary, isEnabled: false)]
        )),
        ("s10-a-decline-on-its-way", .init(
            eyebrow: "STEP 3 OF 4 · REVIEW", pill: .init("Sending", tone: .client),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.active, title: "Review", detail: "Sending"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H4", hostDetail: "Awaiting client", message: "decline",
                clientCode: "C3", clientDetail: "Sending", tone: .client,
                direction: .toHost, symbol: "nosign"
            ),
            content: .result(mark: .declined, title: "Sending decline", detail: "Your decline is on its way to MIZAN-7F3A."),
            actions: [.init("Done", event: .done, symbol: "checkmark", kind: .secondary, isEnabled: false)]
        )),
        ("s12-the-host-cancelled-as-i-confirmed", .init(
            eyebrow: "STEP 3 OF 4 · REVIEW", pill: .init("Cancelled", tone: .idle),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.failed, title: "Review", detail: "Cancelled"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H6", hostDetail: "Ended", message: "cancelled",
                clientCode: "C5", clientDetail: "Cancelled", tone: .host,
                direction: .toClient, symbol: "nosign"
            ),
            content: .result(mark: .declined, title: "Host cancelled", detail: "MIZAN-7F3A cancelled the request. You were not charged."),
            actions: [.init("Done", event: .done, symbol: "checkmark", kind: .secondary, isEnabled: true)]
        )),
        ("s13-paid-to-a-host-with-no-name", .init(
            eyebrow: "COMPLETE", pill: .init("Paid", tone: .ok),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.done, title: "Review", detail: "Confirmed"),
                result: .init(.done, title: "Result", detail: "Paid")
            ),
            exchange: .init(
                hostCode: "H6", hostDetail: "Done", message: "success",
                clientCode: "C5", clientDetail: "Done", tone: .ok,
                direction: .toClient, symbol: "checkmark.seal"
            ),
            content: .paid(title: "Paid", amount: "124.50", detail: "to Mizan till"),
            actions: [.init("Done", event: .done, symbol: "checkmark", kind: .secondary, isEnabled: true)]
        )),
        ("s14-the-host-cancelled-as-i-declined", .init(
            eyebrow: "STEP 3 OF 4 · REVIEW", pill: .init("Cancelled", tone: .idle),
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.done, title: "Connect", detail: "Link secure"),
                review: .init(.failed, title: "Review", detail: "Cancelled"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H6", hostDetail: "Ended", message: "cancelled",
                clientCode: "C5", clientDetail: "Cancelled", tone: .host,
                direction: .toClient, symbol: "nosign"
            ),
            content: .result(mark: .declined, title: "Host cancelled", detail: "MIZAN-7F3A cancelled the request. You were not charged."),
            actions: [.init("Done", event: .done, symbol: "checkmark", kind: .secondary, isEnabled: true)]
        )),
    ]
}

private struct ClientPaymentPreview: View {
    let index: Int
    let scheme: ColorScheme

    var body: some View {
        ClientPaymentView(state: ClientPaymentState.previews[index].state, event: { _ in })
            .frame(width: 393, height: 852)
            .environment(\.colorScheme, scheme)
    }
}

#Preview("s1-reviewing-m5 · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 0, scheme: .light)
}

#Preview("s1-reviewing-m5 · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 0, scheme: .dark)
}

#Preview("s2-declined-m6 · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 1, scheme: .light)
}

#Preview("s2-declined-m6 · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 1, scheme: .dark)
}

#Preview("s3-waiting-for-the-host-m7 · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 2, scheme: .light)
}

#Preview("s3-waiting-for-the-host-m7 · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 2, scheme: .dark)
}

#Preview("s4-the-host-cancelled · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 3, scheme: .light)
}

#Preview("s4-the-host-cancelled · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 3, scheme: .dark)
}

#Preview("s5-paid-m8 · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 4, scheme: .light)
}

#Preview("s5-paid-m8 · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 4, scheme: .dark)
}

#Preview("s6-payment-failed-m9 · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 5, scheme: .light)
}

#Preview("s6-payment-failed-m9 · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 5, scheme: .dark)
}

#Preview("s7-link-lost-before-a-result · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 6, scheme: .light)
}

#Preview("s7-link-lost-before-a-result · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 6, scheme: .dark)
}

#Preview("s8-link-lost-with-nothing-charged · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 7, scheme: .light)
}

#Preview("s8-link-lost-with-nothing-charged · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 7, scheme: .dark)
}

#Preview("s9-a-confirm-on-its-way · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 8, scheme: .light)
}

#Preview("s9-a-confirm-on-its-way · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 8, scheme: .dark)
}

#Preview("s10-a-decline-on-its-way · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 9, scheme: .light)
}

#Preview("s10-a-decline-on-its-way · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 9, scheme: .dark)
}

#Preview("s12-the-host-cancelled-as-i-confirmed · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 10, scheme: .light)
}

#Preview("s12-the-host-cancelled-as-i-confirmed · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 10, scheme: .dark)
}

#Preview("s13-paid-to-a-host-with-no-name · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 11, scheme: .light)
}

#Preview("s13-paid-to-a-host-with-no-name · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 11, scheme: .dark)
}

#Preview("s14-the-host-cancelled-as-i-declined · light", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 12, scheme: .light)
}

#Preview("s14-the-host-cancelled-as-i-declined · dark", traits: .sizeThatFitsLayout) {
    ClientPaymentPreview(index: 12, scheme: .dark)
}
