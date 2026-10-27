import DesignSystem

/// A presentation value: all copy and countdown values come from the caller.
public struct HostState: Equatable, Sendable {
    public struct Step: Equatable, Sendable {
        public var state: StepState
        public var title: String
        public var detail: String

        public init(_ state: StepState, title: String, detail: String) {
            self.state = state
            self.title = title
            self.detail = detail
        }

        var sessionStep: SessionStep { .init(state, title: title, detail: detail) }
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

    public enum Panel: Equatable, Sendable {
        case keypad(rows: [[HostAction]])
        case countdown(Countdown, title: String, detail: String)
        case connection(title: String, detail: String, secondsRemaining: String? = nil)
        case result(Outcome, title: String)
        case processor(eyebrow: String, title: String)
    }

    /// The caller supplies the ring's label and remaining share; the view runs no timer.
    public struct Countdown: Equatable, Sendable {
        public var seconds: String
        public var caption: String
        public var accessibilityLabel: String
        public var fraction: Double

        public init(seconds: String, caption: String, accessibilityLabel: String, fraction: Double) {
            self.seconds = seconds
            self.caption = caption
            self.accessibilityLabel = accessibilityLabel
            self.fraction = fraction
        }
    }

    public struct Notice: Equatable, Sendable {
        public var title: String
        public var detail: String
        public var symbol: String
        public var isFailure: Bool

        public init(title: String, detail: String, symbol: String, isFailure: Bool) {
            self.title = title
            self.detail = detail
            self.symbol = symbol
            self.isFailure = isFailure
        }
    }

    public var eyebrow: String
    public var status: String
    public var statusTone: StatusPill.State
    public var deviceCode: String
    public var deviceMeta: String
    public var steps: [Step]
    public var amountTitle: String
    public var amount: String
    public var explanation: String
    public var exchange: Exchange
    public var panel: Panel
    public var buttons: [HostAction]
    public var notice: Notice?
    public var isSettingsEnabled: Bool
    public var isAmountMuted: Bool
    public var accent: Message.Tone

    public init(
        eyebrow: String, status: String, statusTone: StatusPill.State,
        deviceCode: String, deviceMeta: String, steps: [Step],
        amountTitle: String, amount: String, explanation: String,
        exchange: Exchange, panel: Panel, buttons: [HostAction], notice: Notice? = nil,
        isSettingsEnabled: Bool, isAmountMuted: Bool = false, accent: Message.Tone = .host
    ) {
        self.eyebrow = eyebrow
        self.status = status
        self.statusTone = statusTone
        self.deviceCode = deviceCode
        self.deviceMeta = deviceMeta
        self.steps = steps
        self.amountTitle = amountTitle
        self.amount = amount
        self.explanation = explanation
        self.exchange = exchange
        self.panel = panel
        self.buttons = buttons
        self.notice = notice
        self.isSettingsEnabled = isSettingsEnabled
        self.isAmountMuted = isAmountMuted
        self.accent = accent
    }
}
