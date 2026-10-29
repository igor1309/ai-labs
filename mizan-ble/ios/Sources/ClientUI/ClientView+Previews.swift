import DesignSystem
import SwiftUI

public extension ClientState {
    static let previews: [(name: String, state: ClientState)] = [
        ("s1-no-host-nearby-m1", ClientState(
            eyebrow: "STEP 1 OF 4 · FIND",
            status: "Idle", statusTone: .idle,
            steps: .init(
                find: .init(.active, title: "Find", detail: "Searching"),
                connect: .init(.todo, title: "Connect", detail: "Secure link"),
                review: .init(.todo, title: "Review", detail: "Your call"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H1", hostDetail: "Enter amount",
                message: "no host", clientCode: "C1", clientDetail: "Ready",
                tone: .idle, direction: .toHost, symbol: "antenna.radiowaves.left.and.right"
            ),
            title: "No host nearby",
            detail: "Hold the phone near the host iPad. It appears once the host locks an amount.",
            content: .discovery(icon: .bluetooth(isSlashed: false), isInRange: false),
            actions: [.init(
                "Start handshake", event: .startHandshake, icon: .bluetooth(isSlashed: false),
                kind: .client, isEnabled: false
            )]
        )),
        ("s2-host-in-range-m2", ClientState(
            eyebrow: "STEP 1 OF 4 · FIND",
            status: "In range", statusTone: .client,
            steps: .init(
                find: .init(.active, title: "Find", detail: "Host in range"),
                connect: .init(.todo, title: "Connect", detail: "Secure link"),
                review: .init(.todo, title: "Review", detail: "Your call"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H2", hostDetail: "Advertising",
                message: "in range", clientCode: "C1", clientDetail: "Ready",
                tone: .host, direction: .toClient, symbol: "antenna.radiowaves.left.and.right"
            ),
            title: "Pay a nearby host",
            detail: "MIZAN-7F3A is in range. Start the handshake to see the amount.",
            content: .discovery(icon: .bluetooth(isSlashed: false), isInRange: true),
            actions: [.init(
                "Start handshake", event: .startHandshake, icon: .bluetooth(isSlashed: false),
                kind: .client, isEnabled: true
            )]
        )),
        ("s3-hold-closer", ClientState(
            eyebrow: "STEP 1 OF 4 · FIND",
            status: "Idle", statusTone: .idle,
            steps: .init(
                find: .init(.active, title: "Find", detail: "Searching"),
                connect: .init(.todo, title: "Connect", detail: "Secure link"),
                review: .init(.todo, title: "Review", detail: "Your call"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H1", hostDetail: "Enter amount",
                message: "no host", clientCode: "C1", clientDetail: "Ready",
                tone: .idle, direction: .toHost, symbol: "antenna.radiowaves.left.and.right"
            ),
            title: "Hold closer",
            detail: "Hold the phone right next to the host iPad, so Mizan can tell which one is yours.",
            content: .discovery(icon: .bluetooth(isSlashed: false), isInRange: false),
            actions: [.init(
                "Start handshake", event: .startHandshake, icon: .bluetooth(isSlashed: false),
                kind: .client, isEnabled: false
            )]
        )),
        ("s4-host-went-quiet-m10", ClientState(
            eyebrow: "STEP 1 OF 4 · FIND",
            status: "Idle", statusTone: .idle,
            steps: .init(
                find: .init(.active, title: "Find", detail: "Searching"),
                connect: .init(.todo, title: "Connect", detail: "Secure link"),
                review: .init(.todo, title: "Review", detail: "Your call"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H1", hostDetail: "Enter amount",
                message: "host gone", clientCode: "C1", clientDetail: "Ready",
                tone: .idle, direction: .toHost, symbol: "antenna.radiowaves.left.and.right"
            ),
            title: "Host went quiet",
            detail: "MIZAN-7F3A stopped advertising before you connected. Nothing was sent.",
            content: .discovery(icon: .bluetooth(isSlashed: true), isInRange: false),
            actions: [.init(
                "Start handshake", event: .startHandshake, icon: .bluetooth(isSlashed: false),
                kind: .client, isEnabled: false
            )]
        )),
        ("s5-connecting-m3", ClientState(
            eyebrow: "STEP 2 OF 4 · CONNECT",
            status: "Connecting", statusTone: .client,
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.active, title: "Connect", detail: "Exchanging keys"),
                review: .init(.todo, title: "Review", detail: "Your call"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H3", hostDetail: "Handshake",
                message: "handshake", clientCode: "C2", clientDetail: "Connecting",
                tone: .client, direction: .toHost, symbol: "key"
            ),
            title: "Connecting…",
            detail: "Keep the phone near the iPad until the amount appears.",
            content: .discovery(icon: .system("key", rotation: 45), isInRange: true),
            actions: [.init(
                "Cancel", event: .cancel, icon: .system("xmark"),
                kind: .secondary, isEnabled: true
            )]
        )),
        ("s6-could-not-connect-m4", ClientState(
            eyebrow: "STEP 2 OF 4 · CONNECT",
            status: "Failed", statusTone: .bad,
            steps: .init(
                find: .init(.done, title: "Find", detail: "Host found"),
                connect: .init(.failed, title: "Connect", detail: "Link lost"),
                review: .init(.todo, title: "Review", detail: "Your call"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H3", hostDetail: "Handshake",
                message: "link lost", clientCode: "C2", clientDetail: "Failed",
                tone: .bad, direction: .toHost, symbol: "link"
            ),
            title: "Couldn’t connect",
            detail: "The link to MIZAN-7F3A dropped. You were not charged.",
            content: .connectionFailure,
            actions: [.init(
                "Try again", event: .tryAgain, icon: .system("arrow.counterclockwise"),
                kind: .client, isEnabled: true
            )]
        )),
        ("s7-bluetooth-off", ClientState(
            eyebrow: "STEP 1 OF 4 · FIND",
            status: "Idle", statusTone: .idle,
            steps: .init(
                find: .init(.active, title: "Find", detail: "Searching"),
                connect: .init(.todo, title: "Connect", detail: "Secure link"),
                review: .init(.todo, title: "Review", detail: "Your call"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H1", hostDetail: "Enter amount",
                message: "no host", clientCode: "C1", clientDetail: "Ready",
                tone: .idle, direction: .toHost, symbol: "antenna.radiowaves.left.and.right"
            ),
            title: "Bluetooth is off",
            detail: "Turn on Bluetooth in Control Centre to find a nearby host.",
            content: .discovery(icon: .bluetooth(isSlashed: true), isInRange: false),
            actions: [.init(
                "Start handshake", event: .startHandshake, icon: .bluetooth(isSlashed: false),
                kind: .client, isEnabled: false
            )]
        )),
        ("s8-host-with-no-name-yet", ClientState(
            eyebrow: "STEP 1 OF 4 · FIND",
            status: "In range", statusTone: .client,
            steps: .init(
                find: .init(.active, title: "Find", detail: "Host in range"),
                connect: .init(.todo, title: "Connect", detail: "Secure link"),
                review: .init(.todo, title: "Review", detail: "Your call"),
                result: .init(.todo, title: "Result", detail: "From host")
            ),
            exchange: .init(
                hostCode: "H2", hostDetail: "Advertising",
                message: "in range", clientCode: "C1", clientDetail: "Ready",
                tone: .host, direction: .toClient, symbol: "antenna.radiowaves.left.and.right"
            ),
            title: "Pay a nearby host",
            detail: "Mizan till is in range. Start the handshake to see the amount.",
            content: .discovery(icon: .bluetooth(isSlashed: false), isInRange: true),
            actions: [.init(
                "Start handshake", event: .startHandshake, icon: .bluetooth(isSlashed: false),
                kind: .client, isEnabled: true
            )]
        )),
    ]
}

private struct ClientPreview: View {
    let state: ClientState
    let scheme: ColorScheme

    var body: some View {
        ClientView(state: state, event: { _ in })
            .frame(width: 393, height: 852)
            .environment(\.colorScheme, scheme)
            .environment(\.modeSwitch, ModeSwitchConfiguration(
                side: .client, isEnabled: true, onSelect: { _ in }
            ))
    }
}

#Preview("s1-no-host-nearby-m1 · light", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[0].state, scheme: .light)
}

#Preview("s1-no-host-nearby-m1 · dark", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[0].state, scheme: .dark)
}

#Preview("s2-host-in-range-m2 · light", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[1].state, scheme: .light)
}

#Preview("s2-host-in-range-m2 · dark", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[1].state, scheme: .dark)
}

#Preview("s3-hold-closer · light", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[2].state, scheme: .light)
}

#Preview("s3-hold-closer · dark", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[2].state, scheme: .dark)
}

#Preview("s4-host-went-quiet-m10 · light", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[3].state, scheme: .light)
}

#Preview("s4-host-went-quiet-m10 · dark", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[3].state, scheme: .dark)
}

#Preview("s5-connecting-m3 · light", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[4].state, scheme: .light)
}

#Preview("s5-connecting-m3 · dark", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[4].state, scheme: .dark)
}

#Preview("s6-could-not-connect-m4 · light", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[5].state, scheme: .light)
}

#Preview("s6-could-not-connect-m4 · dark", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[5].state, scheme: .dark)
}

#Preview("s7-bluetooth-off · light", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[6].state, scheme: .light)
}

#Preview("s7-bluetooth-off · dark", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[6].state, scheme: .dark)
}

#Preview("s8-host-with-no-name-yet · light", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[7].state, scheme: .light)
}

#Preview("s8-host-with-no-name-yet · dark", traits: .sizeThatFitsLayout) {
    ClientPreview(state: ClientState.previews[7].state, scheme: .dark)
}
