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
    /// Time references such as `[02:45]`.
    public let tertiary: NSColor
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

    public init(body: NSFont, headings: [NSFont], code: NSFont, text: NSColor, secondary: NSColor, tertiary: NSColor,
                codeBackground: NSColor, rule: NSColor, lineHeight: CGFloat? = nil, paragraphSpacing: CGFloat = 4,
                headingSpacing: [(before: CGFloat, after: CGFloat)] = [], labelLevels: Set<Int> = [], labelKern: CGFloat = 0) {
        self.body = body; self.headings = headings; self.code = code; self.text = text
        self.secondary = secondary; self.tertiary = tertiary; self.codeBackground = codeBackground; self.rule = rule
        self.lineHeight = lineHeight; self.paragraphSpacing = paragraphSpacing; self.headingSpacing = headingSpacing
        self.labelLevels = labelLevels; self.labelKern = labelKern
    }
}

/// One call beside the list: a header with its title, day, start time and
/// duration, and the notes as selectable formatted text. The actions on the
/// call are the window's toolbar, not the view's. Without notes the detail shows one centred message under the header, and
/// with no call (`state` nil) only «Звонок не выбран».
public struct SummaryPreviewView: View {
    private let state: SummaryPreviewState?
    private let event: (SummaryPreviewEvent) -> Void
    private let text: SummaryPreviewText
    private let render: (String, NotesStyle) -> NSAttributedString
    @Environment(\.colorScheme) private var scheme
    private var tokens: GlassLedger { .for(scheme) }

