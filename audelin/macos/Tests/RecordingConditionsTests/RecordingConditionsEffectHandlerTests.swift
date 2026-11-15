import RecordingConditions
import Synchronization
import Testing

struct RecordingConditionsEffectHandlerTests {

    @Test func publishSendsEachChangedConditionInConditionOrder() async {
        let spy = PublicationSpy()
        let sut = makeSUT(spy)

        let event = await sut.handle(.publish([.room: .unavailable, .microphoneAccess: .available, .callsFolder: .moving]))

        #expect(event == nil)
        #expect(spy.published == [.init(.microphoneAccess, .available), .init(.callsFolder, .moving), .init(.room, .unavailable)])
    }

    @Test func emptyPublishSendsNothing() async {
        let spy = PublicationSpy()

        _ = await makeSUT(spy).handle(.publish([:]))

        #expect(spy.published.isEmpty)
    }

    @Test func aReadingAfterAMoveDeliversTheReadingForThatMove() async {
        let reading = makeReadings(missing, at: 7)

        let event = await makeSUT(PublicationSpy(), read: { reading }).handle(.readAfterMove(3))

        #expect(event == .readAfterMove(reading, move: 3))
    }

    private func makeSUT(_ spy: PublicationSpy, read: @escaping @Sendable () async -> ConditionReadings = { makeReadings() }) -> RecordingConditionsEffectHandler {
        RecordingConditionsEffectHandler(publication: spy, read: read)
    }
}

private final class PublicationSpy: ConditionPublication {

    struct Payload: Equatable {
        let condition: RecordingCondition, available: Availability
        init(_ condition: RecordingCondition, _ available: Availability) { self.condition = condition; self.available = available }
    }

    private let recorded = Mutex<[Payload]>([])
    var published: [Payload] { recorded.withLock { $0 } }

    func publish(_ condition: RecordingCondition, _ available: Availability) async {
        recorded.withLock { $0.append(.init(condition, available)) }
    }
}
