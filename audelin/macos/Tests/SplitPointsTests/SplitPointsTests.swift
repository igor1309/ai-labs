import Foundation
import SplitPoints
import Testing

struct SplitPointsTests {
    @Test func ranksGapsWithTheirAdjacentEntriesAndFolderMinutes() {
        let first = Entry(0, "First"), second = Entry(8, "Second")
        let third = Entry(25, "Third"), last = Entry(33, "Last")
        let choices = SplitPoints.choices(for: [first, second, third, last], timelineStart: Date(timeIntervalSince1970: 100))

        #expect(choices.map(\.cut) == [25, 8, 33])
        #expect(choices.map(\.gap) == [17, 8, 8])
        #expect(choices.map(\.before) == [second, first, third])
        #expect(choices.map(\.after) == [third, second, last])
        #expect(choices.map { $0.secondPartMinute.timeIntervalSince1970 } == [120, 60, 120])
    }

    @Test(arguments: [
        Phrase("Всем ПОКА, до завтра.", "Следующий вопрос", true),
        Phrase("Предыдущий вопрос", "Так, давайте начнём!", true),
        Phrase("Предыдущий вопрос", "Так, начинаем Android daily.", true),
        Phrase("The last point. THANKS, EVERYONE!", "Next topic", true),
        Phrase("The last point", "Let’s get started.", true),
        Phrase("Всем привет", "До встречи", false),
        Phrase("We should not say goodbyes", "Next topic", false),
        Phrase("First topic", "Next topic", false),
    ])
    func marksEndingsBeforeAndBeginningsAfter(_ phrase: Phrase) throws {
        let choices = SplitPoints.choices(for: [Entry(1, phrase.before), Entry(2, phrase.after)], timelineStart: .distantPast)
        let choice = try #require(choices.first)
        #expect(choice.suggestsTransition == phrase.marked)
    }

    @Test(arguments: [[], [Entry(8, "One")], [Entry(8, "One"), Entry(8, "Two")],
                      [Entry(1, nil), Entry(8, "One"), Entry(9, " \n")]])
    func needsSpokenEntriesWithDistinctStarts(_ entries: [Entry]) {
        #expect(SplitPoints.choices(for: entries, timelineStart: .distantPast).isEmpty)
    }

    @Test func keepsEqualStartsTogetherAndIgnoresMarkers() throws {
        let first = Entry(1, "First"), sameStart = Entry(1, "Second"), later = Entry(8, "Later")
        let choices = SplitPoints.choices(for: [first, sameStart, Entry(3, nil), later], timelineStart: .distantPast)
        #expect(choices.map(\.cut) == [8])
        let choice = try #require(choices.first)
        #expect(choice.gap == 7)
        #expect(choice.before == sameStart)
        #expect(choice.after == later)
    }

    struct Phrase: Sendable {
        let before: String
        let after: String
        let marked: Bool

        init(_ before: String, _ after: String, _ marked: Bool) {
            self.before = before
            self.after = after
            self.marked = marked
        }
    }

    struct Entry: SplitPointEntry, Equatable, Sendable {
        let start: Int
        let words: String?

        init(_ start: Int, _ words: String?) { self.start = start; self.words = words }
    }
}
