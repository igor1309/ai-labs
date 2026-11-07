import Foundation
import Recording
import Testing
@testable import Composer

@MainActor @Suite struct FolderMoveTests {
    @Test func moveMachineConfirmsPreventsDuplicatesAndRetainsRetryDestination() async {
        let destination = URL(fileURLWithPath: "/synthetic")
        let (confirming, choice) = reduceFolderMove(.init(), .choose(destination))
        #expect(confirming.phase == .confirming)
        #expect(choice == nil)
        let (moving, effect) = reduceFolderMove(confirming, .confirm)
        #expect(moving.phase == .moving)
        #expect(reduceFolderMove(moving, .confirm).1 == nil)
        #expect(reduceFolderMove(moving, .cancel).0 == moving)
        var released = 0, moved = 0
        let handler = FolderMoveHandler(reserve: { true }, release: { released += 1 }, move: { _ in moved += 1; throw ScriptFailure.failed })
        let failedEvent = await handler.handle(effect!)
        let failed = reduceFolderMove(moving, failedEvent).0
        #expect(failed.phase == .failed)
        #expect(failed.destination == destination)
        #expect(released == 1 && moved == 1)
        #expect(reduceFolderMove(failed, .confirm).0.phase == .moving)
    }
    @Test func recordingReservationIsAtomicAndBlocksManualAndAutomaticStarts() {
        let given = RecordingState(automatic: true, missing: [])
        let reserved = RecordingReducer.reduce(given, .reserveStorage)
        #expect(reserved.storageReserved)
        #expect(RecordingReducer.reduce(reserved, .userStart).phase == .idle)
        #expect(RecordingReducer.reduce(reserved, .callStarted).phase == .idle)
        let released = RecordingReducer.reduce(reserved, .releaseStorage)
        #expect(RecordingReducer.reduce(released, .userStart).phase == .beginning)
        let active = RecordingReducer.reduce(given, .userStart)
        #expect(RecordingReducer.reduce(active, .reserveStorage) == active)
    }
}
