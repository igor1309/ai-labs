import CoreText
import SwiftUI

/// Named text styles from the type scale. Amounts use `AmountView`.
public enum TypeRole: CaseIterable, Sendable {

    case hero, display, heading, title, lead, label, labelS, body, small, micro
    case eyebrow, code, keypad, ring, wordmark

    public var family: String {
        switch self {
        case .hero, .display, .heading, .title, .keypad, .ring, .wordmark: Tokens.fontDisplay
        case .eyebrow, .code: Tokens.fontMono
        default: Tokens.fontText
        }
    }

    public var size: CGFloat {
        switch self {
        case .hero: Tokens.sizeHero
        case .display: Tokens.sizeDisplay
        case .heading: Tokens.sizeHeading
        case .title: Tokens.sizeTitle
        case .lead: Tokens.sizeLead
        case .label, .body: Tokens.sizeBody
        case .labelS: Tokens.sizeLabel
        case .small, .code: Tokens.sizeSmall
        case .micro: Tokens.sizeMicro
        case .eyebrow: Tokens.sizeEyebrow
        case .keypad: Tokens.sizeKey
        case .ring: Tokens.sizeRing
        case .wordmark: Tokens.sizeWordmark
        }
    }

    public var weight: Tokens.Weight {
        switch self {
        case .hero, .display, .code, .wordmark: .bold
        case .heading, .title, .label, .labelS, .ring: .semibold
        case .lead, .eyebrow, .keypad: .medium
        case .body, .small, .micro: .regular
        }
    }

    public var tracking: CGFloat {
        switch self {
        case .hero, .ring: -2
        case .display: -1.5
        case .heading, .title: -0.5
        case .eyebrow: 1.5
        default: 0
        }
    }

    public var color: Color {
        switch self {
        case .lead, .body, .micro, .eyebrow: Tokens.text2
        default: Tokens.text
        }
    }

    public var font: Font { Font(resolvedFont) }

    var resolvedFont: CTFont { Tokens.ctFont(family, size, weight) }
}

/// Keeps a role's foreground as a replaceable default.
public struct TypeRoleView<Content: View>: View {
    let content: Content
    let role: TypeRole
    let style: AnyShapeStyle

    public var body: some View {
        content.font(role.font).tracking(role.tracking).foregroundStyle(style)
    }

    public func foregroundStyle<Style: ShapeStyle>(_ style: Style) -> Self {
        Self(content: content, role: role, style: AnyShapeStyle(style))
    }
}

public extension View {

    /// Sets the role's defaults; a subsequent foreground style replaces its colour.
    func typeRole(_ role: TypeRole) -> TypeRoleView<Self> {
        TypeRoleView(content: self, role: role, style: AnyShapeStyle(role.color))
    }
}
