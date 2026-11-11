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
                    Text(state.title).font(tokens.ui(tokens.typeDisplay, .semibold)).foregroundStyle(tokens.text)
                        .textSelection(.enabled)
                    Text("\(state.date) · \(state.duration)").font(tokens.data(tokens.typeBody)).foregroundStyle(tokens.gutter)
                        .textSelection(.enabled)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if case .markdown = state.notes {
                    Button(action: copy) {
                        Text("Копировать").font(tokens.ui(tokens.typeBody, .semibold)).foregroundStyle(tokens.text)
                            .padding(.vertical, tokens.space6).padding(.horizontal, tokens.space12)
                            .background(tokens.btn, in: .rect(cornerRadius: tokens.radiusControl))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("preview.copy")
                }
            }
            .padding(.horizontal, tokens.space28).padding(.top, tokens.space28).padding(.bottom, tokens.space24)
            Rectangle().fill(tokens.rule).frame(height: 1)
            switch state.notes {
            case let .markdown(source):
                NotesText(text: render(source, style), background: NSColor(tokens.surface),
                          inset: NSSize(width: tokens.space28 - 5, height: tokens.space24))
            case let .unreadable(reason):
                Text(reason)
                    .font(tokens.ui(tokens.typeSmall)).foregroundStyle(tokens.rec)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(tokens.space16)
                    .background(tokens.errBg)
                    .padding(tokens.space28)
                Spacer(minLength: 0)
            }
        }
        .background(tokens.surface)
    }

    private var style: NotesStyle {
        NotesStyle(
            body: tokens.nsUi(tokens.typeReading),
            headings: [tokens.nsUi(tokens.typeHeading, .semibold),
                       tokens.nsData(tokens.typeSmall, .semibold),
                       tokens.nsUi(tokens.typeTopic, .semibold)],
            code: tokens.nsData(tokens.typeBody),
            text: NSColor(tokens.text), secondary: NSColor(tokens.gutter),
            codeBackground: NSColor(tokens.btn), rule: NSColor(tokens.rule),
            lineHeight: tokens.lineReading, paragraphSpacing: tokens.space8,
            headingSpacing: [(before: tokens.space28, after: tokens.space8), (before: tokens.space28, after: tokens.space8),
                             (before: tokens.space20, after: tokens.space8)],
            labelLevels: [2], labelKern: 1
        )
    }
}

/// A read-only, selectable text view that scrolls.
private struct NotesText: NSViewRepresentable {
    let text: NSAttributedString
    let background: NSColor
    let inset: NSSize

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
        view.textContainerInset = inset
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
