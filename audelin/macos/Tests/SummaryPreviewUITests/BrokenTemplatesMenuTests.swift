import AppKit
import RenderedText
import SummaryPreviewUI
import SwiftUI
import Testing

@MainActor
struct BrokenTemplatesMenuTests {
    @Test(arguments: SummaryPreviewLanguage.allCases, [ColorScheme.light, .dark])
    func drawsFolderFailureFromItsNamedState(language: SummaryPreviewLanguage, scheme: ColorScheme) throws {
        let text = SummaryPreviewText(language: language)
        let name = "templates-folder-failed"
        let host = Offscreen.host(SummaryPreviewView(state: SummaryPreviews.state(name, in: text), text: text,
                                                    event: { _ in }, render: SummaryPreviews.plain).environment(\.colorScheme, scheme),
                                  size: CGSize(width: 440, height: 560), scheme: scheme)
        defer { host.window?.isReleasedWhenClosed = false; host.window?.close() }
        let image = try #require(Offscreen.snapshot(host))
        let filename = "\(name)-\(scheme == .dark ? "dark" : "light")\(language == .russian ? "" : "-en")"
        let reference = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("References/" + filename + ".png")
        #expect([.matches, .recorded].contains(try ReferenceImage.compare(image, with: reference)))
        try Offscreen.save(image, filename)
    }

    @Test(arguments: SummaryPreviewLanguage.allCases, [false, true])
    func unusableFilesDrawReasonsAndOnlyUsableChoicesSendEvents(language: SummaryPreviewLanguage, noUsableFiles: Bool) throws {
        let text = SummaryPreviewText(language: language)
        var events: [SummaryPreviewEvent] = []
        let control = NotesMenuControl(text: text, presentMenu: { _, _ in }, event: { events.append($0) })
        let state = SummaryPreviews.brokenMenu(noUsableFiles: noUsableFiles, text: text)
        control.show(state, text: text)
        let items = control.templateMenu.items
        let broken = try #require(items.first { $0.accessibilityIdentifier() == "preview.template.file:/Daily.md" })
        #expect(broken.title == "Daily" && !broken.isEnabled)
        #expect(broken.accessibilityValue() as? String == state.templates[1].reason)
        let reason = try #require(items.first { $0.accessibilityIdentifier() == "preview.templateReason.file:/Daily.md" })
        #expect(reason.title == state.templates[1].reason && !reason.isEnabled && reason.indentationLevel == 1)
        #expect(items.first { $0.accessibilityIdentifier() == "preview.template.Default" }?.isEnabled == true)
        #expect(items.first { $0.accessibilityIdentifier() == "preview.templateFiles" }?.title == (noUsableFiles ? text(.templateFiles) : nil))
        let filesReason = items.first { $0.accessibilityIdentifier() == "preview.templateFilesReason" }
        if noUsableFiles {
            let files = try #require(items.first { $0.accessibilityIdentifier() == "preview.templateFiles" })
            #expect(!files.isEnabled && files.accessibilityValue() as? String == state.filesReason)
            let explanation = try #require(filesReason)
            #expect(explanation.title == state.filesReason && explanation.attributedTitle?.string == state.filesReason)
            #expect(!explanation.isEnabled && explanation.indentationLevel == 1)
        } else {
            #expect(filesReason == nil)
        }
        _ = (broken.target as? NSObject)?.perform(broken.action, with: broken)
        #expect(events.isEmpty)
        let folder = try #require(items.first { $0.accessibilityIdentifier() == "preview.openTemplatesFolder" })
        #expect(folder.title == text(.openTemplatesFolder) && folder.isEnabled)
        _ = (folder.target as? NSObject)?.perform(folder.action, with: folder)
        #expect(events == [.openTemplatesFolder])
    }

    @Test func openingFolderDisablesDuplicateActionsAndDisplaysItsFailure() throws {
        var events: [SummaryPreviewEvent] = []
        let text = SummaryPreviewText(language: .russian)
        let control = NotesMenuControl(text: text, presentMenu: { _, _ in }, event: { events.append($0) })
        var state = SummaryPreviews.brokenMenu(noUsableFiles: true, text: text)
        state.openingFolder = true
        control.show(state, text: text)
        let folder = try #require(control.templateMenu.items.first { $0.accessibilityIdentifier() == "preview.openTemplatesFolder" })
        #expect(!folder.isEnabled)
        _ = (folder.target as? NSObject)?.perform(folder.action, with: folder)
        #expect(events.isEmpty)
        state.openingFolder = false; state.folderFailure = "Finder unavailable"
        control.show(state, text: text)
        let failure = try #require(control.templateMenu.items.first { $0.accessibilityIdentifier() == "preview.folderFailure" })
        #expect(failure.title == "Finder unavailable" && !failure.isEnabled)
        #expect(control.templateMenu.items.first { $0.accessibilityIdentifier() == "preview.openTemplatesFolder" }?.isEnabled == true)
    }
}
