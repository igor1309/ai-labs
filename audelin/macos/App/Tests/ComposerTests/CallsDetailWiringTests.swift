import CallsListUI
import Foundation
import Observation
import Testing
@testable import Composer

/// The composed calls list over a real calls folder: which calls have notes,
/// and the detail it derives from the selected call.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CallsDetailWiringTests {
    @Test func eachRowCarriesItsGist() async throws {
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            try call(a, notes: "## О чём встреча\n\nДейли команды. Обсудили релиз.\n\n## Решения\n\nНет.", in: rig.root)
            try call(b, notes: nil, in: rig.root)
            try call(c, notes: "# C notes", in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.map(\.hasNotes) == [true, false, true] }
            #expect(calls.state.rows.map(\.gist) == ["Дейли команды.", nil, nil])
        }
    }

    @Test func theDetailFollowsTheSelection() async throws {
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            try call(a, notes: "# A notes", in: rig.root)
            try call(b, notes: nil, in: rig.root)
            try call(c, notes: "# C notes", in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.map(\.hasNotes) == [true, false, true] }
            #expect(calls.detail == nil)

            await calls.send(.select(c))
            await waitDetail(calls) { notesText($0) == "# C notes" }
            await calls.send(.select(a))
            await waitDetail(calls) { notesText($0) == "# A notes" }
            await calls.send(.selectNext)
            await waitDetail(calls) { $0?.id == b && noSummary($0) }
            await calls.send(.selectNext)
            await waitDetail(calls) { notesText($0) == "# C notes" }
            await calls.send(.selectPrevious)
            await calls.send(.selectPrevious)
            await waitDetail(calls) { notesText($0) == "# A notes" }
            await calls.send(.selectPrevious)
            #expect(calls.state.selectedID == a)
        }
    }

    @Test func notesThatFinishLaterShowWhenTheWindowOpensAgain() async throws {
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            try call(a, notes: nil, in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.map(\.hasNotes) == [false] }
            await calls.send(.select(a))
            await waitDetail(calls) { noSummary($0) }
            try call(a, notes: "# Late", in: rig.root, create: false)

            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.map(\.hasNotes) == [true] }
            await waitDetail(calls) { notesText($0) == "# Late" }
        }
    }

    @Test func aReloadUpdatesTheShownDetail() async throws {
        try await withNotesComposition { rig, http in
            let calls = try #require(rig.menu.calls)
            let old = "# Old\n\nСтарый смысл.", new = "# New\n\nНовый смысл."
            try call(a, notes: nil, in: rig.root)
            try Data("**Me** 00:00:03\n\nsaved words\n".utf8).write(to: folder(a, in: rig.root).appendingPathComponent("transcript.md"))
            await rig.menu.perform(.showCalls)
            await wait(calls) { !$0.busy && $0.rows.count == 1 }
            await calls.send(.makeSummary(a)); await http.started.next()
            try await http.succeed()
            await wait(calls) { $0.rows.map(\.hasNotes) == [true] }
            await calls.send(.read(a))
            await waitDetail(calls) { notesText($0) == generatedNotes }
            try call(a, notes: old, in: rig.root, create: false)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.map(\.gist) == ["Старый смысл."] }
            #expect(calls.state.rows.map(\.gist) == ["Старый смысл."])
            await calls.send(.select(a))
            await waitDetail(calls) { notesText($0) == old }

            try call(a, notes: new, in: rig.root, create: false)
            await rig.menu.perform(.showCalls)
            await waitDetail(calls) { notesText($0) == new }
            await wait(calls) { $0.rows.map(\.gist) == ["Новый смысл."] }

            try FileManager.default.removeItem(at: folder(a, in: rig.root).appendingPathComponent("summary.md"))
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.map(\.hasNotes) == [false] }
            #expect(calls.state.rows.map(\.gist) == [nil])
            await calls.send(.read(a))
            #expect(noSummary(calls.detail))
            try #require(calls.state.rows[0].canMakeSummary)
            await calls.send(detail: .makeSummary)
            await waitDetail(calls) { if case .some(.none) = $0?.content { false } else { true } }
            try #require(calls.detail?.content == .preparing)
            await http.started.next(); try await http.succeed()
            await waitDetail(calls) { notesText($0) == generatedNotes }
            #expect(await http.bodies.count == 2)
        }
    }

    @Test func inANarrowWindowReadingACallOpensItsWindowOnItsNotes() async throws {
        var shown: [CallsDetail?] = []
        var calls: AudelinCalls?
        try await withComposition(readCall: { shown.append(calls?.detail) }) { rig in
            calls = try #require(rig.menu.calls)
            let calls = try #require(calls)
            try call(a, notes: "# A notes", in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.count == 1 }
            calls.widthChanged(narrow: true)

            await calls.send(.read(a))

            #expect(shown.map(notesText) == ["# A notes"])
        }
    }

    @Test func unreadableNotesCarryTheReason() async throws {
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            try call(a, notes: nil, in: rig.root)
            // A folder where the notes file should be cannot be read as notes.
            try FileManager.default.createDirectory(at: folder(a, in: rig.root).appendingPathComponent("summary.md"),
                                                    withIntermediateDirectories: false)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.count == 1 }
            await calls.send(.select(a))
            await waitDetail(calls) { if case .unreadable = $0?.content { true } else { false } }
        }
    }
}

private let a = "2024.01.01-1000", b = "2024.01.01-0900", c = "2024.01.01-0800"

private func folder(_ id: String, in root: URL) -> URL { root.appendingPathComponent("\(id) Zoom") }

private func call(_ id: String, notes: String?, in root: URL, create: Bool = true) throws {
    let url = folder(id, in: root)
    if create { try FileManager.default.createDirectory(at: url, withIntermediateDirectories: false) }
    guard let notes else { return }
    try Data("<!-- audelin-summary:e30= -->\n\(notes)".utf8).write(to: url.appendingPathComponent("summary.md"))
}

@MainActor private func wait(_ calls: AudelinCalls, until predicate: (CallsListState) -> Bool) async {
    for await state in Observations({ calls.state }) where predicate(state) { return }
}

@MainActor private func waitDetail(_ calls: AudelinCalls, until predicate: (CallsDetail?) -> Bool) async {
    for await detail in Observations({ calls.detail }) where predicate(detail) { return }
}

private func noSummary(_ detail: CallsDetail?) -> Bool { if case .some(.none) = detail?.content { true } else { false } }

private func notesText(_ detail: CallsDetail?) -> String? {
    if case let .notes(text, _) = detail?.content { text } else { nil }
}
