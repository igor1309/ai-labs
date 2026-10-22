import GlassLedger
import PanelUI
import SwiftUI

/// Spike: the panel's header from `PanelView`, then the AppKit log in a fixed
/// height, with the held bar and the new-lines pill under it.
struct SpikePanel: View {

    let state: PanelState
    let followsLive: Bool
    let event: (PanelEvent) -> Void
    let select: (PanelState.Held?) -> Void
    let scrolled: (Bool) -> Void

    @Environment(\.colorScheme) private var scheme

    private let config = PanelConfig.glassLedger
    private var tokens: GlassLedger { .for(scheme) }

    var body: some View {

        VStack(spacing: tokens.space12) {

            PanelView(
                state: .init(recording: state.recording, log: .lines(.init(entries: []))),
                event: event
            )

            if case let .lines(lines) = state.log {

                VStack(spacing: tokens.space8) {

                    SpikeLog(
                        lines: lines,
                        followsLive: followsLive,
                        tokens: tokens,
                        lineHeight: config.lineHeight,
                        gutterWidth: config.gutterWidth,
                        select: select,
                        scrolled: scrolled
                    )
                    .frame(height: 260)
                    .overlay(alignment: .bottom) {

                        if lines.newBelow > 0 {

                            Button("\(lines.newBelow) новые ↓") { event(.jumpToLive) }
                                .font(tokens.data(tokens.typeCaption, .semibold))
                                .foregroundStyle(tokens.me)
                                .buttonStyle(.plain)
                                .padding(.vertical, tokens.space2)
                                .padding(.horizontal, tokens.space8)
                                .background(tokens.card, in: .rect(cornerRadius: tokens.radiusCard))
                                .padding(.bottom, tokens.space8)
                        }
                    }

                    if let held = lines.held {

                        Label("«\(held.text)»", systemImage: "pin.fill")
                            .font(tokens.data(tokens.typeSmall))
                            .foregroundStyle(tokens.text)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, tokens.space16)
                            .padding(.bottom, tokens.space8)
                    }
                }
                .frame(width: config.panelWidth)
                .background(tokens.glass, in: .rect(cornerRadius: tokens.radiusPanel))
            }
        }
    }
}
