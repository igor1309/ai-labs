import SwiftUI

/// Every component on the design's ground, laid out like the design file's
/// "Mizan · Design System" frame, to compare the two by eye.
public struct DesignSystemGallery: View {

    public init() {}

    public var body: some View {

        VStack(alignment: .leading, spacing: Tokens.space12) {
            typeScale
            section("SIGN & AMOUNT") {
                HStack(alignment: .center, spacing: Tokens.space12) {
                    MizanSign().fill(Tokens.text).frame(width: 72.63, height: 138.25)
                    ForEach(AmountView.Size.allCases, id: \.self) { AmountView("124.50", size: $0) }
                }
            }
            section("MODE HEADER") {
                HStack(alignment: .top, spacing: Tokens.space12) {
                    ModeHeader(side: .host, layout: .rail) { _ in }
                    ModeHeader(side: .client, layout: .bar) { _ in }.frame(width: 353)
                }
            }
            section("BUTTONS") {
                Grid(horizontalSpacing: Tokens.space4, verticalSpacing: Tokens.space4) {
                    GridRow {
                        button("Lock & broadcast", "lock", .host)
                        button("Start handshake", "antenna.radiowaves.left.and.right", .client)
                        button("Success", "checkmark.circle", .success)
                    }
                    GridRow {
                        button("Failure", "xmark.circle", .failure)
                        button("Decline", "xmark", .decline)
                        button("Cancel", "xmark", .secondary)
                    }
                }
                .frame(width: 932)
            }
            flowComponents
            section("COUNTDOWN & RESULT") {
                HStack(alignment: .center, spacing: Tokens.space12) {
                    CountdownRing(secondsLeft: 47, total: 60, side: .host)
                    VStack(spacing: Tokens.space4) {
                        HStack(spacing: Tokens.space4) {
                            ForEach(Outcome.allCases, id: \.self) { ResultMark($0) }
                        }
                    }
                    ResultCard(.success, title: "Payment approved") {
                        button("New amount", "plus", .host)
                    }
                    .frame(width: 320)
                }
            }
            shells
        }
        .frame(width: 1635, alignment: .leading)
        .padding(Tokens.space18)
        .background(Tokens.ground)
    }

    private var typeScale: some View {
        section("TYPE") {
            ForEach(TypeRole.allCases, id: \.self) { role in
                HStack(spacing: Tokens.space8) {
                    VStack(alignment: .leading, spacing: Tokens.space1) {
                        Text(String(describing: role)).font(Tokens.text(Tokens.sizeSmall, .semibold))
                            .foregroundStyle(Tokens.text)
                        Text("\(role.family) · \(Int(role.size)) / \(Int(role.weight.rawValue))")
                            .font(Tokens.mono(Tokens.sizeEyebrow, .regular)).foregroundStyle(Tokens.text2)
                    }
                    .frame(width: 260, alignment: .leading)
                    Text(sample(role)).typeRole(role)
                    Spacer(minLength: 0)
                }
                .padding(.vertical, Tokens.space4)
                .overlay(alignment: .bottom) { Rectangle().fill(Tokens.lineSoft).frame(height: 1) }
            }
        }
    }

