import Recording
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct RecordingReservationTests {

    @Test @MainActor func competingReservationsGetOneGrant() async {

        let model = RecordingModel(initial: RecordingState(missing: []), log: { _ in })
        async let first = model.reserveStorage()
        async let second = model.reserveStorage()
        let answers = await [first, second]
        #expect(answers.filter { $0 }.count == 1)
        #expect(model.state.storageReserved)
        #expect(model.state.reservations.isEmpty)
    }

    @Test @MainActor func aReservationWhileRecordingIsDenied() async {

        let model = RecordingModel(initial: RecordingState(missing: []), log: { _ in })
        model.send(.userStart)
        #expect(await model.reserveStorage() == false)
        #expect(!model.state.storageReserved)
        #expect(model.state.reservations.isEmpty)
    }
}
