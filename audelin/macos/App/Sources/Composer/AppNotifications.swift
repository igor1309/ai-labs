import Foundation
import Observation
import os
import Recording
import SummaryJobs

/// A moment Audelin tells the person about through a macOS notification.
public enum AppNotification: Equatable, Sendable {
    case recordingStarted
    case recordingStopped
    case notesReady(call: String)
    case notesFailed(call: String)
}

/// Shown text for a notification; the app posts it.
public struct AppNotificationContent: Equatable, Sendable {
    public let id: String
    public let title: String
    public let body: String
}

extension AppNotification {
    func content(_ language: UILanguage) -> AppNotificationContent {
        let ru = language == .russian
        switch self {
        case .recordingStarted:
            return .init(id: "recording", title: ru ? "Запись началась" : "Recording started",
                         body: ru ? "Audelin записывает звонок." : "Audelin is recording the call.")
        case .recordingStopped:
            return .init(id: "recording", title: ru ? "Запись завершена" : "Recording stopped",
                         body: ru ? "Звонок сохранён." : "The call is saved.")
        case let .notesReady(call):
            return .init(id: "notes-\(call)", title: ru ? "Заметки готовы" : "Notes ready",
                         body: ru ? "Заметки по звонку \(call) готовы." : "Notes for call \(call) are ready.")
        case let .notesFailed(call):
            return .init(id: "notes-\(call)", title: ru ? "Заметки не получились" : "Notes failed",
                         body: ru ? "Не удалось сделать заметки по звонку \(call)." : "Couldn't make notes for call \(call).")
        }
    }
}

/// The notification a recording phase change calls for: one when recording starts, one when it ends.
func recordingNotification(from old: RecordingState.Phase, to new: RecordingState.Phase) -> AppNotification? {
    switch (old, new) {
    case (.idle, .recording), (.beginning, .recording): .recordingStarted
    case (.recording, .ending), (.recording, .idle): .recordingStopped
    default: nil
    }
}

/// Notes notifications for calls whose job was running and has now settled. A call that settles
/// straight out of recovery (its saved notes or a failed load at launch) was not running, so it is
/// not announced, nor is a call first seen already settled.
func notesNotifications(from old: [String: SummariesStage], to new: [String: SummariesStage]) -> [AppNotification] {
    new.keys.sorted().compactMap { call in
        guard let before = old[call], let after = new[call], before != after, !quiet(before) else { return nil }
        switch after {
        case .succeeded: return .notesReady(call: call)
        case .failed: return .notesFailed(call: call)
        default: return nil
        }
    }
}

private func quiet(_ stage: SummariesStage) -> Bool {
    switch stage {
    case .recovering, .waiting, .succeeded, .failed, .interrupted, .unavailable, .observed, .choosing, .selecting: true
    default: false
    }
}

/// Watches recording and notes, posting each notification the changes call for.
@MainActor func subscribeNotifications(
    phase: @escaping @MainActor () -> RecordingState.Phase,
    stages: @escaping @MainActor () -> [String: SummariesStage],
    post: @escaping @MainActor (AppNotification) -> Void
) -> Task<Void, Never> {
    let log = Logger(subsystem: "dev.igor1309.audelin", category: "notifications")
    return Task {
        var last = (phase(), stages())
        for await now in Observations({ (phase(), stages()) }) {
            for (call, stage) in now.1 where last.1[call] != stage {
                log.info("notes stage call=\(call, privacy: .public) from=\(last.1[call].map { "\($0)" } ?? "none", privacy: .public) to=\(String(describing: stage), privacy: .public)")
            }
            let notes = (recordingNotification(from: last.0, to: now.0).map { [$0] } ?? []) + notesNotifications(from: last.1, to: now.1)
            for note in notes {
                log.info("post \(String(describing: note), privacy: .public)")
                post(note)
            }
            last = now
        }
    }
}
