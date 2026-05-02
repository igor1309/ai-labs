@testable import NotioApp

struct NoOpCaptureFeedbackMessenger: CaptureFeedbackMessenger {
    func send(chatId: Int, feedback: Feedback) async {}
}