    private var flowComponents: some View {
        VStack(alignment: .leading, spacing: Tokens.space12) {
            section("STATE & KEYPAD") {
                HStack(spacing: Tokens.space4) {
                    StatusPill("Idle")
                    StatusPill("Advertising", state: .host)
                    StatusPill("Connected", state: .client)
                    StatusPill("Approved", state: .ok)
                    StatusPill("Failed", state: .bad)
                    KeypadKey("7") {}
                    KeypadKey(systemImage: "delete.left", accessibilityLabel: "Delete") {}
                }
            }
            HStack(alignment: .top, spacing: Tokens.space12) {
                section("HOST RAIL") {
                    HostRail(Self.hostSteps).frame(width: 244)
                    HostRailStep(.init(.failed, title: "Handshake", detail: "Link lost"), number: 3)
                        .frame(width: 244)
                }
                VStack(alignment: .leading, spacing: Tokens.space12) {
                    section("CLIENT STEPPER") {
                        ClientStepper(Self.clientSteps).frame(width: 353)
                        ClientStepperStep(.init(.failed, title: "Review", detail: "Stopped"), number: 3)
                            .frame(width: 140)
                    }
                    section("CHIPS & EXCHANGE") {
                        HStack(spacing: Tokens.space4) {
                            DeviceChip(.host, code: "H2", state: "Advertising")
                            DeviceChip(.client, code: "C1", state: "Ready")
                            DeviceChip(.empty, code: "C —")
                        }
                        ForEach(Message.Direction.allCases, id: \.self) { direction in
                            HStack(spacing: Tokens.space4) {
                                ForEach(Message.Tone.allCases, id: \.self) { tone in
                                    Message(String(describing: tone), direction: direction, tone: tone)
                                }
                            }
                        }
                        ExchangeStrip(
                            host: DeviceChip(.host, code: "H2", state: "Advertising"),
                            message: Message("advertise · on lock"),
                            client: DeviceChip(.client, code: "C1", state: "Ready")
                        ).frame(width: 560)
                    }
                }
            }
        }
    }

    private var shells: some View {
        section("SHELLS") {
            HStack(alignment: .top, spacing: Tokens.space12) {
                IPadShell(
                    eyebrow: "STEP 2 OF 5 · ADVERTISE", status: StatusPill("Idle"),
                    deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · 60 s",
                    onSwitch: { _ in }, onSettings: {}
                ) {
                    HostRail(Self.hostSteps)
                } content: {
                    Text("Stage content").typeRole(.body)
                }
                .frame(width: 1194, height: 834)
                IPhoneShell(
                    eyebrow: "STEP 1 OF 4 · FIND", status: StatusPill("Idle"), onSwitch: { _ in }
                ) {
                    ClientStepper(Self.clientSteps)
                } content: {
                    Text("Stage content").typeRole(.body)
                }
                .frame(width: 393, height: 852)
            }
        }
    }

    private static let hostSteps: [SessionStep] = [
        .init(.done, title: "Amount", detail: "124.50 locked"),
        .init(.active, title: "Advertise", detail: "47 s left"),
        .init(.todo, title: "Handshake", detail: "Keys + amount"),
        .init(.todo, title: "Client approval", detail: "On their iPhone"),
        .init(.todo, title: "Process", detail: "Mock processor"),
    ]

    private static let clientSteps: [SessionStep] = [
        .init(.done, title: "Find", detail: "MIZAN-7F3A"),
        .init(.active, title: "Connect", detail: "Secure link"),
        .init(.todo, title: "Review", detail: "Your call"),
        .init(.todo, title: "Result", detail: "From host"),
    ]

    private func sample(_ role: TypeRole) -> String {
        switch role {
        case .hero: "Beacon · Exchange"
        case .display: "Host and client, side by side"
        case .heading: "Client reviews"
        case .title: "Pay a nearby host"
        case .lead: "Waiting for a client"
        case .label: "Client approval"
        case .labelS: "Advertising countdown"
        case .body: "Confirming locks the amount and broadcasts it for 60 seconds."
        case .small: "On their iPhone"
        case .micro: "Secure link"
        case .eyebrow: "STEP 1 OF 5 · AMOUNT"
        case .code: "H2  C1  MIZAN-7F3A"
        case .keypad: "7 8 9"
        case .ring: "47"
        case .wordmark: "Mizan"
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {

        VStack(alignment: .leading, spacing: Tokens.space6) {
            Text(title)
                .font(Tokens.mono(Tokens.sizeEyebrow, .medium))
                .tracking(1.5)
                .foregroundStyle(Tokens.text3)
            content()
        }
    }

    private func button(_ title: String, _ symbol: String, _ kind: ActionButtonStyle.Kind) -> some View {

        Button {} label: { Label(title, systemImage: symbol) }
            .buttonStyle(.action(kind))
            .frame(width: 300)
    }
}

#Preview(traits: .sizeThatFitsLayout) {
    DesignSystemGallery()
}
