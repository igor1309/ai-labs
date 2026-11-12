import CallNotes
import Foundation
import Synchronization
import Testing

func makeState(_ state: CallNotesState = .pending) -> CallNotesState { state }

/// Records each date the reducer renders and answers with `stub`.
final class DateSpy: Sendable {

    let stub: String
    private let dates = Mutex<[Date]>([])

    init(stub: String = "made") { self.stub = stub }

    var calls: [Date] { dates.withLock { $0 } }

    func render(_ date: Date) -> String {
        dates.withLock { $0.append(date) }
        return stub
    }
}

func makeSUT(date: DateSpy = .init()) -> CallNotesReducer { .init(date: { date.render($0) }) }

func assert(
    _ state: CallNotesState, _ event: CallNotesEvent, sut: CallNotesReducer = makeSUT(),
    _ update: (inout CallNotesState) -> Void = { _ in },
    sourceLocation: SourceLocation = #_sourceLocation
) {

    var expected = state
    update(&expected)
    #expect(sut.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func assert(
    _ state: CallNotesState, _ event: CallNotesEvent, sut: CallNotesReducer = makeSUT(), delivers expected: CallNotesEffect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(sut.reduce(state, event).1 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}
