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

    public init(body: NSFont, headings: [NSFont], code: NSFont, text: NSColor, secondary: NSColor,
                codeBackground: NSColor, rule: NSColor) {
        self.body = body; self.headings = headings; self.code = code; self.text = text
        self.secondary = secondary; self.codeBackground = codeBackground; self.rule = rule
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
                VStack(alignment: .leading, spacing: tokens.space4) {
                    Text(state.title).font(tokens.ui(tokens.typeTitle, .semibold)).foregroundStyle(tokens.text)
                    Text("\(state.date) · \(state.duration)").font(tokens.data(tokens.typeSmall)).foregroundStyle(tokens.gutter)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if case .markdown = state.notes {
                    Button(action: copy) {
                        Text("Копировать").font(tokens.ui(tokens.typeSmall, .semibold)).foregroundStyle(tokens.text)
                            .padding(.vertical, tokens.space6).padding(.horizontal, tokens.space12)
                            .background(tokens.btn, in: .rect(cornerRadius: tokens.radiusControl))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("preview.copy")
                }
            }
            .padding(tokens.space16)
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
                    .padding(tokens.space16)
                Spacer(minLength: 0)
            }
        }
        .background(tokens.surface)
    }

    private var style: NotesStyle {
        NotesStyle(
            body: font(tokens.fontUi, tokens.typeBody),
            headings: [font(tokens.fontUi, tokens.typeTitle, .semibold), font(tokens.fontUi, tokens.typeBody, .semibold),
                       font(tokens.fontUi, tokens.typeSmall, .semibold)],
            code: font(tokens.fontData, tokens.typeSmall),
            text: NSColor(tokens.text), secondary: NSColor(tokens.sub),
            codeBackground: NSColor(tokens.btn), rule: NSColor(tokens.rule)
        )
    }

    private func font(_ family: String, _ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont {
        let descriptor = NSFontDescriptor(fontAttributes: [.family: family])
            .addingAttributes([.traits: [NSFontDescriptor.TraitKey.weight: weight]])
        return NSFont(descriptor: descriptor, size: size) ?? .systemFont(ofSize: size, weight: weight)
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
        view.textContainerInset = NSSize(width: 16, height: 16)
        view.setAccessibilityIdentifier("preview.notes")
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        guard let view = scroll.documentView as? NSTextView else { return }
        view.backgroundColor = background
        if view.textStorage?.isEqual(to: text) != true { view.textStorage?.setAttributedString(text) }
    }
}
