import DesignSystem

/// The root supplies presentation values, including formatted names and copy.
public struct ClientState: Equatable, Sendable {
    public struct Steps: Equatable, Sendable {
        public var find: SessionStep
        public var connect: SessionStep
        public var review: SessionStep
        public var result: SessionStep

        public init(find: SessionStep, connect: SessionStep, review: SessionStep, result: SessionStep) {
            self.find = find
            self.connect = connect
            self.review = review
            self.result = result
        }

        var sessionSteps: [SessionStep] { [find, connect, review, result] }
    }

    public struct Exchange: Equatable, Sendable {
        public var hostCode: String
        public var hostDetail: String
        public var message: String
        public var clientCode: String
        public var clientDetail: String
        public var tone: Message.Tone
        public var direction: Message.Direction
        public var symbol: String

        public init(
            hostCode: String, hostDetail: String, message: String,
            clientCode: String, clientDetail: String, tone: Message.Tone,
            direction: Message.Direction, symbol: String
        ) {
            self.hostCode = hostCode
            self.hostDetail = hostDetail
            self.message = message
            self.clientCode = clientCode
            self.clientDetail = clientDetail
            self.tone = tone
            self.direction = direction
            self.symbol = symbol
        }
    }

    public enum Icon: Equatable, Sendable {
        case bluetooth(isSlashed: Bool)
        case system(String, rotation: Double = 0)
    }

    public enum Content: Equatable, Sendable {
        case discovery(icon: Icon, isInRange: Bool)
        case connectionFailure
    }

    public struct Action: Equatable, Sendable {
        public var title: String
        public var event: ClientEvent
        public var icon: Icon
        public var kind: ActionButtonStyle.Kind
        public var isEnabled: Bool

        public init(
            _ title: String, event: ClientEvent, icon: Icon,
            kind: ActionButtonStyle.Kind, isEnabled: Bool
        ) {
            self.title = title
            self.event = event
            self.icon = icon
            self.kind = kind
            self.isEnabled = isEnabled
        }
    }

    public var eyebrow: String
    public var status: String
    public var statusTone: StatusPill.State
    public var steps: Steps
    public var exchange: Exchange
    public var title: String
    public var detail: String
    public var content: Content
    public var actions: [Action]

    public init(
        eyebrow: String, status: String, statusTone: StatusPill.State,
        steps: Steps, exchange: Exchange, title: String, detail: String,
        content: Content, actions: [Action]
    ) {
        self.eyebrow = eyebrow
        self.status = status
        self.statusTone = statusTone
        self.steps = steps
        self.exchange = exchange
        self.title = title
        self.detail = detail
        self.content = content
        self.actions = actions
    }
}
