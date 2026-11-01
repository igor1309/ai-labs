import SwiftUI

/// A symbol in a tinted disc.
public struct IconBadge<Icon: View>: View {

    public enum Size: CaseIterable, Sendable {
        /// Beside a row of text.
        case small
        /// The visual of a status.
        case large

        public var diameter: CGFloat { self == .small ? Tokens.space7 : Tokens.space14 * 2 }
        public var iconSide: CGFloat { self == .small ? Tokens.sizeSmall : Tokens.space12 }
    }

    let size: Size
    let tint: Color
    let icon: Icon

    public init(_ size: Size, tint: Color, @ViewBuilder icon: () -> Icon) {

        self.size = size
        self.tint = tint
        self.icon = icon()
    }

    public var body: some View {

        icon
            .frame(width: size.iconSide, height: size.iconSide)
            .frame(width: size.diameter, height: size.diameter)
            .background(tint, in: Circle())
            .accessibilityHidden(true)
    }
}

public extension IconBadge where Icon == TypeRoleView<Image> {

    init(_ size: Size, systemImage: String, color: Color, tint: Color) {

        self.init(size, tint: tint) {
            Image(systemName: systemImage).typeRole(size == .small ? .small : .heading).foregroundStyle(color)
        }
    }
}
