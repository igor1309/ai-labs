import Composer
import Foundation
import UserNotifications
import os

/// Posts Audelin's notifications through macOS Notification Center.
/// Only a bundled app may use Notification Center: a bare executable posts nothing.
@MainActor final class SystemNotifications {

    private let center: UNUserNotificationCenter?
    private var authorization: Task<Bool, Never>?

    init(bundle: URL) {
        center = bundle.pathExtension == "app" ? UNUserNotificationCenter.current() : nil
    }

    func post(_ content: AppNotificationContent) {
        guard let center else { return }
        let authorization = authorization ?? Task {
            (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        }
        self.authorization = authorization
        Task {
            guard await authorization.value else { return }
            let body = UNMutableNotificationContent()
            body.title = content.title
            body.body = content.body
            // Same id replaces the earlier one: a stop replaces its start, a retry its failure.
            let request = UNNotificationRequest(identifier: content.id, content: body, trigger: nil)
            do { try await center.add(request) } catch {
                Logger(subsystem: "dev.igor1309.audelin", category: "notifications").error("post failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
