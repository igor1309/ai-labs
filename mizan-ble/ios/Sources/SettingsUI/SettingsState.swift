import DesignSystem

/// The caller supplies the offered values, selection and already formatted copy.
public struct SettingsState: Equatable, Sendable {
    public struct CountdownChoice: Equatable, Sendable {
        public var seconds: Int
        public var text: String

        public init(seconds: Int, text: String) {
            self.seconds = seconds
            self.text = text
        }
    }

    public struct Countdown: Equatable, Sendable {
        public var title: String
        public var detail: String
        public var choices: [CountdownChoice]
        public var selectedSeconds: Int
        public var selectedText: String
        public var ringSeconds: Int

        public init(
            title: String, detail: String, choices: [CountdownChoice],
            selectedSeconds: Int, selectedText: String, ringSeconds: Int
        ) {
            self.title = title
            self.detail = detail
            self.choices = choices
            self.selectedSeconds = selectedSeconds
            self.selectedText = selectedText
            self.ringSeconds = ringSeconds
        }
    }

    public struct ReadOnlyRow: Equatable, Sendable {
        public var title: String
        public var value: String

        public init(title: String, value: String) {
            self.title = title
            self.value = value
        }
    }

    public var steps: [SessionStep]
    public var eyebrow: String
    public var statusText: String
    public var deviceCode: String
    public var deviceMeta: String
    public var title: String
    public var countdown: Countdown
    public var readOnlyRows: [ReadOnlyRow]
    public var previewCaption: String
    public var doneTitle: String

    public init(
        steps: [SessionStep], eyebrow: String, statusText: String,
        deviceCode: String, deviceMeta: String, title: String,
        countdown: Countdown, readOnlyRows: [ReadOnlyRow],
        previewCaption: String, doneTitle: String
    ) {
        self.steps = steps
        self.eyebrow = eyebrow
        self.statusText = statusText
        self.deviceCode = deviceCode
        self.deviceMeta = deviceMeta
        self.title = title
        self.countdown = countdown
        self.readOnlyRows = readOnlyRows
        self.previewCaption = previewCaption
        self.doneTitle = doneTitle
    }
}