    /// `render` turns the notes' Markdown into formatted text in the given style.
    public init(state: SummaryPreviewState?, text: SummaryPreviewText = .init(language: .russian),
                event: @escaping (SummaryPreviewEvent) -> Void, render: @escaping (String, NotesStyle) -> NSAttributedString) {
        // The style resolves the bundled fonts as the body is first built.
        GlassLedger.registerFonts()
        self.state = state
        self.event = event
        self.text = text
        self.render = render
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let state {
                header(state)
                switch state.notes {
                case let .markdown(source, made):
                    NotesText(text: notes(source, made: made), background: NSColor(tokens.surface),
                              inset: NSSize(width: tokens.space28 - 5, height: 0),
                              label: text(.notes), made: made.map { text(.made, $0) })
                case let .unreadable(reason):
                    Text(reason)
                        .font(tokens.ui(tokens.typeSmall)).foregroundStyle(tokens.rec)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(tokens.space16)
                        .background(tokens.errBg)
                        .padding(.horizontal, tokens.space28)
                    Spacer(minLength: 0)
                case .making:
                    making
                case let .failed(reason):
                    message(text(.failed), detail: reason, retry: true) {
                        Image(systemName: "exclamationmark.circle").foregroundStyle(tokens.rec)
                    }
                case .none:
                    noSummary
                }
            } else {
                message(text(.noSelection), detail: nil) { EmptyView() }
            }
        }
        // The header sits in the toolbar's band, level with the window controls, and stays while the notes scroll.
        .ignoresSafeArea(.container, edges: state == nil ? [] : .top)
        .background(tokens.surface)
    }

    private func header(_ state: SummaryPreviewState) -> some View {
        VStack(alignment: .leading, spacing: tokens.space4) {
            Text(state.title).font(tokens.ui(tokens.typeTitle, .semibold)).foregroundStyle(tokens.text)
                .textSelection(.enabled)
            Text("\(state.date) · \(state.duration)").font(tokens.ui(tokens.typeSmall)).foregroundStyle(tokens.sub)
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, tokens.space12).padding(.leading, tokens.space28).padding(.trailing, tokens.space28 + tokens.space40)
        .padding(.bottom, tokens.space12)
    }

    /// The notes, then when they were made under their last line.
    private func notes(_ source: String, made: String?) -> NSAttributedString {
        let rendered = NSMutableAttributedString(attributedString: render(source, style))
        guard let made else { return rendered }
        let paragraph = NSMutableParagraphStyle()
        paragraph.paragraphSpacingBefore = tokens.space16
        rendered.append(NSAttributedString(string: "\n" + text(.made, made), attributes: [
            .font: tokens.nsUi(tokens.typeCaption), .foregroundColor: NSColor(tokens.gutter), .paragraphStyle: paragraph,
        ]))
        return rendered
    }

    /// «Нет итогов» and the link «✨ Сделать», one line under the header.
    private var noSummary: some View {
        HStack(spacing: tokens.space12) {
            Text(text(.noSummary)).foregroundStyle(tokens.gutter)
                .accessibilityIdentifier("preview.empty")
                .accessibilityValue(text(.noSummary))
            Button { event(.makeSummary) } label: {
                Label(text(.make), systemImage: "sparkles").fontWeight(.semibold).foregroundStyle(tokens.me)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("preview.make")
            .accessibilityLabel(text(.make))
            .accessibilityValue(text(.make))
        }
        .font(tokens.ui(tokens.typeBody))
        .padding(.horizontal, tokens.space28).padding(.top, tokens.space16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// A spinner, «Делаю…» and «Отменить» over a grey skeleton of the notes.
    private var making: some View {
        VStack(alignment: .leading, spacing: tokens.space32) {
            HStack(spacing: tokens.space12) {
                ProgressView().controlSize(.small)
                Text(text(.making)).foregroundStyle(tokens.gutter)
                    .accessibilityIdentifier("preview.making")
                    .accessibilityValue(text(.making))
                Button { event(.cancelSummary) } label: { Text(text(.cancel)).foregroundStyle(tokens.sub) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("preview.cancel")
                    .accessibilityLabel(text(.cancel))
                    .accessibilityValue(text(.cancel))
            }
            .font(tokens.ui(tokens.typeBody))
            VStack(alignment: .leading, spacing: tokens.space24) {
                ForEach(Array(Self.skeleton.enumerated()), id: \.offset) { _, group in
                    VStack(alignment: .leading, spacing: tokens.space8) {
                        ForEach(Array(group.enumerated()), id: \.offset) { _, width in
                            RoundedRectangle(cornerRadius: tokens.radiusBar).fill(tokens.btn).frame(maxWidth: width).frame(height: Self.bar)
                        }
                    }
                }
            }
            .accessibilityHidden(true)
        }
        .padding(.horizontal, tokens.space28).padding(.top, tokens.space16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// The skeleton's paragraphs as bar widths, the longest first, and the bar height; layout sizes with no token.
    private static let skeleton: [[CGFloat]] = [[640, 600, 380], [520, 560, 440, 300], [480, 360]]
    private static let bar: CGFloat = 8

    /// One centred message: an icon, a title, a line of detail and, for a failed summary, Повторить итоги.
    private func message(_ title: String, detail: String?, retry: Bool = false,
                         @ViewBuilder icon: () -> some View) -> some View {
        VStack(spacing: tokens.space8) {
            icon().font(tokens.ui(tokens.typeTitle))
            Text(title).font(tokens.ui(tokens.typeBody, .semibold)).foregroundStyle(tokens.text)
            if let detail {
                Text(detail).font(tokens.ui(tokens.typeSmall)).foregroundStyle(tokens.sub)
                    .textSelection(.enabled)
            }
            if retry {
                Button { event(.retrySummary) } label: {
                    Text(text(.retrySummary))
                        .font(tokens.ui(tokens.typeSmall)).foregroundStyle(tokens.text)
                        .padding(.vertical, tokens.space4).padding(.horizontal, tokens.space12)
                        .background(tokens.btn, in: .rect(cornerRadius: tokens.radiusControl))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("preview.retry")
            }
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, tokens.space28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var style: NotesStyle {
        NotesStyle(
            body: tokens.nsUi(tokens.typeBody),
            headings: [tokens.nsUi(tokens.typeTitle, .semibold),
                       tokens.nsUi(tokens.typeCaption, .semibold),
                       tokens.nsUi(tokens.typeBody, .semibold)],
            code: tokens.nsData(tokens.typeBody),
            text: NSColor(tokens.text), secondary: NSColor(tokens.sub), tertiary: NSColor(tokens.gutter),
            codeBackground: NSColor(tokens.btn), rule: NSColor(tokens.rule),
            lineHeight: tokens.lineBody, paragraphSpacing: tokens.space6,
            headingSpacing: [(before: tokens.space20, after: tokens.space8), (before: tokens.space20, after: tokens.space8),
                             (before: tokens.space12, after: tokens.space6)],
            labelLevels: [2]
        )
    }
}

/// A read-only, selectable text view that scrolls.
private struct NotesText: NSViewRepresentable {
    let text: NSAttributedString
    let background: NSColor
    let inset: NSSize
    let label: String
    let made: String?

    func makeNSView(context: Context) -> NSScrollView {
        // TextKit 1: TextKit 2 draws text tables as plain lines.
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        let view = NotesAccessibilityTextView(usingTextLayoutManager: false)
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
        guard let view = scroll.documentView as? NotesAccessibilityTextView else { return }
        view.setAccessibilityLabel(label)
        view.made = made
        view.backgroundColor = background
        if view.textStorage?.isEqual(to: text) != true { view.textStorage?.setAttributedString(text) }
    }
}

/// The date shares the rendered text view, but remains independently addressable to assistive tools.
private final class NotesAccessibilityTextView: NSTextView {
    var made: String?
    private let date = NSAccessibilityElement()

    override func accessibilityChildren() -> [Any]? {
        var children = super.accessibilityChildren() ?? []
        if let made {
            date.setAccessibilityRole(.staticText)
            let range = (string as NSString).range(of: made, options: .backwards)
            date.setAccessibilityFrame(firstRect(forCharacterRange: range, actualRange: nil))
            date.setAccessibilityLabel(made)
            date.setAccessibilityParent(self)
            date.setAccessibilityIdentifier("preview.made")
            date.setAccessibilityValue(made)
            children.append(date)
        }
        return children
    }
}
