import CallsListUI
import Foundation
import Observation
import Testing
@testable import Composer

/// The composed calls list searching real call folders: titles, transcripts and notes.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CallsSearchWiringTests {
    @Test func aSearchKeepsMatchingCallsWithTheirDaysAndClearingRestoresTheList() async throws {
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            try call("2024.01.02-1600 Синк по OKR", transcript: [(872, "итак, по OKR квартала")], in: rig.root)
            try call("2024.01.02-1100 1-1 с Анной", transcript: [(5, "про отпуск")], in: rig.root)
            try call("2024.01.01-1030 Ретро", notes: "<!-- audelin-summary:e30= -->\n# Итоги\n\nиз пяти **OKR** года", in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.count == 3 && !$0.busy }
            await calls.send(.select("2024.01.02-1100"))

            await calls.send(.search("okr"))
            await wait(calls) { $0.search == .init(query: "okr", searching: false) }
            let state = calls.state
            #expect(state.rows.map(\.id) == ["2024.01.02-1600", "2024.01.01-1030"])
            #expect(state.rows.map { $0.day?.count } == ["1 звонок", "1 звонок"])
            #expect(state.rows[0].match == .init(title: [8..<11], snippet: .init(
                place: "14:32", placeIsTime: true, text: "итак, по OKR квартала", hits: [9..<12], more: nil)))
            #expect(state.rows[1].match == .init(title: [], snippet: .init(
                place: "Итоги", placeIsTime: false, text: "Итоги из пяти OKR года", hits: [14..<17], more: nil)))
            #expect(state.selectedID == nil)
            #expect(state.searchText == "okr")

            await calls.send(.search("Kubernetes"))
            await wait(calls) { $0.search == .init(query: "Kubernetes", searching: false) }
            #expect(calls.state.rows.isEmpty)

            await calls.send(.search(""))
            #expect(calls.state.search == nil)
            #expect(calls.state.searchText == "")
            #expect(calls.state.rows.map(\.id) == ["2024.01.02-1600", "2024.01.02-1100", "2024.01.01-1030"])
            #expect(calls.state.rows.allSatisfy { $0.match == nil })

            await calls.send(.search(" \t "))
            #expect(calls.state.searchText == " \t ")
            #expect(calls.state.search == nil)
            #expect(calls.state.rows.map(\.id) == ["2024.01.02-1600", "2024.01.02-1100", "2024.01.01-1030"])
        }
    }
}

private func call(_ name: String, transcript: [(Int, String)] = [], notes: String? = nil, in root: URL) throws {
    let url = root.appendingPathComponent(name)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: false)
    let rows = transcript.map { seconds, words in
        String(format: "**Them** %02d:%02d:%02d\n", seconds / 3_600, seconds / 60 % 60, seconds % 60) + words
    }
    try Data((["# Transcript"] + rows).joined(separator: "\n\n").utf8).write(to: url.appendingPathComponent("transcript.md"))
    if let notes { try Data(notes.utf8).write(to: url.appendingPathComponent("summary.md")) }
}

@MainActor private func wait(_ calls: AudelinCalls, until predicate: (CallsListState) -> Bool) async {
    for await state in Observations({ calls.state }) where predicate(state) { return }
}
