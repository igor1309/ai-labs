import Recording
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct RecordingReservationTests {

    @Test @MainActor func competingReservationsGetOneGrant() async {

        let model = RecordingModel(initial: RecordingState(missing: []), reducer: RecordingReducer(session: SessionReducer.reduce, status: { _ in RecordingSessionStatus() }), handler: makeHandler(), log: { _ in })
        async let first = model.reserveStorage()
        async let second = model.reserveStorage()
        let answers = await [first, second]
        #expect(answers.filter { $0 }.count == 1)
        #expect(model.state.storageReserved)
    }

    @Test @MainActor func aReservationWhileRecordingIsDenied() async {

        let model = RecordingModel(initial: RecordingState(missing: []), reducer: RecordingReducer(session: SessionReducer.reduce, status: { _ in RecordingSessionStatus() }), handler: makeHandler(), log: { _ in })
        model.send(.userStart)
        #expect(await model.reserveStorage() == false)
        #expect(!model.state.storageReserved)
    }
}

private func makeHandler() -> RecordingEffectHandler {

    RecordingEffectHandler(prepareCallAudio: { false }, liveText: { false }, releaseCallAudio: {}, runPiece: { _, _ in .outputReleased })
}
