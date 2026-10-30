import SwiftUI

/// A centred status: a visual, a title, an optional value, a detail and a
/// footer, with one spacing and one set of type roles per level, so the
/// title sits in the same place on every screen.
public struct StatusPanel<Visual: View, Value: View, Footer: View>: View {

    public enum Level: Sendable {
        /// Inside a host card: a lead title over an eyebrow detail.
        case panel
        /// A whole client screen: a title over body text kept to two lines.
        case screen
    }

    let title: String
    let detail: String
    let level: Level
    let isCompact: Bool
    let visual: Visual
    let value: Value
    let footer: Footer

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(
        _ title: String, detail: String, level: Level, isCompact: Bool = true,
        @ViewBuilder visual: () -> Visual, @ViewBuilder value: () -> Value,
        @ViewBuilder footer: () -> Footer
    ) {

        self.title = title
        self.detail = detail
        self.level = level
        self.isCompact = isCompact
        self.visual = visual()
        self.value = value()
        self.footer = footer()
    }

    public var body: some View {

        VStack(spacing: spacing) {
            visual
            VStack(spacing: textSpacing) {
                Text(title).typeRole(titleRole).foregroundStyle(Tokens.text).lineLimit(1)
                value
                if !detail.isEmpty || level == .screen { detailText }
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            footer
        }
        .animation(Motion.standard(reduced: reduceMotion).animation, value: title)
        .animation(Motion.standard(reduced: reduceMotion).animation, value: detail)
    }

    @ViewBuilder
    private var detailText: some View {

        switch level {
        case .panel: Text(detail).typeRole(.eyebrow)
        case .screen: Text(detail).typeRole(.body).lineSpacing(Tokens.space1).lineLimit(2, reservesSpace: true)
        }
    }

    var titleRole: TypeRole { level == .panel ? .lead : .title }

    var spacing: CGFloat {

        switch level {
        case .panel: isCompact ? Tokens.space2 : Tokens.space5
        case .screen: Tokens.space5
        }
    }

    var textSpacing: CGFloat { level == .panel ? spacing : Tokens.space2 }
}
