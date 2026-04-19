import Logging

public enum Feedback: Equatable, Sendable {
    case receipt
    case success(CapturedItem)
    case failure

    var logLabel: String {
        switch self {
        case .receipt: "receipt"
        case .success(let item):
            switch item.kind {
            case .note: "success_note"
            case .link: "success_link"
            }
        case .failure: "failure"
        }
    }
}

public protocol CaptureFeedbackMessenger: Sendable {
    func send(chatId: Int, feedback: Feedback) async
}

public struct TelegramCaptureFeedbackMessenger: CaptureFeedbackMessenger, Sendable {

    private let sender: any MessageSender
    private let logger: Logger

    public init(sender: any MessageSender, logger: Logger) {
        self.sender = sender
        self.logger = logger
    }

    public func send(chatId: Int, feedback: Feedback) async {
        let text = formatMessage(feedback)
        do {
            try await sender.send(chatId: chatId, text: text)
        } catch {
            logger.warning("feedback delivery failed", metadata: [
                "chat_id": .string("\(chatId)"),
                "feedback": .string(feedback.logLabel),
                "error": .string("\(error)"),
            ])
        }
    }

    private func formatMessage(_ feedback: Feedback) -> String {
        switch feedback {
        case .receipt:
            return "Received. Processing..."
        case .success(let item):
            switch item.kind {
            case .note:
                return "Saved note."
            case .link:
                if let title = item.capturedTitle {
                    return "Saved: \(title)"
                }
                return "Saved link."
            }
        case .failure:
            return "Failed to save. Try again later."
        }
    }
}
