import SwiftUI

/// A raised surface on the ground. Every card has the same corner and the
/// same padding for its size class, so their edges line up across screens.
public struct Card<Content: View>: View {

    public enum Padding: Sendable {
        /// The padding for text and controls.
        case standard
        /// Less padding, for a keypad that fills the card.
        case tight
        /// Side padding only, for a divided list whose rows pad themselves.
        case list
    }

    let isCompact: Bool
    let padding: Padding
    let content: Content

    public init(isCompact: Bool, padding: Padding = .standard, @ViewBuilder content: () -> Content) {

        self.isCompact = isCompact
        self.padding = padding
        self.content = content()
    }

    public var body: some View {

        content
            .padding(.horizontal, horizontal)
            .padding(.vertical, vertical)
            .background(Tokens.raised, in: RoundedRectangle(cornerRadius: Tokens.radiusXl))
    }

    var horizontal: CGFloat {

        switch padding {
        case .standard, .list: isCompact ? Tokens.space4 : Tokens.space7
        case .tight: isCompact ? Tokens.space2 : Tokens.space4
        }
    }

    var vertical: CGFloat {

        switch padding {
        case .standard: isCompact ? Tokens.space4 : Tokens.space7
        case .tight: isCompact ? Tokens.space2 : Tokens.space4
        case .list: Tokens.space1
        }
    }
}
