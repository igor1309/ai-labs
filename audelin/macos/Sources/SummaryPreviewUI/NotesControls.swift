import AppKit
import GlassLedger
import SwiftUI

/// A plain native menu. Availability and the keep value are supplied by the caller.
@MainActor
public final class NotesMenuControl: NSButton {
    public let templateMenu = NSMenu()
    private var presentation: SummaryPreviewState.Menu?
    private var awaitingCatalogue: Int?
    private let event: (SummaryPreviewEvent) -> Void
    private let presentMenu: (NSMenu, NSView) -> Void

    public init(text: SummaryPreviewText, presentMenu: @escaping (NSMenu, NSView) -> Void, event: @escaping (SummaryPreviewEvent) -> Void) {
        self.event = event
        self.presentMenu = presentMenu
        super.init(frame: .zero)
        bezelStyle = .toolbar
        image = NSImage(systemSymbolName: "arrow.triangle.2.circlepath", accessibilityDescription: text(.notesMenu))
        imagePosition = .imageOnly
        target = self; action = #selector(openMenu)
        templateMenu.autoenablesItems = false
        setAccessibilityIdentifier("preview.notesMenu")
        show(nil, text: text)
    }
    required init?(coder: NSCoder) { nil }

    public func show(_ state: SummaryPreviewState.Menu?, text: SummaryPreviewText) {
        presentation = state
        isEnabled = state?.opens == true
        toolTip = text(.notesMenu)
        setAccessibilityLabel(text(.notesMenu))
        setAccessibilityValue(state?.section ?? "")
        templateMenu.removeAllItems()
        guard let state else { awaitingCatalogue = nil; return }
        let heading = NSMenuItem.sectionHeader(title: state.section)
        heading.setAccessibilityIdentifier("preview.menuSection")
        templateMenu.addItem(heading)
        for template in state.templates {
            let item = NSMenuItem(title: template.name, action: #selector(choose(_:)), keyEquivalent: "")
            item.target = self; item.representedObject = template.id
            item.isEnabled = template.enabled
            item.setAccessibilityIdentifier("preview.template.\(template.id)")
            templateMenu.addItem(item)
            if let reason = template.reason {
                item.setAccessibilityValue(reason)
                addReason(reason, identifier: "preview.templateReason.\(template.id)")
            }
        }
        if let reason = state.filesReason {
            let item = NSMenuItem(title: text(.templateFiles), action: nil, keyEquivalent: "")
            item.isEnabled = false
            item.setAccessibilityIdentifier("preview.templateFiles")
            item.setAccessibilityValue(reason)
            templateMenu.addItem(item)
            addReason(reason, identifier: "preview.templateFilesReason")
        }
        if state.offersFolder {
            templateMenu.addItem(.separator())
            let item = NSMenuItem(title: text(.openTemplatesFolder), action: #selector(openFolder), keyEquivalent: "")
            item.target = self; item.isEnabled = !state.openingFolder
            item.setAccessibilityIdentifier("preview.openTemplatesFolder")
            templateMenu.addItem(item)
        }
        if let reason = state.folderFailure { addReason(reason, identifier: "preview.folderFailure") }
        if let keeping = state.keeping {
            templateMenu.addItem(.separator())
            let item = NSMenuItem(title: text(.keepPrevious), action: #selector(toggleKeeping), keyEquivalent: "")
            item.target = self; item.state = keeping ? .on : .off; item.isEnabled = !state.saving
            item.setAccessibilityIdentifier("preview.keepPrevious")
            templateMenu.addItem(item)
        }
        if let failure = state.failure {
            let item = NSMenuItem(title: failure, action: nil, keyEquivalent: "")
            item.isEnabled = false
            templateMenu.addItem(item)
        }
        if let revision = awaitingCatalogue, state.catalogueRevision > revision {
            awaitingCatalogue = nil
            presentMenu(templateMenu, self)
        }
    }
    private func addReason(_ reason: String, identifier: String) {
        let item = NSMenuItem(title: reason, action: nil, keyEquivalent: "")
        item.isEnabled = false; item.indentationLevel = 1
        let tokens = GlassLedger.for(effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .dark : .light)
        item.attributedTitle = NSAttributedString(string: reason, attributes: [
            .font: tokens.nsUi(tokens.typeCaption), .foregroundColor: NSColor(tokens.rec),
        ])
        item.setAccessibilityIdentifier(identifier)
        item.setAccessibilityValue(reason)
        templateMenu.addItem(item)
    }
    @objc private func openFolder() {
        guard presentation?.offersFolder == true, presentation?.openingFolder == false else { return }
        event(.openTemplatesFolder)
    }
    @objc private func openMenu() {
        guard let presentation, presentation.opens else { return }
        // Finish the asynchronous refresh before entering AppKit's menu tracking loop.
        awaitingCatalogue = presentation.catalogueRevision
        event(.openNotesMenu)
    }
    @objc private func choose(_ item: NSMenuItem) {
        guard item.isEnabled, let id = item.representedObject as? String else { return }
        event(.chooseTemplate(id))
    }
    @objc private func toggleKeeping() {
        guard presentation?.keeping != nil, presentation?.saving == false else { return }
        event(.toggleKeeping)
    }
}

/// The previous/current switch: the design's segmented control, drawn by
/// SwiftUI over an AppKit target that owns focus, clicks, keys and accessibility.
struct NotesVersionControl: View {
    let version: SummaryPreviewState.Version
    let previous: String
    let current: String
    let tokens: GlassLedger
    let event: (SummaryPreviewEvent) -> Void
    @State private var focused = false

    var body: some View {
        let titles = [previous, current]
        let selected = version == .previous ? 0 : 1
        SegmentTrack(count: 2, selected: selected, ring: focused ? selected : nil, fill: false, tokens: tokens) { index, isSelected in
            Text(titles[index]).font(tokens.ui(tokens.typeSmall, isSelected ? .medium : .regular)).foregroundStyle(tokens.text)
        }
        .overlay {
            SegmentsTarget(titles: titles, enabled: [true, true], selected: selected, identifier: "preview.versions",
                           segmentIdentifiers: ["preview.versions.previous", "preview.versions.current"],
                           select: { event(.chooseVersion($0 == 0 ? .previous : .current)) },
                           focusChanged: { focused = $0 })
        }
    }
}

/// AppKit owns focus and accessibility activation; SwiftUI draws the token-based label.
struct NotesCancelTarget: NSViewRepresentable {
    let title: String
    let action: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(action: action) }
    func makeNSView(context: Context) -> NSButton {
        let button = CancelButton(title: "", target: context.coordinator, action: #selector(Coordinator.press))
        button.isBordered = false; button.isTransparent = true
        button.setButtonType(.momentaryPushIn)
        return button
    }
    func updateNSView(_ button: NSButton, context: Context) {
        context.coordinator.action = action
        button.setAccessibilityElement(true)
        button.setAccessibilityIdentifier("preview.cancel")
        button.setAccessibilityLabel(title)
        button.setAccessibilityValue(title)
    }
    @MainActor final class Coordinator: NSObject {
        var action: () -> Void
        init(action: @escaping () -> Void) { self.action = action }
        @objc func press() { action() }
    }
}
private final class CancelButton: NSButton {
    override func accessibilityRole() -> NSAccessibility.Role? { .button }
    override func accessibilityPerformPress() -> Bool {
        guard isEnabled else { return false }
        performClick(nil)
        return true
    }
}
