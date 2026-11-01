import SplitRows
@testable import CallText

func == (lhs: SplitRows<State.Entry>, rhs: [State.Entry]) -> Bool { lhs.elementsEqual(rhs) }
func == (lhs: [State.Entry], rhs: SplitRows<State.Entry>) -> Bool { lhs.elementsEqual(rhs) }

extension State {

    init(status: Status, entries: [Entry], finalCount: Int = 0) {

        self.init(status: status, entries: SplitRows(tail: entries), finalCount: finalCount)
    }
}
