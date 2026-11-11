import CallsListUI
import Foundation
import Observation
import Testing
@testable import Composer

/// The composed calls list over a real calls folder: which calls have notes,
/// and the preview it derives from the selected call.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CallsPreviewWiringTests {
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

    @Test func theEyeOpensThePreviewAndTheSelectionMovesIt() async throws {
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            try call(a, notes: "# A notes", in: rig.root)
            try call(b, notes: nil, in: rig.root)
            try call(c, notes: "# C notes", in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.map(\.hasNotes) == [true, false, true] }
            #expect(calls.preview == nil)

            await calls.send(.preview(c))
            await waitPreview(calls) { $0?.notes == .text("# C notes") }
            #expect(calls.state.selectedID == c && calls.state.previewedID == c)

            await calls.send(.select(a))
            await waitPreview(calls) { $0?.notes == .text("# A notes") }
            #expect(calls.preview?.id == a)

            await calls.send(.selectNext)
            await waitPreview(calls) { $0 == nil }
            #expect(calls.state.selectedID == b && calls.state.previewedID == nil)

            await calls.send(.selectNext)
            await waitPreview(calls) { $0?.notes == .text("# C notes") }
            await calls.send(.selectPrevious)
            await waitPreview(calls) { $0 == nil }
            await calls.send(.selectPrevious)
            await waitPreview(calls) { $0?.notes == .text("# A notes") }
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
            try call(a, notes: "# Late", in: rig.root, create: false)

            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.map(\.hasNotes) == [true] }
            await calls.send(.preview(a))
            await waitPreview(calls) { $0?.notes == .text("# Late") }
        }
    }

    @Test func aReloadUpdatesTheOpenPreview() async throws {
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            let old = "# Old\n\nСтарый смысл.", new = "# New\n\nНовый смысл."
            try call(a, notes: old, in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.map(\.hasNotes) == [true] }
            #expect(calls.state.rows.map(\.gist) == ["Старый смысл."])
            await calls.send(.preview(a))
            await waitPreview(calls) { $0?.notes == .text(old) }

            try call(a, notes: new, in: rig.root, create: false)
            await rig.menu.perform(.showCalls)
            await waitPreview(calls) { $0?.notes == .text(new) }
            await wait(calls) { $0.rows.map(\.gist) == ["Новый смысл."] }

            try FileManager.default.removeItem(at: folder(a, in: rig.root).appendingPathComponent("summary.md"))
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.map(\.hasNotes) == [false] }
            #expect(calls.state.rows.map(\.gist) == [nil])
            await waitPreview(calls) { $0 == nil }
        }
    }

    @Test func aClosedPreviewStaysClosedAndClosingTheWindowClosesIt() async throws {
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            try call(a, notes: "# A", in: rig.root)
            try call(b, notes: "# B", in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.map(\.hasNotes) == [true, true] }

            await calls.send(.preview(a))
            await waitPreview(calls) { $0 != nil }
            calls.closePreview()
            #expect(calls.preview == nil)
            await calls.send(.select(b))
            #expect(calls.preview == nil && calls.state.previewedID == nil)

            await calls.send(.preview(b))
            await waitPreview(calls) { $0?.notes == .text("# B") }
            calls.windowClosed()
            #expect(calls.preview == nil)
            await calls.send(.select(a))
            #expect(calls.preview == nil)
        }
    }

    @Test func everyEyeAsksForThePanelToBeActive() async throws {
        let focused = Counter()
        try await withComposition(focusPreview: { focused.count += 1 }) { rig in
            let calls = try #require(rig.menu.calls)
            try call(a, notes: "# A", in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.map(\.hasNotes) == [true] }

            await calls.send(.preview(a))
            await waitPreview(calls) { $0?.notes == .text("# A") }
            #expect(focused.count == 1)

            await calls.send(.preview(a))
            #expect(focused.count == 2)
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
            await calls.send(.preview(a))
            await waitPreview(calls) { if case .unreadable = $0?.notes { true } else { false } }
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

@MainActor private func waitPreview(_ calls: AudelinCalls, until predicate: (CallsPreview?) -> Bool) async {
    for await preview in Observations({ calls.preview }) where predicate(preview) { return }
}

@MainActor private final class Counter { var count = 0 }
