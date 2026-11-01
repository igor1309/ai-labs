import LiveText

/// Hears a track with a fast draft recogniser and a better, slower final
/// one: reports the final one's final words, and the draft's words after
/// them as pending.
public actor TwoPassRecognizer: Recognizer {

    private let draft: any Recognizer
    private let final: any Recognizer
    private var drafted = Heard()
    private var heard = Heard()
    /// How many of the final recogniser's words were reported as final.
    private var reportedCount = 0
    /// Where the draft words shown at the last report start.
    private var shownFrom: Double?

    public init(draft: any Recognizer, final: any Recognizer) {

        self.draft = draft
        self.final = final
    }

    public func hear(_ chunk: AudioChunk) async throws -> Hearing {

        async let drafting = draft.hear(chunk)
        async let hearing = final.hear(chunk)
        drafted.take(try await drafting)
        heard.take(try await hearing)
        return report(finished: false)
    }

    public func finish() async throws -> Hearing {

        async let drafting = draft.finish()
        async let hearing = final.finish()
        _ = try await drafting
        heard.take(try await hearing)
        return report(finished: true)
    }

    /// Final words are never reported again, so a report starts at the
    /// first new one or at the draft words it replaces.
    private func report(finished: Bool) -> Hearing {

        let through = finished ? heard.words.last.map { max($0.end, heard.finalThrough) } ?? heard.finalThrough : heard.finalThrough
        let finalCount = finished ? heard.words.count : heard.words.firstIndex { $0.end > through } ?? heard.words.count
        let finals = heard.words[min(reportedCount, finalCount)..<finalCount]
        let recent = heard.words[..<finalCount].reversed().prefix { $0.start > through - 1 }
        let shown = finished ? [] : drafted.words.filter { word in
            word.start >= through && !recent.contains { same($0, word) }
        }

        let words = Array(finals) + shown
        let from = [shownFrom, words.first?.start].compactMap { $0 }.min()
        reportedCount = finalCount
        shownFrom = shown.first?.start
        return Hearing(words: words, from: from, finalThrough: through.isFinite ? through : nil)
    }
}

/// The same word heard about the same time, punctuation, case and «ё»
/// aside: a draft recogniser may start a word some tenths of a second away
/// from the final one and stretch its end by seconds.
private func same(_ a: Word, _ b: Word) -> Bool {

    letters(a.text) == letters(b.text) && abs(a.start - b.start) < 1
}

private func letters(_ text: String) -> String {

    String(text.lowercased().filter(\.isLetter).map { $0 == "ё" ? "е" : $0 })
}

/// The words a recogniser's reports add up to: each report replaces the
/// words from where it starts.
private struct Heard {

    private(set) var words: [Word] = []
    private(set) var finalThrough = -Double.infinity

    mutating func take(_ hearing: Hearing) {

        if let from = hearing.from ?? hearing.words.first?.start {
            let kept = (words.lastIndex { $0.start < from } ?? -1) + 1
            words = Array(words[..<kept]) + hearing.words
        }
        finalThrough = max(finalThrough, hearing.finalThrough ?? finalThrough)
    }
}
