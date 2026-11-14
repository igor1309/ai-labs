import RecordingConditions
import Synchronization
import Testing

struct RecordingConditionsEffectHandlerTests {

    @Test func publishSendsEachChangedConditionInConditionOrder() async {
        let spy = PublicationSpy()
        let sut = RecordingConditionsEffectHandler(publication: spy)

        let event = await sut.handle(.publish([.room: false, .microphoneAccess: true, .callsFolder: true]))

        #expect(event == nil)
        #expect(spy.published == [.init(.microphoneAccess, true), .init(.callsFolder, true), .init(.room, false)])
    }

    @Test func emptyPublishSendsNothing() async {
        let spy = PublicationSpy()

        _ = await RecordingConditionsEffectHandler(publication: spy).handle(.publish([:]))

        #expect(spy.published.isEmpty)
    }
}

private final class PublicationSpy: ConditionPublication {

    struct Payload: Equatable {
        let condition: RecordingCondition, available: Bool
        init(_ condition: RecordingCondition, _ available: Bool) { self.condition = condition; self.available = available }
    }

    private let recorded = Mutex<[Payload]>([])
    var published: [Payload] { recorded.withLock { $0 } }

    func publish(_ condition: RecordingCondition, available: Bool) async {
        recorded.withLock { $0.append(.init(condition, available)) }
    }
}
