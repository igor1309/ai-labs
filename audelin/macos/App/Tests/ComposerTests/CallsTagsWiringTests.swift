import CallsListUI
import Foundation
import Observation
import TagsFile
import Testing
@testable import Composer

/// The composed calls window over real call folders: each call's tags listed, filtered
/// by the strip and the search field, and edited from the detail into the call's folder.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CallsTagsWiringTests {
    private let launch = "2024.01.02-1600", sync = "2024.01.02-1100", retro = "2024.01.01-1030"

    @Test func theStripAndTagWordsFilterTheListAndATagMatchesPlainSearch() async throws {
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            try call(launch, tags: "клиент\nбанк", in: rig.root)
            try call(sync, tags: "Клиент", in: rig.root)
            try call(retro, in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.count == 3 && !$0.busy }

            #expect(calls.state.tagStrip == [.init(name: "клиент", on: false), .init(name: "банк", on: false)])
            #expect(calls.state.rows.map(\.tags) == [["клиент", "банк"], ["Клиент"], []])

            await calls.send(.toggleTag("банк"))
            #expect(calls.state.rows.map(\.id) == [launch])
            #expect(calls.state.tagStrip == [.init(name: "клиент", on: false), .init(name: "банк", on: true)])
            await calls.send(.toggleTag("банк"))
            #expect(calls.state.rows.map(\.id) == [launch, sync, retro])

            await calls.send(.search("#КЛИЕНТ"))
            #expect(calls.state.rows.map(\.id) == [launch, sync])
            #expect(calls.state.tagStrip.first == .init(name: "клиент", on: true))
            #expect(calls.state.search == nil)

            await calls.send(.search("банк"))
            await wait(calls) { $0.search?.searching == false }
            #expect(calls.state.rows.map(\.id) == [launch])
        }
    }

    @Test func tagsEditedInTheDetailAreSavedToTheCallsFolder() async throws {
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            try call(launch, tags: "клиент", in: rig.root)
            try call(sync, tags: "найм", in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { $0.rows.count == 2 && !$0.busy }
            await calls.send(.select(launch))
            await waitDetail(calls) { $0 == .shown(["клиент"]) }

            await calls.send(detail: .editTags)
            await calls.send(detail: .typeTag("на"))
            #expect(calls.detailTags == .editing(tags: ["клиент"], entry: "на", completion: "йм", saving: false, failure: nil))
            await calls.send(detail: .completeTag)
            await calls.send(detail: .submitTags)

            await waitDetail(calls) { $0 == .shown(["клиент", "найм"]) }
            #expect(try TagsFile.read(in: rig.root.appendingPathComponent(launch)) == ["клиент", "найм"])
            #expect(calls.state.rows.first { $0.id == launch }?.tags == ["клиент", "найм"])
        }
    }
}

private func call(_ name: String, tags: String? = nil, in root: URL) throws {
    let url = root.appendingPathComponent(name)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: false)
    try Data("# Transcript".utf8).write(to: url.appendingPathComponent("transcript.md"))
    if let tags { try Data(tags.utf8).write(to: url.appendingPathComponent(TagsFile.name)) }
}

@MainActor private func wait(_ calls: AudelinCalls, until predicate: (CallsListState) -> Bool) async {
    for await state in Observations({ calls.state }) where predicate(state) { return }
}

@MainActor private func waitDetail(_ calls: AudelinCalls, until predicate: (CallsDetailTags) -> Bool) async {
    for await tags in Observations({ calls.detailTags }) where predicate(tags) { return }
}
