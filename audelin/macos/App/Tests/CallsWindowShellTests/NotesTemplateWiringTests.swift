import CallDetail
import Composer
import NotesMenu
import SummaryPreviewUI
import Testing
@testable import CallsWindowShell

@MainActor
struct NotesTemplateWiringTests {
    @Test func menuAndVersionInteractionsReachTheirEventEndpoints() async {
        let interactions: [SummaryPreviewEvent] = [.openNotesMenu, .chooseTemplate("Daily"), .toggleKeeping, .openTemplatesFolder, .chooseVersion(.previous), .chooseVersion(.current), .cancelSummary]
        var received: [CallsDetailEvent] = []
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            let send = detailSender { received.append($0); if received.count == interactions.count { done.resume() } }
            interactions.forEach(send)
        }
        #expect(received == [.notesMenuOpened, .chooseNotesTemplate("Daily"), .toggleKeeping, .openTemplatesFolder, .chooseNotesVersion(.previous), .chooseNotesVersion(.current), .cancelNotes])
    }

    @Test func suppliedMenuAndVersionValuesReachTheView() throws {
        let previous = CallNotes(text: "old", made: "yesterday")
        let current = CallNotes(text: "new", made: "today", templateID: "daily", templateName: "Daily")
        let pair = CallNotesPair(previous: previous, current: current)
        let detail = CallsDetail(id: "call", title: "Title", date: "Date", duration: "1:00", content: .notes("old", made: "yesterday"),
                                 pair: pair, version: .previous, template: "Default", progress: "making Daily")
        let menu = NotesMenuState(section: "MAKE AGAIN", templates: [.init(id: "daily", name: "Daily", enabled: false, reason: "Bad metadata")],
                                  keeping: false, offersKeeping: true, saving: true, saveFailure: "read only", filesReason: "No files", offersFolder: true, openingFolder: true, folderFailure: "Finder unavailable", catalogueRevision: 12)
        let state = try #require(detailState(detail, menu: menu, text: .init(language: .english)))
        #expect(state.notes == .markdown("old", made: "yesterday"))
        #expect(state.version == .previous && state.templateName == "Default" && state.progress == "making Daily")
        #expect(state.menu == .init(section: "MAKE AGAIN", templates: [.init(id: "daily", name: "Daily", enabled: false, reason: "Bad metadata")],
                                    keeping: false, saving: true, failure: "read only", catalogueRevision: 12, filesReason: "No files", offersFolder: true, openingFolder: true, folderFailure: "Finder unavailable"))
        var changed = detail
        changed.version = .current; changed.content = .notes("new", made: "today"); changed.template = "Daily"
        changed.progress = nil; changed.failure = "failed"
        let next = try #require(detailState(changed, menu: menu, text: .init(language: .english)))
        #expect(next.version == .current && next.templateName == "Daily" && next.progress == nil && next.failure == "failed")
        #expect(next.notes == .markdown("new", made: "today"))
    }
}
