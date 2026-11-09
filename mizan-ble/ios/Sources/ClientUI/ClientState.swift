import DesignSystem

/// The root supplies presentation values, including formatted names and copy.
public struct ClientState: Equatable, Sendable {
    public enum ContentProjection: Equatable, Sendable { case discovery, connectionFailure }
    public var contentProjection: ContentProjection { if case .discovery = content { .discovery } else { .connectionFailure } }
    public var actionsProjection: [Action] { actions }
    public var rangeProjection: Bool { if case .discovery(_, true) = content { true } else { false } }
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

    public typealias Exchange = ExchangeStrip.Model

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
        public var id: String { "\(title)-\(String(describing: event))" }

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
    public var signal: SignalMeter.Model

    public init(
        eyebrow: String, status: String, statusTone: StatusPill.State,
        steps: Steps, exchange: Exchange, title: String, detail: String,
        content: Content, actions: [Action], signal: SignalMeter.Model = .noSignal
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
        self.signal = signal
    }
}
