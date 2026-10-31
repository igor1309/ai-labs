import SwiftUI

public struct DeviceChip: View {
    public enum Kind: CaseIterable, Sendable {
        case host, client, empty

        public var color: Color {
            switch self {
            case .host: Tokens.host
            case .client: Tokens.client
            case .empty: Tokens.text2
            }
        }
    }

    let kind: Kind
    let code: String
    let state: String

    public init(_ kind: Kind, code: String, state: String = "") {
        self.kind = kind
        self.code = code
        self.state = state
    }

    public var body: some View {
        HStack(spacing: Tokens.space2) {
            if kind == .empty {
                Circle().strokeBorder(Tokens.lineStrong, lineWidth: 1.5)
                    .frame(width: Tokens.space3, height: Tokens.space3)
            }
            Text(code)
                .font(Tokens.mono(Tokens.sizeSmall, kind == .empty ? .regular : .bold))
                .foregroundStyle(kind.color)
            if kind != .empty {
                Text(state).font(Tokens.text(Tokens.sizeSmall, .medium)).foregroundStyle(Tokens.text)
            }
        }
        .padding(.vertical, Tokens.space2)
        .padding(.horizontal, kind == .empty ? Tokens.space1 : Tokens.space3)
        .background(kind == .empty ? .clear : Tokens.raised, in: Capsule())
        .overlay {
            if kind != .empty { Capsule().strokeBorder(kind.color, lineWidth: 1.5) }
        }
        .fixedSize()
        .accessibilityElement(children: .combine)
    }
}

public struct Message: View {
    public enum Direction: CaseIterable, Sendable {
        case toClient, toHost

        var arrowSymbol: String { self == .toClient ? "chevron.right" : "chevron.left" }
    }

    public enum Tone: CaseIterable, Sendable {
        case idle, host, client, ok, bad

        public var color: Color {
            switch self {
            case .idle: Tokens.text2
            case .host: Tokens.host
            case .client: Tokens.client
            case .ok: Tokens.ok
            case .bad: Tokens.bad
            }
        }

        var arrowColor: Color { self == .idle ? Tokens.lineStrong : color }
        var labelColor: Color { self == .idle ? Tokens.text2 : Tokens.textBody }
    }

    let title: String
    let direction: Direction
    let tone: Tone
    let systemImage: String
    let width: CGFloat?

    public init(
        _ title: String, direction: Direction = .toClient,
        tone: Tone = .idle, systemImage: String = "antenna.radiowaves.left.and.right",
        width: CGFloat? = 240
    ) {
        self.title = title
        self.direction = direction
        self.tone = tone
        self.systemImage = systemImage
        self.width = width
    }

    public var body: some View {
        contents.frame(width: width)
    }

    var contents: some View {
        VStack(spacing: Tokens.space1) {
            HStack(spacing: Tokens.space2) {
                Image(systemName: systemImage).font(.system(size: 13)).foregroundStyle(tone.color)
                    .frame(width: 13, height: 13)
                Text(title).font(Tokens.mono(Tokens.sizeEyebrow, .regular)).foregroundStyle(tone.labelColor)
            }
            .frame(maxWidth: .infinity, alignment: direction == .toClient ? .leading : .trailing)
            HStack(spacing: 0) {
                if direction == .toHost { arrowHead }
                Rectangle().fill(tone.arrowColor).frame(height: 2)
                if direction == .toClient { arrowHead }
            }
        }
        .padding(.horizontal, Tokens.space1)
        .accessibilityElement(children: .combine)
        .accessibilityValue(direction == .toClient ? "To client" : "To host")
    }

    private var arrowHead: some View {
        Image(systemName: direction.arrowSymbol).font(.system(size: 16))
            .foregroundStyle(tone.arrowColor).frame(width: 16, height: 16)
            .accessibilityHidden(true)
    }
}

public struct ExchangeStrip: View {

    /// What the strip shows: the two devices and the message between them.
    public struct Model: Equatable, Sendable {
        public var hostCode: String
        public var hostDetail: String
        public var message: String
        public var clientCode: String
        public var clientDetail: String
        public var tone: Message.Tone
        public var direction: Message.Direction
        public var symbol: String
        public var clientIsEmpty: Bool

        public init(
            hostCode: String, hostDetail: String, message: String,
            clientCode: String, clientDetail: String, tone: Message.Tone,
            direction: Message.Direction, symbol: String, clientIsEmpty: Bool = false
        ) {
            self.hostCode = hostCode
            self.hostDetail = hostDetail
            self.message = message
            self.clientCode = clientCode
            self.clientDetail = clientDetail
            self.tone = tone
            self.direction = direction
            self.symbol = symbol
            self.clientIsEmpty = clientIsEmpty
        }
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let host: DeviceChip
    let message: Message
    let client: DeviceChip
    let isCompact: Bool

    public init(host: DeviceChip, message: Message, client: DeviceChip, isCompact: Bool = false) {
        self.host = host
        self.message = message
        self.client = client
        self.isCompact = isCompact
    }

    public init(_ model: Model, isCompact: Bool = false) {
        self.init(
            host: DeviceChip(.host, code: model.hostCode, state: model.hostDetail),
            message: Message(model.message, direction: model.direction, tone: model.tone, systemImage: model.symbol),
            client: DeviceChip(model.clientIsEmpty ? .empty : .client, code: model.clientCode, state: model.clientDetail),
            isCompact: isCompact
        )
    }

    public var body: some View {
        Group {
            if isCompact {
                VStack(spacing: Tokens.space1) {
                    HStack(spacing: Tokens.space2) {
                        host
                        Spacer(minLength: .zero)
                        client
                    }
                    message.contents
                }
            } else {
                HStack(spacing: Tokens.space2) {
                    host
                    message.contents.frame(maxWidth: .infinity)
                    client
                }
            }
        }
        .lineLimit(1)
        .padding(.vertical, isCompact ? Tokens.space1 : Tokens.space3)
        .overlay(alignment: .top) { Rectangle().fill(Tokens.lineSoft).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Tokens.lineSoft).frame(height: 1) }
        // Chips and message change together, so the whole strip takes its new
        // layout at once and fades in.
        .fadesIn(on: [host.code, host.state, message.title, client.code, client.state])
        .animation(Motion.fast(reduced: reduceMotion).animation, value: host.code)
        .animation(Motion.fast(reduced: reduceMotion).animation, value: host.state)
        .animation(Motion.fast(reduced: reduceMotion).animation, value: message.title)
        .animation(Motion.fast(reduced: reduceMotion).animation, value: message.tone)
        .animation(Motion.fast(reduced: reduceMotion).animation, value: client.code)
        .animation(Motion.fast(reduced: reduceMotion).animation, value: client.state)
    }
}
