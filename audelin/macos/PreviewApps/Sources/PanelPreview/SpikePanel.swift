import GlassLedger
import PanelUI
import SwiftUI

/// Spike: the panel's header from `PanelView`, then the AppKit log in a fixed
/// height, with the new-lines pill over it and the held selections under it.
struct SpikePanel: View {

    let state: PanelState
    let followsLive: Bool
    let event: (PanelEvent) -> Void
    let holds: [PanelState.Held]
    let hold: (PanelState.Held) -> Void
    let letGo: (Int) -> Void
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
                        hold: hold,
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

                    ForEach(Array(holds.enumerated()), id: \.offset) { index, held in

                        HStack(spacing: tokens.space6) {

                            Image(systemName: "pin.fill")
                                .foregroundStyle(tokens.me)

                            Text("«\(held.text)»")
                                .foregroundStyle(tokens.text)
                                .lineLimit(1)
                                .truncationMode(.middle)
                                .frame(maxWidth: .infinity, alignment: .leading)

                            Button { letGo(index) } label: {
                                Image(systemName: "xmark")
                                    .foregroundStyle(tokens.gutter)
                            }
                            .buttonStyle(.plain)
                            .help("Отпустить")
                        }
                        .font(tokens.data(tokens.typeSmall))
                        .padding(.horizontal, tokens.space16)
                    }
                }
                .padding(.bottom, holds.isEmpty ? 0 : tokens.space8)
                .frame(width: config.panelWidth)
                .background(tokens.glass, in: .rect(cornerRadius: tokens.radiusPanel))
            }
        }
    }
}
