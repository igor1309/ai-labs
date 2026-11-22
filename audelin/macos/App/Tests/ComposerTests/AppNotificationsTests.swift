import Recording
import SummaryJobs
import Testing
@testable import Composer

struct AppNotificationsTests {

    @Test func recordingStartAndStopAreAnnounced() {
        #expect(recordingNotification(from: .beginning, to: .recording) == .recordingStarted)
        #expect(recordingNotification(from: .idle, to: .recording) == .recordingStarted)
        #expect(recordingNotification(from: .recording, to: .ending) == .recordingStopped)
        #expect(recordingNotification(from: .idle, to: .beginning) == nil)
        #expect(recordingNotification(from: .ending, to: .idle) == nil)
    }

    @Test func settledNotesAreAnnouncedOnlyAfterRunning() {
        let old: [String: SummariesStage] = ["a": .noting, "b": .saving, "c": .waiting]
        let new: [String: SummariesStage] = ["a": .succeeded, "b": .failed, "c": .reading, "d": .succeeded]
        #expect(notesNotifications(from: old, to: new) == [.notesReady(call: "a"), .notesFailed(call: "b")])
    }

    @Test func recoveredAndUnchangedCallsAreSilent() {
        #expect(notesNotifications(from: ["a": .succeeded], to: ["a": .succeeded]).isEmpty)
        #expect(notesNotifications(from: ["a": .observed], to: ["a": .succeeded]).isEmpty)
        #expect(notesNotifications(from: [:], to: ["a": .succeeded]).isEmpty)
        #expect(notesNotifications(from: ["a": .recovering, "b": .recovering], to: ["a": .succeeded, "b": .failed]).isEmpty)
    }

    @Test func textFollowsLanguage() {
        #expect(AppNotification.notesReady(call: "x").content(.english).title == "Notes ready")
        #expect(AppNotification.recordingStarted.content(.russian).title == "Запись началась")
        #expect(AppNotification.recordingStopped.content(.english).id == AppNotification.recordingStarted.content(.english).id)
    }
}
