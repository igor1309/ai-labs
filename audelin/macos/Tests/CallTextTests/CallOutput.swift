import CallText

struct CallOutput: Equatable, Sendable {

    struct Entry: Equatable, Sendable {
        let speaker: State.Speaker
        let text: Text
        let writtenLater: Bool
    }

    let status: State.Status
    let entries: [Entry]
    let finalCount: Int

    init(status: State.Status, entries: [Entry], finalCount: Int = 0) {
        self.status = status
        self.entries = entries
        self.finalCount = finalCount
    }

    init(_ snapshot: State) {
        status = snapshot.status
        entries = snapshot.entries.map {
            Entry(speaker: $0.speaker, text: $0.text, writtenLater: $0.writtenLater)
        }
        finalCount = snapshot.finalCount
    }
}
