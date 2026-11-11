import AppKit
import GlassLedger
import SwiftUI

/// The fonts and colours the notes are drawn with.
public struct NotesStyle {
    public let body: NSFont
    public let headings: [NSFont]
    public let code: NSFont
    public let text: NSColor
    public let secondary: NSColor
    public let codeBackground: NSColor
    public let rule: NSColor
    /// The height of a line of body text; nil keeps the font's own.
    public let lineHeight: CGFloat?
    /// Space after each paragraph and list item.
    public let paragraphSpacing: CGFloat
    /// Space before and after a heading, by level.
    public let headingSpacing: [(before: CGFloat, after: CGFloat)]
    /// Heading levels set as section labels: upper case, tracked, in the secondary colour.
    public let labelLevels: Set<Int>
    /// The tracking of a section label.
    public let labelKern: CGFloat

    public init(body: NSFont, headings: [NSFont], code: NSFont, text: NSColor, secondary: NSColor,
                codeBackground: NSColor, rule: NSColor, lineHeight: CGFloat? = nil, paragraphSpacing: CGFloat = 4,
                headingSpacing: [(before: CGFloat, after: CGFloat)] = [], labelLevels: Set<Int> = [], labelKern: CGFloat = 0) {
        self.body = body; self.headings = headings; self.code = code; self.text = text
        self.secondary = secondary; self.codeBackground = codeBackground; self.rule = rule
        self.lineHeight = lineHeight; self.paragraphSpacing = paragraphSpacing; self.headingSpacing = headingSpacing
        self.labelLevels = labelLevels; self.labelKern = labelKern
    }
}

/// The notes' typography, "Reading contrast" (LAB-1174, frame 10 in
/// `docs/design/audelin-typography-revised.pen`): small monospaced section
/// labels against larger, open body text, in SF Pro and SF Mono.
enum ReadingContrast {
    static let margin: CGFloat = 28
    static let title: CGFloat = 28
    static let meta: CGFloat = 13
    static let button: CGFloat = 13
    static let body: CGFloat = 16
    static let lineHeight: CGFloat = 26
    static let paragraphSpacing: CGFloat = 9
    static let heading: CGFloat = 22
    static let label: CGFloat = 12
    static let labelKern: CGFloat = 1
    static let topic: CGFloat = 15
    static let code: CGFloat = 13
}

/// One call's notes: a header with its title, date and duration, the copy
/// button, and the notes as selectable formatted text.
public struct SummaryPreviewView: View {
    private let state: SummaryPreviewState
    private let copy: () -> Void
    private let render: (String, NotesStyle) -> NSAttributedString
    @Environment(\.colorScheme) private var scheme
    private var tokens: GlassLedger { .for(scheme) }

    /// `render` turns the notes' Markdown into formatted text in the given style.
    public init(state: SummaryPreviewState, copy: @escaping () -> Void,
                render: @escaping (String, NotesStyle) -> NSAttributedString) {
        // The style resolves the bundled fonts as the body is first built.
        GlassLedger.registerFonts()
        self.state = state
        self.copy = copy
        self.render = render
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: tokens.space12) {
                VStack(alignment: .leading, spacing: tokens.space6) {
                    Text(state.title).font(.system(size: ReadingContrast.title, weight: .semibold)).foregroundStyle(tokens.text)
                        .textSelection(.enabled)
                    Text("\(state.date) · \(state.duration)").font(.system(size: ReadingContrast.meta)).foregroundStyle(tokens.gutter)
                        .textSelection(.enabled)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if case .markdown = state.notes {
                    Button(action: copy) {
                        Text("Копировать").font(.system(size: ReadingContrast.button, weight: .medium)).foregroundStyle(tokens.text)
                            .padding(.vertical, 7).padding(.horizontal, tokens.space12)
                            .background(tokens.btn, in: .rect(cornerRadius: tokens.radiusControl))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("preview.copy")
                }
            }
            .padding(.horizontal, ReadingContrast.margin).padding(.top, ReadingContrast.margin).padding(.bottom, 22)
            Rectangle().fill(tokens.rule).frame(height: 1)
            switch state.notes {
            case let .markdown(source):
                NotesText(text: render(source, style), background: NSColor(tokens.surface))
            case let .unreadable(reason):
                Text(reason)
                    .font(tokens.ui(tokens.typeSmall)).foregroundStyle(tokens.rec)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(tokens.space16)
                    .background(tokens.errBg)
                    .padding(ReadingContrast.margin)
                Spacer(minLength: 0)
            }
        }
        .background(tokens.surface)
    }

    private var style: NotesStyle {
        NotesStyle(
            body: .systemFont(ofSize: ReadingContrast.body),
            headings: [.systemFont(ofSize: ReadingContrast.heading, weight: .semibold),
                       .monospacedSystemFont(ofSize: ReadingContrast.label, weight: .semibold),
                       .systemFont(ofSize: ReadingContrast.topic, weight: .semibold)],
            code: .monospacedSystemFont(ofSize: ReadingContrast.code, weight: .regular),
            text: NSColor(tokens.text), secondary: NSColor(tokens.gutter),
            codeBackground: NSColor(tokens.btn), rule: NSColor(tokens.rule),
            lineHeight: ReadingContrast.lineHeight, paragraphSpacing: ReadingContrast.paragraphSpacing,
            headingSpacing: [(before: 28, after: 10), (before: 28, after: 10), (before: 20, after: 8)],
            labelLevels: [2], labelKern: ReadingContrast.labelKern
        )
    }
}

/// A read-only, selectable text view that scrolls.
private struct NotesText: NSViewRepresentable {
    let text: NSAttributedString
    let background: NSColor

    func makeNSView(context: Context) -> NSScrollView {
        // TextKit 1: TextKit 2 draws text tables as plain lines.
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        let view = NSTextView(usingTextLayoutManager: false)
        view.autoresizingMask = [.width]
        view.isVerticallyResizable = true
        view.textContainer?.widthTracksTextView = true
        scroll.documentView = view
        view.isEditable = false
        view.isSelectable = true
        view.isRichText = true
        view.textContainerInset = NSSize(width: ReadingContrast.margin - 5, height: 24)
        view.textContainer?.lineFragmentPadding = 5
        view.setAccessibilityIdentifier("preview.notes")
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        guard let view = scroll.documentView as? NSTextView else { return }
        view.backgroundColor = background
        if view.textStorage?.isEqual(to: text) != true { view.textStorage?.setAttributedString(text) }
    }
}
