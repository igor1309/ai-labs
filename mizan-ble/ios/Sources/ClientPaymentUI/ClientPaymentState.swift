import DesignSystem

/// Presentation values supplied by the caller, including all formatted copy.
public struct ClientPaymentState: Equatable, Sendable {
    public struct Step: Equatable, Sendable {
        public var state: StepState
        public var title: String
        public var detail: String

        public init(_ state: StepState, title: String, detail: String) {
            self.state = state
            self.title = title
            self.detail = detail
        }
    }

    public struct Steps: Equatable, Sendable {
        public var find: Step
        public var connect: Step
        public var review: Step
        public var result: Step

        public init(find: Step, connect: Step, review: Step, result: Step) {
            self.find = find
            self.connect = connect
            self.review = review
            self.result = result
        }
    }

    public struct Pill: Equatable, Sendable {
        public var title: String
        public var tone: StatusPill.State

        public init(_ title: String, tone: StatusPill.State) {
            self.title = title
            self.tone = tone
        }
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

    public struct ReceiptRow: Equatable, Sendable {
        public var title: String
        public var detail: String
        public var symbol: String
        public var isComplete: Bool

        public init(_ title: String, detail: String, symbol: String, isComplete: Bool) {
            self.title = title
            self.detail = detail
            self.symbol = symbol
            self.isComplete = isComplete
        }
    }

    public enum Content: Equatable, Sendable {
        case review(title: String, amount: String, detail: String)
        case result(mark: Outcome, title: String, detail: String)
        case processing(amount: String, rows: [ReceiptRow])
        case paid(title: String, amount: String, detail: String)
    }

    public struct Action: Equatable, Sendable {
        public var title: String
        public var event: ClientPaymentEvent
        public var symbol: String
        public var kind: ActionButtonStyle.Kind
        public var isEnabled: Bool

        public init(
            _ title: String, event: ClientPaymentEvent, symbol: String,
            kind: ActionButtonStyle.Kind, isEnabled: Bool
        ) {
            self.title = title
            self.event = event
            self.symbol = symbol
            self.kind = kind
            self.isEnabled = isEnabled
        }
    }

    public var eyebrow: String
    public var pill: Pill
    public var steps: Steps
    public var exchange: Exchange
    public var content: Content
    public var actions: [Action]

    public init(
        eyebrow: String, pill: Pill, steps: Steps, exchange: Exchange,
        content: Content, actions: [Action]
    ) {
        self.eyebrow = eyebrow
        self.pill = pill
        self.steps = steps
        self.exchange = exchange
        self.content = content
        self.actions = actions
    }
}
