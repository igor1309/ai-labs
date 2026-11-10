import CallText

struct CallOutput: Equatable, Sendable {

    struct Entry: Equatable, Sendable {
        let speaker: State<Text>.Speaker
        let text: Text
        let writtenLater: Bool
    }

    let status: State<Text>.Status
    let entries: [Entry]
    let finalCount: Int

    init(status: State<Text>.Status, entries: [Entry], finalCount: Int = 0) {
        self.status = status
        self.entries = entries
        self.finalCount = finalCount
    }

    init(_ snapshot: State<Text>) {
        status = snapshot.status
        entries = snapshot.entries.map {
            Entry(speaker: $0.speaker, text: $0.text, writtenLater: $0.writtenLater)
        }
        finalCount = snapshot.finalCount
    }
}

/// A segment with words, as the composition relays through call text.
struct Text: Segment {

    let id: Int
    let start: Double
    let end: Double
    var settled = ""
    var pending = ""
}
