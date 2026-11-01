import DesignSystem

/// Presentation values supplied by the caller, including all formatted copy.
public struct ClientPaymentState: Equatable, Sendable {
    public enum ContentProjection: Equatable, Sendable { case review, processing, paid, result }
    public var contentProjection: ContentProjection {
        switch content { case .review: .review; case .processing: .processing; case .paid: .paid; case .result: .result }
    }
    public var actionsProjection: [Action] { actions }
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
    }

    public struct Pill: Equatable, Sendable {
        public var title: String
        public var tone: StatusPill.State

        public init(_ title: String, tone: StatusPill.State) {
            self.title = title
            self.tone = tone
        }
    }

    public typealias Exchange = ExchangeStrip.Model

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
        public var id: String { "\(title)-\(String(describing: event))" }

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
