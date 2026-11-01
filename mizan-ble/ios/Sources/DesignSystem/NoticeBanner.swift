import SwiftUI

/// A short message over the content: a symbol, a title and a detail on a
/// tinted surface.
public struct NoticeBanner: View {

    public enum Tone: CaseIterable, Sendable {
        case host, client, failure

        var symbolColor: Color {
            switch self {
            case .host: Tokens.hostHi
            case .client: Tokens.clientHi
            case .failure: Tokens.bad
            }
        }

        var tint: Color {
            switch self {
            case .host: Tokens.hostTint
            case .client: Tokens.clientTint
            case .failure: Tokens.badTint
            }
        }
    }

    let title: String
    let detail: String
    let systemImage: String
    let tone: Tone
    let isCompact: Bool

    public init(_ title: String, detail: String, systemImage: String, tone: Tone, isCompact: Bool = true) {

        self.title = title
        self.detail = detail
        self.systemImage = systemImage
        self.tone = tone
        self.isCompact = isCompact
    }

    public var body: some View {

        HStack(spacing: Tokens.space3) {
            Image(systemName: systemImage).typeRole(.lead)
                .foregroundStyle(tone.symbolColor)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Tokens.space1) {
                Text(title).typeRole(isCompact ? .labelS : .label)
                Text(detail).typeRole(.small).foregroundStyle(Tokens.text2)
            }
        }
        .padding(.horizontal, isCompact ? Tokens.space3 : Tokens.space5)
        .padding(.vertical, isCompact ? Tokens.space2 : Tokens.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tone.tint, in: RoundedRectangle(cornerRadius: Tokens.radiusLg))
        .accessibilityElement(children: .combine)
    }
}
