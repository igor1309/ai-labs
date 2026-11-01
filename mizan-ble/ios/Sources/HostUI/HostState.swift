import DesignSystem

/// A presentation value: all copy and countdown values come from the caller.
public struct HostState: Equatable, Sendable {
    public enum PanelProjection: Equatable, Sendable { case keypad, countdown, connection, result, processor }
    public var panelProjection: PanelProjection {
        switch panel { case .keypad: .keypad; case .countdown: .countdown; case .connection: .connection; case .result: .result; case .processor: .processor }
    }
    public var noticeProjection: NoticeProjection { NoticeProjection(isPresent: notice != nil, isFailure: notice?.isFailure ?? false) }
    public struct NoticeProjection: Equatable, Sendable { let isPresent: Bool; let isFailure: Bool }
    public var toneProjection: ToneProjection { ToneProjection(status: statusTone, accent: accent, steps: steps, exchangeTone: exchange.tone, direction: exchange.direction) }
    public struct ToneProjection: Equatable, Sendable { let status: StatusPill.State; let accent: Message.Tone; let steps: [SessionStep]; let exchangeTone: Message.Tone; let direction: Message.Direction }
    public var buttonsProjection: [HostAction] { buttons }
    public typealias Exchange = ExchangeStrip.Model

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
    public var steps: [SessionStep]
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
        deviceCode: String, deviceMeta: String, steps: [SessionStep],
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
